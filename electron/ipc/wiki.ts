// Wiki / Outputs (Second Brain) IPC handlers.
//
// Layered Knowledge Architecture (Karpathy式):
//   raw   → 科目ノート / Books / Memos (existing)
//   wiki  → AI-curated topical pages under <vault>/Wiki/
//   outputs → generated artefacts (reports, exports) under <vault>/Outputs/
//
// All file writes go through atomicWrite + validateVaultPath.
// Compile / health-check (Phase 3 / 5) is added in this same module.
import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  validateVaultPath,
  getCurrentVaultPath,
  atomicWrite,
  ensureDir,
  exists,
  safeName,
  sanitizeForPrompt,
} from './utils';
import { runPrompt } from '../ai/provider';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import { getBacklinkSources } from './backlinks';
import { logger } from '../logger';

// Strip the YAML frontmatter (---\n…\n---\n) at the start of a wiki note so
// the preview shows actual prose. Returns the original string unchanged if
// no frontmatter is detected.
function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return text;
  return text.slice(end + 4).replace(/^\s+/, '');
}

// Pull the first paragraph as a one-line preview. Markdown headings and
// blank lines are skipped so the preview is the first real content line.
// Capped at 200 chars so cards stay uniform in the grid.
function firstParagraphPreview(body: string): string {
  const para = body
    .split(/\n\s*\n/) // paragraph break
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'));
  if (!para) return '';
  // Collapse interior newlines to single spaces and trim long previews.
  const oneLine = para.replace(/\s+/g, ' ');
  return oneLine.length > 200 ? `${oneLine.slice(0, 197)}…` : oneLine;
}

// Count distinct [[wikilink]] targets in a wiki page. Embeds (![[...]])
// are counted too — both represent "this entry references that source".
function countWikilinks(body: string): number {
  const targets = new Set<string>();
  const re = /!?\[\[([^\]|]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) targets.add(m[1].trim());
  return targets.size;
}

/**
 * Push a progress event to every open window. The renderer subscribes via
 * preload (`wiki.onCompileProgress`) to drive a live progress UI instead of a
 * 5-minute frozen spinner. Stages: `collecting` → `prompting` → `streaming` →
 * `writing` → `done`. `bytes` accumulates the stdout size during streaming.
 */
function emitCompileProgress(
  channel: 'wiki:compile:progress' | 'wiki:health:progress',
  payload: {
    stage: 'collecting' | 'prompting' | 'streaming' | 'writing' | 'done';
    message?: string;
    bytes?: number;
  }
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload);
    } catch {
      // ignore: window may be closing
    }
  }
}

const WIKI_DIR = 'Wiki';
const OUTPUTS_DIR = 'Outputs';
const WIKI_SCHEMA_FILE = 'WIKI_SCHEMA.md';
// Sidecar JSON tracking the mtime of each Wiki page right after the last AI
// compile. On the next compile, if the on-disk mtime drifted from this stored
// value, the file was probably edited by hand — we surface a confirmation
// before overwriting so the user doesn't silently lose manual additions.
const COMPILE_META_FILE = '.classnotes-compile.json';
// 5 ms tolerance: chokidar / antivirus / OS metadata updates can shift mtime
// by sub-ms amounts even when content is identical. We don't want to flag
// these as "manual edits".
const MTIME_DRIFT_TOLERANCE_MS = 5;

type CompileMeta = Record<string, { mtime: number; compiledAt: number }>;

async function readCompileMeta(metaPath: string): Promise<CompileMeta> {
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as CompileMeta;
  } catch {
    // missing or malformed — start fresh
  }
  return {};
}

// Per-chunk and total caps for the AI compile prompt. Generous enough that
// short notes are unaffected, tight enough to fit Claude's input budget.
const PER_CHUNK_LIMIT = 8_000;
const TOTAL_RAW_LIMIT = 80_000;
const HEALTH_INPUT_LIMIT = 60_000;
const COMPILE_TIMEOUT_MS = 5 * 60 * 1000;

const RESERVED_DIRS = new Set([WIKI_DIR, OUTPUTS_DIR, 'Books', 'Memos', '_templates', '.history', '.git']);

const DEFAULT_SCHEMA = `# Wiki 生成ルール

## 基本方針
- 各トピックページには必ず「概要」セクションを含める
- 関連トピックへの [[wikilink]] を末尾に記載する
- 出典 (ノートファイル名) を各ページの末尾に記載する
- 重複情報は統合し、最も詳しい情報を優先する

## ページ構成
1. 概要 (3行以内)
2. 詳細
3. 関連トピック ([[リンク]]形式)
4. 出典

## カテゴリ
授業ノート、読書メモ、アイデアの3カテゴリに分類する
`;

type RawChunk = { source: string; content: string; mtime: number };

async function collectRaw(vaultPath: string, scope: 'all' | string): Promise<RawChunk[]> {
  const root = path.resolve(vaultPath);
  validateVaultPath(root, root);
  const chunks: RawChunk[] = [];

  const subjectDirs = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const dir of subjectDirs) {
    if (!dir.isDirectory()) continue;
    if (dir.name.startsWith('.')) continue;
    if (RESERVED_DIRS.has(dir.name)) continue;
    if (scope !== 'all' && scope !== dir.name) continue;
    const notesDir = path.join(root, dir.name, 'notes');
    if (!(await exists(notesDir))) continue;
    validateVaultPath(notesDir, root);
    const files = await fs.readdir(notesDir).catch(() => [] as string[]);
    for (const f of files.filter((f) => f.endsWith('.md'))) {
      const full = path.join(notesDir, f);
      validateVaultPath(full, root);
      try {
        const stat = await fs.stat(full);
        const content = await fs.readFile(full, 'utf-8');
        chunks.push({ source: `${dir.name}/${f}`, content, mtime: stat.mtimeMs });
      } catch {
        // skip unreadable
      }
    }
  }

  // Books (excluding _reading.md sidecars) — only when scope = 'all'
  if (scope === 'all') {
    const booksDir = path.join(root, 'Books');
    if (await exists(booksDir)) {
      const files = await fs.readdir(booksDir).catch(() => [] as string[]);
      for (const f of files.filter((f) => f.endsWith('.md') && !f.endsWith('_reading.md'))) {
        const full = path.join(booksDir, f);
        validateVaultPath(full, root);
        try {
          const stat = await fs.stat(full);
          const content = await fs.readFile(full, 'utf-8');
          chunks.push({ source: `Books/${f}`, content, mtime: stat.mtimeMs });
        } catch {
          // skip
        }
      }
    }
  }

  // Memos
  if (scope === 'all') {
    const memosDir = path.join(root, 'Memos');
    if (await exists(memosDir)) {
      const files = await fs.readdir(memosDir).catch(() => [] as string[]);
      for (const f of files.filter((f) => f.endsWith('.md'))) {
        const full = path.join(memosDir, f);
        validateVaultPath(full, root);
        try {
          const stat = await fs.stat(full);
          const content = await fs.readFile(full, 'utf-8');
          chunks.push({ source: `Memos/${f}`, content, mtime: stat.mtimeMs });
        } catch {
          // skip
        }
      }
    }
  }

  return chunks;
}

export function buildRawText(chunks: RawChunk[]): string {
  // Sort by mtime desc so freshest content lands inside the budget.
  // We drop entire chunks rather than truncating mid-note.
  const sorted = [...chunks].sort((a, b) => b.mtime - a.mtime);
  const parts: string[] = [];
  let total = 0;
  for (const c of sorted) {
    const trimmed =
      c.content.length > PER_CHUNK_LIMIT ? c.content.slice(0, PER_CHUNK_LIMIT) + '\n...(略)' : c.content;
    const block = `## ${c.source}\n\n${trimmed}`;
    if (total + block.length > TOTAL_RAW_LIMIT) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n\n---\n\n');
}

export function parseWikiOutput(output: string): Record<string, string> {
  const pages: Record<string, string> = {};
  // Split on lines starting with "### " — these mark each page's filename.
  const sections = output.split(/^### /m).filter(Boolean);
  for (const section of sections) {
    const firstLineEnd = section.indexOf('\n');
    if (firstLineEnd < 0) continue;
    const firstLine = section.slice(0, firstLineEnd).trim();
    const rawName = firstLine.replace(/^#+\s*/, '').trim();
    if (!rawName) continue;
    const fileName = rawName.endsWith('.md') ? rawName : `${rawName}.md`;
    const safe = safeName(fileName.replace(/\.md$/, '')) + '.md';
    if (safe === '.md') continue;
    const body = section.slice(firstLineEnd + 1).trim();
    if (body.length < 50) continue; // skip suspicious tiny outputs
    pages[safe] = body;
  }
  return pages;
}

async function listSubjects(vaultPath: string): Promise<string[]> {
  const root = path.resolve(vaultPath);
  validateVaultPath(root, root);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !RESERVED_DIRS.has(e.name))
    .map((e) => e.name);
}

/**
 * IPC handler table of contents (Phase 2-D logical sectioning):
 *
 *   Wiki I/O ........... wiki:list, wiki:read, wiki:write, wiki:readIndex
 *   Outputs .......... .. wiki:saveOutput
 *   Schema ............. wiki:getSchema, wiki:setSchema, wiki:collectRaw
 *   Compilation ........ wiki:compile (long-running, emits wiki:compile:progress)
 *   Health check ....... wiki:healthCheck (emits wiki:health:progress)
 */
export function createWikiHandlers() {
  return {
    // ===== Wiki I/O =====
    'wiki:list': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, WIKI_DIR);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== WIKI_SCHEMA_FILE)
          .map(async (e) => {
            const full = path.join(dir, e.name);
            const stat = await fs.stat(full).catch(() => null);
            return {
              name: e.name,
              filePath: full,
              mtime: stat ? stat.mtimeMs : 0,
            };
          })
      );
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    // Enriched version of wiki:list. For each page returns the file metadata
    // PLUS a first-paragraph preview, a count of distinct [[wikilink]]
    // targets in the body (the page's "sources"), and a count of vault notes
    // that link back to this page ("backlinks"). Used by the WikiView card
    // grid so each entry shows the canonical HANDOFF "updated · N sources ·
    // N backlinks" meta line without the renderer needing to read every file.
    'wiki:listEntries': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, WIKI_DIR);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== WIKI_SCHEMA_FILE)
          .map(async (e) => {
            const full = path.join(dir, e.name);
            const baseName = e.name.replace(/\.md$/, '');
            const [stat, raw, backlinks] = await Promise.all([
              fs.stat(full).catch(() => null),
              fs.readFile(full, 'utf-8').catch(() => ''),
              getBacklinkSources(root, baseName).catch(() => []),
            ]);
            const body = stripFrontmatter(raw);
            return {
              name: e.name,
              filePath: full,
              mtime: stat ? stat.mtimeMs : 0,
              preview: firstParagraphPreview(body),
              sourceCount: countWikilinks(body),
              backlinkCount: backlinks.length,
            };
          })
      );
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    // Read a specific page
    'wiki:read': async (_e: unknown, vaultPath: string, fileName: string) => {
      const root = path.resolve(vaultPath);
      const full = path.join(root, WIKI_DIR, safeName(fileName));
      validateVaultPath(full, root);
      if (!(await exists(full))) return '';
      return fs.readFile(full, 'utf-8');
    },

    // Write/overwrite a wiki page
    'wiki:write': async (_e: unknown, vaultPath: string, fileName: string, content: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, WIKI_DIR);
      await ensureDir(dir);
      const cleaned = safeName(fileName.replace(/\.md$/, '')) || 'page';
      const full = path.join(dir, `${cleaned}.md`);
      validateVaultPath(full, root);
      await atomicWrite(full, typeof content === 'string' ? content : '');
      return { ok: true, filePath: full };
    },

    'wiki:readIndex': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      const full = path.join(root, WIKI_DIR, 'INDEX.md');
      validateVaultPath(full, root);
      if (!(await exists(full))) return null;
      return fs.readFile(full, 'utf-8');
    },

    'wiki:saveOutput': async (_e: unknown, vaultPath: string, fileName: string, content: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, OUTPUTS_DIR);
      await ensureDir(dir);
      const date = new Date().toISOString().slice(0, 10);
      const cleaned = safeName(fileName.replace(/\.md$/, '')) || 'output';
      const full = path.join(dir, `${date}_${cleaned}.md`);
      validateVaultPath(full, root);
      await atomicWrite(full, typeof content === 'string' ? content : '');
      return { ok: true, filePath: full };
    },

    // Outputs list (Phase 2 surfacing)
    'outputs:list': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, OUTPUTS_DIR);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .map(async (e) => {
            const full = path.join(dir, e.name);
            const stat = await fs.stat(full).catch(() => null);
            return {
              name: e.name,
              filePath: full,
              mtime: stat ? stat.mtimeMs : 0,
            };
          })
      );
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    'wiki:collectRaw': async (_e: unknown, vaultPath: string, scope: string) => {
      const chunks = await collectRaw(vaultPath, scope || 'all');
      return chunks.map((c) => ({ source: c.source, content: c.content, mtime: c.mtime }));
    },

    // ---- Schema ----

    'wiki:getSchema': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      const full = path.join(root, WIKI_DIR, WIKI_SCHEMA_FILE);
      validateVaultPath(full, root);
      if (!(await exists(full))) return DEFAULT_SCHEMA;
      return fs.readFile(full, 'utf-8');
    },

    'wiki:setSchema': async (_e: unknown, vaultPath: string, schema: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, WIKI_DIR);
      await ensureDir(dir);
      const full = path.join(dir, WIKI_SCHEMA_FILE);
      validateVaultPath(full, root);
      await atomicWrite(full, typeof schema === 'string' ? schema : DEFAULT_SCHEMA);
      return { ok: true };
    },

    // ---- Phase 3: AI compile ----

    'wiki:compile': async (
      _e: unknown,
      vaultPath: string,
      scope: string,
      overwriteManuallyEdited?: boolean
    ) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);

      emitCompileProgress('wiki:compile:progress', {
        stage: 'collecting',
        message: 'ノートを収集中…',
      });

      const settings = await loadSettings();
      const apiKey = await loadSelectedAiApiKey(settings);

      const chunks = await collectRaw(vaultPath, scope || 'all');
      if (chunks.length === 0) {
        return { ok: false, error: '対象のノートが見つかりません' };
      }

      emitCompileProgress('wiki:compile:progress', {
        stage: 'prompting',
        message: `${chunks.length} 件のノートを AI に送信中…`,
      });

      const schemaPath = path.join(root, WIKI_DIR, WIKI_SCHEMA_FILE);
      const schema = (await exists(schemaPath))
        ? await fs.readFile(schemaPath, 'utf-8')
        : DEFAULT_SCHEMA;

      const rawText = buildRawText(chunks);
      const safeRaw = sanitizeForPrompt(rawText, TOTAL_RAW_LIMIT + 1000);

      const prompt = `以下のルールに従って、提供された素材から Wiki ページ群を生成してください。

${schema}

---

## 素材

${safeRaw}

---

## 出力形式

以下のフォーマットを厳密に守ってください。各ページの先頭に \`### {ファイル名}.md\` を書き、その下にページ本文を続けてください。

### INDEX.md
（目次ファイルの内容）

### {トピック名}.md
（各トピックページの内容）

各ページは上記の構成ルールに従って作成し、関連するノートへの [[wikilink]] を含めてください。`;

      const result = await runPrompt(settings.aiProvider ?? 'claude', {
        authMode: settings.aiAuthMode,
        prompt,
        cwd: root,
        timeoutMs: COMPILE_TIMEOUT_MS,
        model: selectedAiModel(settings),
        apiKey: apiKey ?? undefined,
        onEvent: (e) => {
          if (e.type === 'chunk') {
            emitCompileProgress('wiki:compile:progress', {
              stage: 'streaming',
              message: `AI が応答中… (chunk +${e.text.length})`,
            });
          }
        },
      });

      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      emitCompileProgress('wiki:compile:progress', {
        stage: 'writing',
        message: 'Wiki ページを書き出し中…',
      });
      const pages = parseWikiOutput(result.text);
      if (Object.keys(pages).length === 0) {
        return { ok: false, error: 'AI 出力からページを抽出できませんでした' };
      }
      const dir = path.join(root, WIKI_DIR);
      await ensureDir(dir);

      const metaPath = path.join(dir, COMPILE_META_FILE);
      const meta = await readCompileMeta(metaPath);
      const manuallyEdited: string[] = [];
      if (!overwriteManuallyEdited) {
        for (const fileName of Object.keys(pages)) {
          const full = path.join(dir, fileName);
          if (!(await exists(full))) continue;
          const stat = await fs.stat(full).catch(() => null);
          if (!stat) continue;
          const recorded = meta[fileName]?.mtime;
          if (recorded === undefined) {
            manuallyEdited.push(fileName);
          } else if (Math.abs(stat.mtimeMs - recorded) > MTIME_DRIFT_TOLERANCE_MS) {
            manuallyEdited.push(fileName);
          }
        }
        if (manuallyEdited.length > 0) {
          return {
            ok: false,
            conflict: true,
            manuallyEdited,
            message:
              '次のページは前回のコンパイル後に変更されています。上書きすると変更が失われます。',
          };
        }
      }

      let count = 0;
      const newMeta: CompileMeta = { ...meta };
      const compiledAt = Date.now();
      for (const [fileName, body] of Object.entries(pages)) {
        const full = path.join(dir, fileName);
        try {
          validateVaultPath(full, root);
          await atomicWrite(full, body);
          count += 1;
          const stat = await fs.stat(full).catch(() => null);
          if (stat) {
            newMeta[fileName] = { mtime: stat.mtimeMs, compiledAt };
          }
        } catch (err) {
          logger.warn('[wiki:compile] page write failed', { fileName, error: err });
        }
      }
      try {
        await atomicWrite(metaPath, JSON.stringify(newMeta, null, 2));
      } catch {
        // metadata is best-effort
      }
      emitCompileProgress('wiki:compile:progress', {
        stage: 'done',
        message: `${count} ページを生成しました`,
      });
      return { ok: true, pageCount: count };
    },

    // ---- Phase 4: QA log import ----

    'wiki:importFromQALogs': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const subjects = await listSubjects(vaultPath);
      const wikiDir = path.join(root, WIKI_DIR);
      await ensureDir(wikiDir);
      const imported: string[] = [];
      const date = new Date().toLocaleDateString('ja-JP');
      for (const subject of subjects) {
        const logPath = path.join(root, subject, 'qa', 'log.md');
        if (!(await exists(logPath))) continue;
        validateVaultPath(logPath, root);
        let log = '';
        try {
          log = await fs.readFile(logPath, 'utf-8');
        } catch {
          continue;
        }
        const fileName = `${safeName(subject)}_QAまとめ.md`;
        const full = path.join(wikiDir, fileName);
        validateVaultPath(full, root);
        const content = `# ${subject} Q&A まとめ\n\n> QA ログから自動インポート (${date})\n\n${log}`;
        await atomicWrite(full, content);
        imported.push(fileName);
      }
      return { ok: true, imported };
    },

    // ---- Phase 5: Health check ----

    'wiki:healthCheck': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const wikiDir = path.join(root, WIKI_DIR);
      if (!(await exists(wikiDir))) {
        return { ok: false, error: 'Wiki がまだ存在しません' };
      }

      const settings = await loadSettings();
      const apiKey = await loadSelectedAiApiKey(settings);

      const files = await fs.readdir(wikiDir);
      const wikiPages: { name: string; content: string }[] = [];
      for (const f of files.filter((f) => f.endsWith('.md') && f !== WIKI_SCHEMA_FILE)) {
        const full = path.join(wikiDir, f);
        try {
          validateVaultPath(full, root);
          wikiPages.push({ name: f, content: await fs.readFile(full, 'utf-8') });
        } catch {
          // skip
        }
      }
      if (wikiPages.length === 0) {
        return { ok: false, error: 'Wiki ページが空です。先に「Wiki をコンパイル」してください' };
      }

      const wikiText = wikiPages
        .map((p) => `## ${p.name}\n\n${p.content}`)
        .join('\n\n---\n\n')
        .slice(0, HEALTH_INPUT_LIMIT);

      const prompt = `以下のナレッジベース (Wiki) をレビューして、ヘルスチェックレポートを作成してください。

チェック項目:
1. 矛盾している情報 (2 つのページで相反する内容が書かれていないか)
2. 重要なトピックの抜け漏れ (INDEX.md に記載があるが、対応するページが存在しないなど)
3. 出典が不明な主張 (根拠のない断言)
4. 古くなっている可能性がある情報
5. 改善提案 (追加すべきトピック、整理方法の提案)

---

${sanitizeForPrompt(wikiText, HEALTH_INPUT_LIMIT + 1000)}

---

日本語でレポートを作成してください。`;

      emitCompileProgress('wiki:health:progress', { stage: 'prompting', message: '解析を開始しました' });

      const result = await runPrompt(settings.aiProvider ?? 'claude', {
        authMode: settings.aiAuthMode,
        prompt,
        cwd: root,
        timeoutMs: COMPILE_TIMEOUT_MS,
        model: selectedAiModel(settings),
        apiKey: apiKey ?? undefined,
        onEvent: (e) => {
          if (e.type === 'chunk') {
            emitCompileProgress('wiki:health:progress', {
              stage: 'streaming',
              message: 'AI が応答中…',
            });
          }
        },
      });

      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      const date = new Date().toISOString().slice(0, 10);
      const fileName = `${date}_ヘルスチェックレポート.md`;
      const outputsDir = path.join(root, OUTPUTS_DIR);
      await ensureDir(outputsDir);
      const reportPath = path.join(outputsDir, fileName);
      try {
        validateVaultPath(reportPath, root);
      } catch (err) {
        return { ok: false, error: String(err) };
      }
      const report = `# Wiki ヘルスチェックレポート (${date})\n\n${result.text.trim()}\n`;
      await atomicWrite(reportPath, report);
      emitCompileProgress('wiki:health:progress', { stage: 'done', message: '完了' });
      return { ok: true, reportPath, report };
    },
  };
}

export function registerWikiHandlers() {
  const handlers = createWikiHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}

// Suppress unused warning when getCurrentVaultPath is not used directly.
void getCurrentVaultPath;
