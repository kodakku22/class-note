import * as fs from 'fs/promises';
import * as path from 'path';
import { parseFrontmatter } from '../ipc/frontmatter';
import { validateVaultPath } from '../ipc/utils';

const RESERVED_DIRS = new Set([
  '.git',
  '.history',
  '.trash',
  '.classnotes',
  'node_modules',
  'dist',
  'dist-electron',
  'release',
]);

export type InteropReport = {
  ok: true;
  obsidian: {
    hasConfigDir: boolean;
    markdownFiles: number;
    filesWithFrontmatter: number;
    wikilinkCount: number;
    tagCount: number;
    notesMissingFrontmatter: string[];
    brokenWikilinks: Array<{ relPath: string; target: string }>;
    warnings: string[];
  };
  zotero: {
    hasRefsBib: boolean;
    refsBibEntries: number;
    paperFiles: number;
    papersWithBibkey: number;
    papersWithDoi: number;
    papersMissingBibkey: string[];
    papersMissingDoi: string[];
    bibkeysMissingFromRefsBib: string[];
    duplicateBibkeys: string[];
    warnings: string[];
  };
  repairActions: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error';
    area: 'obsidian' | 'zotero';
    title: string;
    description: string;
    relPath?: string;
    dryRunOnly: true;
    manualSteps: string[];
  }>;
  recommendations: string[];
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.obsidian') {
        continue;
      }
      if (entry.isDirectory()) {
        if (RESERVED_DIRS.has(entry.name) || entry.name === '.obsidian') continue;
        await walk(path.join(dir, entry.name));
        continue;
      }
      if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
        out.push(path.join(dir, entry.name));
      }
    }
  }
  await walk(root);
  return out;
}

function countInlineTags(text: string): number {
  const matches = text.match(/(^|\s)#[\p{L}\p{N}_/-]+/gu);
  return matches?.length ?? 0;
}

function collectTagCount(meta: Record<string, unknown>, body: string): number {
  const fmTags = meta.tags;
  const fromFrontmatter = Array.isArray(fmTags)
    ? fmTags.length
    : typeof fmTags === 'string' && fmTags.trim()
      ? fmTags.split(/[,\s]+/).filter(Boolean).length
      : 0;
  return fromFrontmatter + countInlineTags(body);
}

function stemForWikilink(target: string): string {
  return path
    .basename(target.replace(/\\/g, '/').trim(), path.extname(target))
    .toLowerCase();
}

function collectWikilinkTargets(text: string): string[] {
  const out = new Set<string>();
  const re = /!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

function parseRefsBibKeys(raw: string): Set<string> {
  const keys = new Set<string>();
  const re = /@\w+\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1].trim();
    if (key) keys.add(key);
  }
  return keys;
}

function makeRepairAction(input: {
  id: string;
  severity: 'info' | 'warning' | 'error';
  area: 'obsidian' | 'zotero';
  title: string;
  description: string;
  relPath?: string;
  manualSteps: string[];
}): InteropReport['repairActions'][number] {
  return { ...input, dryRunOnly: true };
}

export async function createInteropReport(vaultPath: string): Promise<InteropReport> {
  const root = path.resolve(vaultPath);
  validateVaultPath(root, root);

  const markdownFiles = await listMarkdownFiles(root);
  let filesWithFrontmatter = 0;
  let wikilinkCount = 0;
  let tagCount = 0;
  let paperFiles = 0;
  let papersWithBibkey = 0;
  let papersWithDoi = 0;
  const bibkeyCounts = new Map<string, number>();
  const paperBibkeys = new Map<string, string>();
  const notesMissingFrontmatter: string[] = [];
  const papersMissingBibkey: string[] = [];
  const papersMissingDoi: string[] = [];
  const wikiTargets: Array<{ relPath: string; target: string }> = [];
  const markdownStems = new Set<string>();

  for (const filePath of markdownFiles) {
    markdownStems.add(stemForWikilink(path.relative(root, filePath)));
  }

  for (const filePath of markdownFiles) {
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => '');
    const { meta, body } = parseFrontmatter(raw);
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    if (Object.keys(meta).length > 0) filesWithFrontmatter += 1;
    else notesMissingFrontmatter.push(rel);
    const targets = collectWikilinkTargets(raw);
    wikilinkCount += targets.length;
    for (const target of targets) wikiTargets.push({ relPath: rel, target });
    tagCount += collectTagCount(meta, body);

    const isPaper = rel.startsWith('Papers/') && !rel.endsWith('_reading.md');
    if (!isPaper) continue;
    paperFiles += 1;

    const bibkey = typeof meta.bibkey === 'string' ? meta.bibkey.trim() : '';
    if (bibkey) {
      papersWithBibkey += 1;
      bibkeyCounts.set(bibkey, (bibkeyCounts.get(bibkey) ?? 0) + 1);
      paperBibkeys.set(rel, bibkey);
    } else {
      papersMissingBibkey.push(rel);
    }
    if (typeof meta.doi === 'string' && meta.doi.trim()) {
      papersWithDoi += 1;
    } else {
      papersMissingDoi.push(rel);
    }
  }

  const hasConfigDir = await exists(path.join(root, '.obsidian'));
  const refsBibPath = path.join(root, 'Papers', 'refs.bib');
  const hasRefsBib = await exists(refsBibPath);
  const refsBibKeys = hasRefsBib
    ? parseRefsBibKeys(await fs.readFile(refsBibPath, 'utf-8').catch(() => ''))
    : new Set<string>();
  const refsBibEntries = refsBibKeys.size;
  const bibkeysMissingFromRefsBib = [...paperBibkeys.values()]
    .filter((key) => hasRefsBib && !refsBibKeys.has(key))
    .sort((a, b) => a.localeCompare(b));
  const duplicateBibkeys = [...bibkeyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
  const brokenWikilinks = wikiTargets
    .filter(({ target }) => !markdownStems.has(stemForWikilink(target)))
    .slice(0, 100)
    .sort((a, b) => a.relPath.localeCompare(b.relPath) || a.target.localeCompare(b.target));

  const obsidianWarnings: string[] = [];
  if (!hasConfigDir) obsidianWarnings.push('.obsidian が無いため、Obsidian 側でVaultとして未初期化の可能性があります');
  if (markdownFiles.length > 0 && filesWithFrontmatter === 0) {
    obsidianWarnings.push('frontmatter付きノートがありません。Bases/Dataview系の連携性が弱くなります');
  }
  if (markdownFiles.length > 2 && wikilinkCount === 0) {
    obsidianWarnings.push('wikilink がありません。Obsidian graph / backlinks 連携が弱くなります');
  }
  if (brokenWikilinks.length > 0) {
    obsidianWarnings.push('解決できないwikilinkがあります。Obsidian graph / backlinks の信頼性が落ちます');
  }

  const zoteroWarnings: string[] = [];
  if (!hasRefsBib) zoteroWarnings.push('Papers/refs.bib がありません。Zotero / Better BibTeX 連携用にexportしてください');
  if (paperFiles > 0 && papersWithBibkey < paperFiles) {
    zoteroWarnings.push('bibkey が無いPaperがあります。citation picker / BibTeX exportの品質が落ちます');
  }
  if (hasRefsBib && bibkeysMissingFromRefsBib.length > 0) {
    zoteroWarnings.push('Paper noteのbibkeyがrefs.bibに見つかりません。Zotero exportが古い可能性があります');
  }
  if (duplicateBibkeys.length > 0) {
    zoteroWarnings.push('重複bibkeyがあります。引用解決が不安定になります');
  }

  const repairActions: InteropReport['repairActions'] = [];
  if (!hasConfigDir) {
    repairActions.push(makeRepairAction({
      id: 'obsidian-init-vault',
      severity: 'info',
      area: 'obsidian',
      title: 'ObsidianでVaultを初期化する',
      description: '.obsidian が無いため、Obsidian側の設定・Graph・plugin連携が未初期化の可能性があります。',
      manualSteps: [
        'ObsidianでこのVaultフォルダを開く',
        '必要なCommunity Pluginを明示的に有効化する',
        'ClassNotesに戻って互換性チェックを再実行する',
      ],
    }));
  }
  for (const relPath of notesMissingFrontmatter.slice(0, 10)) {
    repairActions.push(makeRepairAction({
      id: `obsidian-frontmatter-${relPath}`,
      severity: 'warning',
      area: 'obsidian',
      title: 'frontmatterを追加する',
      description: 'Bases/Dataview/検索フィルタで扱いやすいよう、最低限のtitle/tags/typeを追加します。',
      relPath,
      manualSteps: [
        'ノート先頭に YAML frontmatter を追加する',
        '例: title, type, tags を設定する',
        '既存本文は変更しない',
      ],
    }));
  }
  for (const item of brokenWikilinks.slice(0, 10)) {
    repairActions.push(makeRepairAction({
      id: `obsidian-broken-link-${item.relPath}-${item.target}`,
      severity: 'warning',
      area: 'obsidian',
      title: `未解決wikilinkを確認する: [[${item.target}]]`,
      description: 'リンク先ノートが見つからないため、表記ゆれ・未作成ノート・移動済みノートの可能性があります。',
      relPath: item.relPath,
      manualSteps: [
        'リンク先ノートを作成する、または既存ノート名に合わせてwikilinkを修正する',
        '日本語/英語表記ゆれや拡張子付きリンクを確認する',
      ],
    }));
  }
  for (const relPath of papersMissingBibkey.slice(0, 10)) {
    repairActions.push(makeRepairAction({
      id: `zotero-bibkey-${relPath}`,
      severity: 'error',
      area: 'zotero',
      title: 'Paper noteにbibkeyを追加する',
      description: 'citation picker / BibTeX export / Zotero照合の安定性に必要です。',
      relPath,
      manualSteps: [
        'Zotero Better BibTeXのcitation keyを確認する',
        'Paper noteのfrontmatterに bibkey を追加する',
        'refs.bibを再exportする',
      ],
    }));
  }
  for (const relPath of papersMissingDoi.slice(0, 10)) {
    repairActions.push(makeRepairAction({
      id: `zotero-doi-${relPath}`,
      severity: 'warning',
      area: 'zotero',
      title: 'Paper noteにDOI/arXivを追加する',
      description: 'Zoteroや外部文献DBとの照合、重複検出、再現性確認が弱くなります。',
      relPath,
      manualSteps: [
        'DOIまたはarXiv IDを確認する',
        'frontmatterに doi または arxiv を追加する',
      ],
    }));
  }
  if (hasRefsBib && bibkeysMissingFromRefsBib.length > 0) {
    repairActions.push(makeRepairAction({
      id: 'zotero-refresh-refs-bib',
      severity: 'warning',
      area: 'zotero',
      title: 'refs.bibをZotero/Better BibTeXから再exportする',
      description: 'Paper noteのbibkeyがrefs.bibに無く、引用解決やLaTeX exportが不完全になる可能性があります。',
      manualSteps: [
        'ZoteroでBetter BibTeX exportを実行する',
        '出力先をVaultのPapers/refs.bibにする',
        'ClassNotesで互換性チェックを再実行する',
      ],
    }));
  }

  const recommendations = [
    ...obsidianWarnings,
    ...zoteroWarnings,
  ];
  if (recommendations.length === 0) {
    recommendations.push('Obsidian / Zotero 互換性の主要チェックは良好です');
  }

  return {
    ok: true,
    obsidian: {
      hasConfigDir,
      markdownFiles: markdownFiles.length,
      filesWithFrontmatter,
      wikilinkCount,
      tagCount,
      notesMissingFrontmatter,
      brokenWikilinks,
      warnings: obsidianWarnings,
    },
    zotero: {
      hasRefsBib,
      refsBibEntries,
      paperFiles,
      papersWithBibkey,
      papersWithDoi,
      papersMissingBibkey,
      papersMissingDoi,
      bibkeysMissingFromRefsBib,
      duplicateBibkeys,
      warnings: zoteroWarnings,
    },
    repairActions,
    recommendations,
  };
}
