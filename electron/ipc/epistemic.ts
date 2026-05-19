import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runPrompt } from '../ai/provider';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import { parseFrontmatter } from './frontmatter';
import { atomicWrite, ensureDir, exists, safeName, sanitizeForPrompt, validateVaultPath } from './utils';

const RAW_DIR = 'raw';
const QUESTIONS_DIR = 'questions';
const WIKI_DIR = 'Wiki';
const OUTPUTS_DIR = 'Outputs';
const EPISTEMIC_OUTPUT_DIR = 'epistemic';
const REVIEW_TIMEOUT_MS = 3 * 60 * 1000;

type EpistemicStatus = 'conjecture' | 'hypothesis' | 'falsified' | 'verified';

type NoteRecord = {
  filePath: string;
  relPath: string;
  title: string;
  status?: EpistemicStatus;
  dependencies: string[];
  contradicts: string[];
  wikilinks: string[];
  mtime: number;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function asStatus(value: unknown): EpistemicStatus | undefined {
  return value === 'conjecture' ||
    value === 'hypothesis' ||
    value === 'falsified' ||
    value === 'verified'
    ? value
    : undefined;
}

function titleFrom(raw: string, filePath: string, meta: Record<string, unknown>): string {
  const metaTitle = meta.title;
  if (typeof metaTitle === 'string' && metaTitle.trim()) return metaTitle.trim();
  const h1 = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return h1 || path.basename(filePath, path.extname(filePath));
}

function extractWikilinks(body: string): string[] {
  const out = new Set<string>();
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const target = m[1]?.trim();
    if (target) out.add(target);
  }
  return [...out];
}

function shouldSkipDir(name: string): boolean {
  return (
    name === 'node_modules' ||
    name === '.history' ||
    name === '.trash' ||
    name === 'dist' ||
    name === 'dist-electron' ||
    name === 'release'
  );
}

async function collectMarkdownNotes(root: string): Promise<NoteRecord[]> {
  const notes: NoteRecord[] = [];

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 8) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') && ent.name !== '.trash') continue;
      const full = path.join(dir, ent.name);
      validateVaultPath(full, root);
      if (ent.isDirectory()) {
        if (shouldSkipDir(ent.name)) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile() || !/\.(md|markdown)$/i.test(ent.name)) continue;
      const raw = await fs.readFile(full, 'utf-8').catch(() => '');
      if (!raw) continue;
      const { meta, body } = parseFrontmatter(raw);
      const stat = await fs.stat(full).catch(() => null);
      const m = meta as Record<string, unknown>;
      notes.push({
        filePath: full,
        relPath: path.relative(root, full).replace(/\\/g, '/'),
        title: titleFrom(raw, full, m),
        status: asStatus(m.epistemic_status),
        dependencies: asStringArray(m.dependencies),
        contradicts: asStringArray(m.contradicts),
        wikilinks: extractWikilinks(body),
        mtime: stat?.mtimeMs ?? 0,
      });
    }
  }

  await walk(root);
  return notes;
}

async function writeEpistemicOutput(
  root: string,
  stem: string,
  content: string
): Promise<string> {
  const dir = path.join(root, OUTPUTS_DIR, EPISTEMIC_OUTPUT_DIR);
  await ensureDir(dir);
  const filePath = path.join(dir, `${timestampForFile()}_${safeName(stem) || 'epistemic-report'}.md`);
  validateVaultPath(filePath, root);
  await atomicWrite(filePath, content);
  return filePath;
}

async function getAIContext() {
  const settings = await loadSettings();
  const apiKey = await loadSelectedAiApiKey(settings);
  return {
    provider: settings.aiProvider ?? 'claude',
    authMode: settings.aiAuthMode,
    model: selectedAiModel(settings),
    apiKey: apiKey ?? undefined,
  };
}

function buildClaudeMd(): string {
  return [
    '# ClassNotes 認識論的CI/CD 実行コンテキスト',
    '',
    '## System Constraints',
    '- このVaultは静的な保管庫ではなく、仮説を継続的に検証する研究CI/CD環境である。',
    '- 安易な要約を避け、前提、反証可能性、依存関係、矛盾を常に明示する。',
    '- 一般論だけで完結せず、Vault内のノート、Wiki、Outputs、raw資料との関係を優先する。',
    '',
    '## Required Frontmatter',
    '```yaml',
    'epistemic_status: conjecture # conjecture | hypothesis | falsified | verified',
    'dependencies: []',
    'contradicts: []',
    '```',
    '',
    '## Validation Rules',
    '- `contradicts` がある場合、その矛盾を解消、保留、反証済みのいずれかに分類する。',
    '- `hypothesis` は少なくとも1つの `dependencies` または明示的な検証計画を持つ。',
    '- `verified` は検証方法、観測、限界を本文中に持つ。',
    '- `falsified` は反証条件と次の問いを `questions/` へ接続する。',
    '',
    '## Reviewer Stance',
    '- Reviewer 2として、曖昧な言葉、循環論法、反証不能性、過剰な一般化を優先的に指摘する。',
    '- ただし、批判は次の研究行動に変換できる形で出す。',
    '',
  ].join('\n');
}

function buildConsistencyReport(notes: NoteRecord[]): string {
  const byTitle = new Map<string, NoteRecord>();
  const byStem = new Map<string, NoteRecord>();
  for (const note of notes) {
    byTitle.set(note.title.toLowerCase(), note);
    byStem.set(path.basename(note.relPath, path.extname(note.relPath)).toLowerCase(), note);
  }

  const incoming = new Map<string, number>();
  for (const note of notes) incoming.set(note.relPath, 0);
  for (const note of notes) {
    for (const link of [...note.dependencies, ...note.wikilinks]) {
      const target = byTitle.get(link.toLowerCase()) || byStem.get(link.toLowerCase());
      if (target) incoming.set(target.relPath, (incoming.get(target.relPath) ?? 0) + 1);
    }
  }

  const missingDependencies: string[] = [];
  const staleContradictions: string[] = [];
  const logicIslands: string[] = [];
  const missingStatus: string[] = [];
  const now = Date.now();
  const staleMs = 30 * 24 * 60 * 60 * 1000;

  for (const note of notes) {
    if (!note.status) missingStatus.push(note.relPath);
    for (const dep of note.dependencies) {
      const found = byTitle.get(dep.toLowerCase()) || byStem.get(dep.toLowerCase());
      if (!found) missingDependencies.push(`${note.relPath} -> ${dep}`);
    }
    if (note.contradicts.length > 0 && note.mtime > 0 && now - note.mtime > staleMs) {
      staleContradictions.push(
        `${note.relPath} (${Math.floor((now - note.mtime) / staleMs) * 30}日以上更新なし)`
      );
    }
    const isEpistemic = note.status === 'conjecture' || note.status === 'hypothesis';
    const hasEdges = note.dependencies.length + note.wikilinks.length + (incoming.get(note.relPath) ?? 0) > 0;
    if (isEpistemic && !hasEdges) logicIslands.push(note.relPath);
  }

  return [
    `# 認識論的CI ヘルスチェック (${today()})`,
    '',
    `- 対象ノート: ${notes.length}`,
    `- epistemic_status 未設定: ${missingStatus.length}`,
    `- 未解決の依存関係: ${missingDependencies.length}`,
    `- 長期放置の矛盾: ${staleContradictions.length}`,
    `- 論理の孤島: ${logicIslands.length}`,
    '',
    '## epistemic_status 未設定',
    '',
    ...(missingStatus.length ? missingStatus.map((x) => `- ${x}`) : ['- なし']),
    '',
    '## 未解決の依存関係',
    '',
    ...(missingDependencies.length ? missingDependencies.map((x) => `- ${x}`) : ['- なし']),
    '',
    '## 長期放置の矛盾',
    '',
    ...(staleContradictions.length ? staleContradictions.map((x) => `- ${x}`) : ['- なし']),
    '',
    '## 論理の孤島',
    '',
    ...(logicIslands.length ? logicIslands.map((x) => `- ${x}`) : ['- なし']),
    '',
    '## 次の推奨アクション',
    '',
    '- 重要ノートに `epistemic_status`, `dependencies`, `contradicts` を追加する。',
    '- `hypothesis` のノートは検証計画または反証条件を本文へ明記する。',
    '- `contradicts` があるノートは、Outputsに仮想査読レポートを生成して解消方針を決める。',
    '',
  ].join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEpistemicHandlers(): Record<string, (...args: any[]) => any> {
  return {
    'epistemic:bootstrap': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dirs = [RAW_DIR, QUESTIONS_DIR, WIKI_DIR, OUTPUTS_DIR, path.join(OUTPUTS_DIR, EPISTEMIC_OUTPUT_DIR)];
      const created: string[] = [];
      for (const dir of dirs) {
        const full = path.join(root, dir);
        validateVaultPath(full, root);
        if (!(await exists(full))) created.push(dir.replace(/\\/g, '/'));
        await ensureDir(full);
      }
      const claudePath = path.join(root, 'CLAUDE.md');
      validateVaultPath(claudePath, root);
      if (!(await exists(claudePath))) {
        await atomicWrite(claudePath, buildClaudeMd());
        created.push('CLAUDE.md');
      }
      return { ok: true, created, claudePath };
    },

    'epistemic:peerReview': async (_e: unknown, vaultPath: string, filePath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const full = validateVaultPath(filePath, root);
      const raw = await fs.readFile(full, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const m = meta as Record<string, unknown>;
      const title = titleFrom(raw, full, m);
      const ctx = await getAIContext();
      const prompt = [
        'あなたは厳格な仮想査読者です。以下のノートをReviewer 2として査読してください。',
        '',
        '出力条件:',
        '- 反証可能性、前提、依存関係、矛盾、検証計画を必ず見る',
        '- 批判だけで終わらず、次の研究アクションへ変換する',
        '- Markdownで出力する',
        '',
        `タイトル: ${title}`,
        `Frontmatter: ${JSON.stringify(m, null, 2)}`,
        '',
        '本文:',
        sanitizeForPrompt(body, 24_000),
      ].join('\n');
      const result = await runPrompt(ctx.provider, {
        authMode: ctx.authMode,
        prompt,
        cwd: root,
        timeoutMs: REVIEW_TIMEOUT_MS,
        model: ctx.model,
        apiKey: ctx.apiKey,
      });
      if (!result.ok) return { ok: false, error: result.error };
      const report = [
        `# 仮想査読: ${title}`,
        '',
        `- Source: ${path.relative(root, full).replace(/\\/g, '/')}`,
        `- Generated: ${new Date().toISOString()}`,
        '',
        result.text.trim(),
        '',
      ].join('\n');
      const outputPath = await writeEpistemicOutput(root, `peer_review_${title}`, report);
      return { ok: true, filePath: outputPath };
    },

    'epistemic:mapIsomorphism': async (_e: unknown, vaultPath: string, leftPath: string, rightPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const leftFull = validateVaultPath(leftPath, root);
      const rightFull = validateVaultPath(rightPath, root);
      const leftRaw = await fs.readFile(leftFull, 'utf-8');
      const rightRaw = await fs.readFile(rightFull, 'utf-8');
      const leftParsed = parseFrontmatter(leftRaw);
      const rightParsed = parseFrontmatter(rightRaw);
      const leftTitle = titleFrom(leftRaw, leftFull, leftParsed.meta as Record<string, unknown>);
      const rightTitle = titleFrom(rightRaw, rightFull, rightParsed.meta as Record<string, unknown>);
      const ctx = await getAIContext();
      const prompt = [
        'あなたは構造的同型性を探す研究支援エンジンです。',
        '表面的な類似ではなく、抽象構造、写像、保存される性質、破綻する条件を分析してください。',
        '',
        '出力セクション:',
        '1. 共有構造',
        '2. 対応表',
        '3. 保存される性質',
        '4. 同型でない点',
        '5. 新しい仮説',
        '',
        `## A: ${leftTitle}`,
        sanitizeForPrompt(leftParsed.body, 12_000),
        '',
        `## B: ${rightTitle}`,
        sanitizeForPrompt(rightParsed.body, 12_000),
      ].join('\n');
      const result = await runPrompt(ctx.provider, {
        authMode: ctx.authMode,
        prompt,
        cwd: root,
        timeoutMs: REVIEW_TIMEOUT_MS,
        model: ctx.model,
        apiKey: ctx.apiKey,
      });
      if (!result.ok) return { ok: false, error: result.error };
      const report = [
        `# 構造的同型性マップ: ${leftTitle} ↔ ${rightTitle}`,
        '',
        `- A: ${path.relative(root, leftFull).replace(/\\/g, '/')}`,
        `- B: ${path.relative(root, rightFull).replace(/\\/g, '/')}`,
        `- Generated: ${new Date().toISOString()}`,
        '',
        result.text.trim(),
        '',
      ].join('\n');
      const outputPath = await writeEpistemicOutput(root, `isomorphism_${leftTitle}_${rightTitle}`, report);
      return { ok: true, filePath: outputPath };
    },

    'epistemic:checkConsistency': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const notes = await collectMarkdownNotes(root);
      const report = buildConsistencyReport(notes);
      const outputPath = await writeEpistemicOutput(root, 'consistency_check', report);
      return { ok: true, filePath: outputPath, noteCount: notes.length };
    },
  };
}

export function registerEpistemicHandlers() {
  const handlers = createEpistemicHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
