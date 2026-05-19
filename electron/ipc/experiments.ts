import { dialog, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseFrontmatter } from './frontmatter';
import { atomicWrite, ensureDir, exists, safeName, validateVaultPath } from './utils';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import { runPrompt } from '../ai/provider';
import { consumeFileAccessGrant, createFileAccessGrant } from './file-access';
import { extractPdfTextFromBuffer, imageOnlyPdfError } from '../pdf-text';

type ExperimentEntry = {
  filePath: string;
  title: string;
  status?: string;
  dataset?: string;
  model?: string;
  parent?: string;
  mtime: number;
};

const OUTPUTS_DIR = 'Outputs';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeOutputSegment(segment: string): string {
  const cleaned = safeName(segment.replace(/\.(md|json|txt|mk|makefile)$/i, '')) || 'output';
  return cleaned.slice(0, 120);
}

async function writeOutputFile(
  root: string,
  relativeParts: string[],
  fileName: string,
  content: string | Buffer
): Promise<string> {
  const base = path.join(root, OUTPUTS_DIR, ...relativeParts.map(normalizeOutputSegment));
  await ensureDir(base);
  const ext = path.extname(fileName) || '.md';
  const stem = normalizeOutputSegment(path.basename(fileName, ext));
  const full = path.join(base, `${stem}${ext}`);
  validateVaultPath(full, root);
  await atomicWrite(full, content);
  return full;
}

function asString(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

async function collectExperiments(root: string): Promise<ExperimentEntry[]> {
  const out: ExperimentEntry[] = [];
  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 7) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      validateVaultPath(full, root);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === OUTPUTS_DIR) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile() || !/\.(md|markdown)$/i.test(ent.name)) continue;
      try {
        const raw = await fs.readFile(full, 'utf-8');
        const { meta, body } = parseFrontmatter(raw);
        const m = meta as Record<string, unknown>;
        if (m.type !== 'experiment') continue;
        const stat = await fs.stat(full);
        const title =
          asString(m, 'title') ||
          body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
          path.basename(ent.name, path.extname(ent.name));
        out.push({
          filePath: full,
          title,
          status: asString(m, 'status'),
          dataset: asString(m, 'dataset'),
          model: asString(m, 'model'),
          parent:
            asString(m, 'parent') ||
            asString(m, 'parentExperiment') ||
            asString(m, 'baseline') ||
            asString(m, 'derivedFrom'),
          mtime: stat.mtimeMs,
        });
      } catch {
        // skip unreadable notes
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => b.mtime - a.mtime);
}

function mermaidId(index: number): string {
  return `e${index}`;
}

function buildLineageReport(experiments: ExperimentEntry[]): string {
  const byTitle = new Map<string, number>();
  experiments.forEach((e, i) => byTitle.set(e.title.toLowerCase(), i));
  const lines = ['flowchart TD'];
  experiments.forEach((e, i) => {
    const label = [e.title, e.status ? `status: ${e.status}` : '', e.model ? `model: ${e.model}` : '']
      .filter(Boolean)
      .join('\\n')
      .replace(/"/g, '\\"');
    lines.push(`  ${mermaidId(i)}["${label}"]`);
  });
  experiments.forEach((e, i) => {
    if (!e.parent) return;
    const parentIdx = byTitle.get(e.parent.toLowerCase());
    if (parentIdx !== undefined) {
      lines.push(`  ${mermaidId(parentIdx)} --> ${mermaidId(i)}`);
    }
  });
  if (lines.length === 1) lines.push('  empty["実験ノートがまだありません"]');

  const table = experiments
    .map((e) =>
      `| ${e.title} | ${e.status ?? ''} | ${e.dataset ?? ''} | ${e.model ?? ''} | ${e.parent ?? ''} |`
    )
    .join('\\n');
  return [
    `# 実験系譜レポート (${today()})`,
    '',
    '```mermaid',
    lines.join('\\n'),
    '```',
    '',
    '| 実験 | status | dataset | model | parent |',
    '|---|---|---|---|---|',
    table || '| なし | | | | |',
    '',
    '## 読み方',
    '',
    '- `parent` / `parentExperiment` / `baseline` / `derivedFrom` のいずれかをfrontmatterに入れると、系譜グラフの辺として表示されます。',
    '- 各実験ノートは `type: experiment` のfrontmatterを持つMarkdownとして管理されます。',
    '',
  ].join('\\n');
}

export function createExperimentHandlers() {
  return {
    'experiments:list': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      return collectExperiments(root);
    },

    'experiments:generateReproPackage': async (_e: unknown, vaultPath: string, filePath: string) => {
    const root = path.resolve(vaultPath);
    validateVaultPath(root, root);
    validateVaultPath(filePath, root);
    if (!(await exists(filePath))) return { ok: false, error: 'experiment not found' };

    const raw = await fs.readFile(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const m = meta as Record<string, unknown>;
    const title =
      asString(m, 'title') ||
      body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      path.basename(filePath, path.extname(filePath));
    const packageDir = `${today()}_${safeName(title) || 'experiment'}_repro`;
    const parts = ['repro', packageDir];
    const experimentJson = JSON.stringify({ ...m, sourceFile: filePath }, null, 2);
    const requirements = [
      '# Reproducibility package',
      `# Source: ${path.basename(filePath)}`,
      '# Add project dependencies below.',
      '',
      '# torch',
      '# numpy',
      '# pandas',
      '',
    ].join('\\n');
    const makefile = [
      '.PHONY: setup run report',
      '',
      'setup:',
      '\\tpip install -r requirements.txt',
      '',
      'run:',
      `\\tpython train.py --seed ${typeof m.seed === 'number' ? m.seed : 0}`,
      '',
      'report:',
      '\\tpython tools/compare_metrics.py experiment.json',
      '',
    ].join('\\n');
    const readme = [
      `# ${title} 再現性パッケージ`,
      '',
      `- Source: ${filePath}`,
      `- Generated: ${new Date().toISOString()}`,
      `- Dataset: ${asString(m, 'dataset') ?? ''}`,
      `- Model: ${asString(m, 'model') ?? ''}`,
      '',
      '## 手順',
      '',
      '1. `make setup`',
      '2. `make run`',
      '3. `make report`',
      '',
    ].join('\\n');
    const files = [
      await writeOutputFile(root, parts, 'experiment.json', experimentJson),
      await writeOutputFile(root, parts, 'requirements.txt', requirements),
      await writeOutputFile(root, parts, 'Makefile', makefile),
      await writeOutputFile(root, parts, 'README.md', readme),
    ];
      return { ok: true, outputDir: path.dirname(files[0]), files };
    },

    'experiments:generateLineageReport': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const experiments = await collectExperiments(root);
      const report = buildLineageReport(experiments);
      const filePath = await writeOutputFile(root, [], `${today()}_experiment_lineage.md`, report);
      return { ok: true, filePath, count: experiments.length };
    },

    'experiments:pickPDFFile': async (e: unknown) => {
      const result = await dialog.showOpenDialog({
        title: 'Markdown化する PDF を選択',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return createFileAccessGrant(result.filePaths[0], 'pdf-markdown', (e as { sender: { id: number } }).sender.id);
    },

    'experiments:pdfToMarkdown': async (e: unknown, vaultPath: string, token: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      let pdfPath: string;
      try {
        pdfPath = await consumeFileAccessGrant(token, 'pdf-markdown', (e as { sender: { id: number } }).sender.id);
      } catch {
        return { ok: false, error: 'PDF ファイルのアクセス許可が無効です。もう一度選択してください' };
      }
      if (!(await exists(pdfPath))) return { ok: false, error: 'PDF が見つかりません' };
      const settings = await loadSettings();
      if (settings.aiProvider === 'none') {
        return { ok: false, error: 'AI 機能が無効です。Settings から有効にしてください。' };
      }
      const apiKey = await loadSelectedAiApiKey(settings);
      if (settings.aiAuthMode === 'api-key' && !apiKey) {
        return { ok: false, error: '選択中プロバイダーの API キーが未設定です' };
      }
      const stat = await fs.stat(pdfPath);
      if (stat.size > 30 * 1024 * 1024) {
        return { ok: false, error: 'PDF が 30 MB を超えています' };
      }
      const pdfBytes = await fs.readFile(pdfPath);
      const base64 = pdfBytes.toString('base64');
      let prompt = [
        'このPDFをObsidian互換のMarkdownへ変換してください。',
        '条件:',
        '- 見出し階層を保つ',
        '- 表はMarkdown表にする',
        '- 数式はLaTeX記法をできるだけ保つ',
        '- 図表は `[図: 説明]` のように説明を残す',
        '- 出力はMarkdown本文のみ',
      ].join('\\n');
      const documents =
        settings.aiAuthMode === 'api-key'
          ? [{ base64, mediaType: 'application/pdf' as const, fileName: path.basename(pdfPath) }]
          : undefined;
      if (settings.aiAuthMode === 'login') {
        const extracted = (await extractPdfTextFromBuffer(pdfBytes).catch(() => ({ text: '', pageCount: 0 }))).text;
        if (extracted.trim().length < 200) {
          return { ok: false, error: imageOnlyPdfError() };
        }
        prompt = `${prompt}\n\n---\n\n以下はローカルで抽出した PDF テキストです。このテキストだけをMarkdown化してください。\n\n${extracted.slice(0, 160_000)}`;
      }
      const result = await runPrompt(settings.aiProvider, {
        authMode: settings.aiAuthMode,
        prompt,
        apiKey: apiKey ?? undefined,
        model: selectedAiModel(settings),
        timeoutMs: 5 * 60 * 1000,
        documents,
      });
      if (!result.ok) return { ok: false, error: result.error };
      const title = path.basename(pdfPath, path.extname(pdfPath));
      const content = [
        '---',
        'type: pdf-import',
        `sourcePdf: ${JSON.stringify(path.basename(pdfPath))}`,
        `created: ${today()}`,
        'tags: [pdf-import]',
        '---',
        '',
        `# ${title}`,
        '',
        result.text.trim(),
        '',
      ].join('\\n');
      const filePath = await writeOutputFile(root, ['pdf-imports'], `${today()}_${title}.md`, content);
      return { ok: true, filePath, title };
    },
  };
}

export function registerExperimentHandlers() {
  const handlers = createExperimentHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
