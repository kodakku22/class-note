import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import YAML from 'yaml';
import { extractWikilinksFromText } from './vault-index';
import { validateVaultPath } from './ipc/utils';

export type VaultSafetyIssueSeverity = 'info' | 'warning' | 'error';

export type VaultSafetyIssue = {
  severity: VaultSafetyIssueSeverity;
  code: string;
  message: string;
  relPath?: string;
};

export type VaultSafetyAudit = {
  checkedAt: string;
  fileCount: number;
  markdownCount: number;
  totalBytes: number;
  issueCounts: Record<VaultSafetyIssueSeverity, number>;
  issues: VaultSafetyIssue[];
};

export type VaultBackupResult = {
  ok: true;
  backupDir: string;
  manifestPath: string;
  fileCount: number;
  totalBytes: number;
  skipped: VaultSafetyIssue[];
};

export type VaultBackupSummary = {
  backupDir: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
};

export type ResearchReproducibilityReport = {
  checkedAt: string;
  score: number;
  papers: {
    total: number;
    withBibkey: number;
    missingBibkey: string[];
    duplicateBibkeys: Array<{ bibkey: string; relPaths: string[] }>;
  };
  experiments: {
    total: number;
    complete: number;
    incomplete: Array<{ relPath: string; missingFields: string[] }>;
  };
  citations: {
    totalCitationKeys: number;
    unresolvedCitationKeys: string[];
  };
  issues: VaultSafetyIssue[];
};

type MarkdownDocument = {
  relPath: string;
  body: string;
  meta: Record<string, unknown>;
  frontmatterError?: string;
};

const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;
const MARKDOWN_EXTS = new Set(['.md', '.markdown']);
const BACKUP_EXCLUDED_DIRS = new Set([
  '.git',
  '.history',
  '.obsidian',
  '.trash',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'coverage',
  'release',
  'out',
]);

let backupDirectoryOverride: string | null = null;

export function setVaultSafetyBackupDirectoryForTests(dir: string | null): void {
  backupDirectoryOverride = dir;
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function resolveVaultRoot(vaultPath: string): Promise<string> {
  const root = path.resolve(vaultPath);
  validateVaultPath(root, root);
  try {
    return await fs.realpath(root);
  } catch {
    return root;
  }
}

function getDefaultBackupDirectory(): string {
  if (backupDirectoryOverride) return backupDirectoryOverride;
  if (!process.versions.electron) {
    return path.join(os.tmpdir(), 'classnotes-vault-backups');
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getPath(name: string): string } };
    const userData = electron.app?.getPath?.('userData');
    if (userData) return path.join(userData, 'vault-backups');
  } catch {
    // Fall through to a test-safe location.
  }
  return path.join(os.tmpdir(), 'classnotes-vault-backups');
}

function relPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isExcludedDir(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  if (normalized === '.classnotes/plugins' || normalized.startsWith('.classnotes/plugins/')) {
    return true;
  }
  const parts = normalized.split('/').filter(Boolean);
  return parts.some((part) => BACKUP_EXCLUDED_DIRS.has(part));
}

async function* walkVaultFiles(root: string, dir = root): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = relPath(root, full);
    if (entry.isDirectory()) {
      if (!isExcludedDir(relative)) yield* walkVaultFiles(root, full);
    } else if (entry.isFile() && !isExcludedDir(relative)) {
      yield full;
    }
  }
}

function parseMarkdown(raw: string): {
  meta: Record<string, unknown>;
  body: string;
  frontmatterError?: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  try {
    const parsed = YAML.parse(match[1]);
    return {
      meta: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
      body: match[2],
    };
  } catch (err) {
    return { meta: {}, body: match[2], frontmatterError: String(err) };
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isPaper(rel: string, meta: Record<string, unknown>): boolean {
  const type = asString(meta.type).toLowerCase();
  return rel.startsWith('Papers/') || type === 'paper' || type === 'paper-note';
}

function isExperiment(rel: string, meta: Record<string, unknown>): boolean {
  const type = asString(meta.type).toLowerCase();
  return (
    type === 'experiment' ||
    type === 'reproducibility' ||
    /(^|\/)(experiments?|実験)(\/|$)/i.test(rel)
  );
}

function hasMeta(meta: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = meta[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

function countIssues(issues: VaultSafetyIssue[]): Record<VaultSafetyIssueSeverity, number> {
  return {
    info: issues.filter((issue) => issue.severity === 'info').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    error: issues.filter((issue) => issue.severity === 'error').length,
  };
}

async function collectMarkdownDocuments(
  root: string,
  issues: VaultSafetyIssue[]
): Promise<{
  documents: MarkdownDocument[];
  fileCount: number;
  markdownCount: number;
  totalBytes: number;
}> {
  const documents: MarkdownDocument[] = [];
  let fileCount = 0;
  let markdownCount = 0;
  let totalBytes = 0;

  for await (const filePath of walkVaultFiles(root)) {
    const relative = relPath(root, filePath);
    try {
      const stat = await fs.stat(filePath);
      fileCount += 1;
      totalBytes += stat.size;
      if (!MARKDOWN_EXTS.has(path.extname(filePath).toLowerCase())) continue;
      markdownCount += 1;
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = parseMarkdown(raw);
      if (parsed.frontmatterError) {
        issues.push({
          severity: 'warning',
          code: 'invalid_frontmatter',
          relPath: relative,
          message: 'Frontmatter YAML could not be parsed.',
        });
      }
      documents.push({ relPath: relative, ...parsed });
    } catch (err) {
      issues.push({
        severity: 'error',
        code: 'unreadable_file',
        relPath: relative,
        message: `Could not read file: ${String(err).slice(0, 160)}`,
      });
    }
  }

  return { documents, fileCount, markdownCount, totalBytes };
}

function addIntegrityIssues(documents: MarkdownDocument[], issues: VaultSafetyIssue[]): void {
  const knownNames = new Set<string>();
  const bibkeys = new Map<string, string[]>();

  for (const doc of documents) {
    const baseName = path.basename(doc.relPath, path.extname(doc.relPath));
    knownNames.add(baseName);
    const title = asString(doc.meta.title);
    if (title) knownNames.add(title);

    const bibkey = asString(doc.meta.bibkey);
    if (bibkey) {
      const paths = bibkeys.get(bibkey) ?? [];
      paths.push(doc.relPath);
      bibkeys.set(bibkey, paths);
    }

    if (isPaper(doc.relPath, doc.meta) && !bibkey) {
      issues.push({
        severity: 'warning',
        code: 'paper_missing_bibkey',
        relPath: doc.relPath,
        message: 'Paper note has no bibkey, so citation export may be incomplete.',
      });
    }
  }

  for (const [bibkey, relPaths] of bibkeys) {
    if (relPaths.length > 1) {
      for (const relPath of relPaths) {
        issues.push({
          severity: 'warning',
          code: 'duplicate_bibkey',
          relPath,
          message: `Duplicate bibkey "${bibkey}" appears in ${relPaths.length} files.`,
        });
      }
    }
  }

  for (const doc of documents) {
    for (const target of extractWikilinksFromText(doc.body)) {
      if (!knownNames.has(target)) {
        issues.push({
          severity: 'info',
          code: 'broken_wikilink',
          relPath: doc.relPath,
          message: `Wikilink target "${target}" was not found by note title or filename.`,
        });
      }
    }
  }
}

export async function auditVaultSafety(vaultPath: string): Promise<VaultSafetyAudit> {
  const root = await resolveVaultRoot(vaultPath);
  const issues: VaultSafetyIssue[] = [];
  const { documents, fileCount, markdownCount, totalBytes } = await collectMarkdownDocuments(
    root,
    issues
  );
  addIntegrityIssues(documents, issues);

  return {
    checkedAt: new Date().toISOString(),
    fileCount,
    markdownCount,
    totalBytes,
    issueCounts: countIssues(issues),
    issues: issues.slice(0, 200),
  };
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function createVaultBackup(vaultPath: string): Promise<VaultBackupResult> {
  const root = await resolveVaultRoot(vaultPath);
  const vaultHash = sha256(root).slice(0, 16);
  const createdAt = new Date().toISOString();
  const backupDir = path.join(getDefaultBackupDirectory(), vaultHash, safeTimestamp());
  const files: Array<{ relPath: string; size: number; mtimeMs: number; sha256: string }> = [];
  const skipped: VaultSafetyIssue[] = [];
  let totalBytes = 0;

  await fs.mkdir(backupDir, { recursive: true });

  for await (const filePath of walkVaultFiles(root)) {
    const relative = relPath(root, filePath);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_BACKUP_FILE_BYTES) {
        skipped.push({
          severity: 'warning',
          code: 'backup_file_too_large',
          relPath: relative,
          message: `Skipped file larger than ${MAX_BACKUP_FILE_BYTES} bytes.`,
        });
        continue;
      }

      const bytes = await fs.readFile(filePath);
      const dest = path.join(backupDir, relative);
      validateVaultPath(dest, backupDir);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, bytes);
      files.push({ relPath: relative, size: stat.size, mtimeMs: stat.mtimeMs, sha256: sha256(bytes) });
      totalBytes += stat.size;
    } catch (err) {
      skipped.push({
        severity: 'error',
        code: 'backup_copy_failed',
        relPath: relative,
        message: `Could not copy file: ${String(err).slice(0, 160)}`,
      });
    }
  }

  const manifest = {
    version: BACKUP_SCHEMA_VERSION,
    createdAt,
    vaultRootHash: sha256(root),
    sourceRootName: path.basename(root),
    fileCount: files.length,
    totalBytes,
    files,
    skipped,
  };
  const manifestPath = path.join(backupDir, 'classnotes-backup-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return {
    ok: true,
    backupDir,
    manifestPath,
    fileCount: files.length,
    totalBytes,
    skipped,
  };
}

export async function listVaultBackups(vaultPath: string): Promise<VaultBackupSummary[]> {
  const root = await resolveVaultRoot(vaultPath);
  const vaultHash = sha256(root).slice(0, 16);
  const dir = path.join(getDefaultBackupDirectory(), vaultHash);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries: VaultBackupSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupDir = path.join(dir, entry.name);
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(backupDir, 'classnotes-backup-manifest.json'), 'utf-8')
      ) as { createdAt?: string; fileCount?: number; totalBytes?: number };
      if (manifest.createdAt) {
        summaries.push({
          backupDir,
          createdAt: manifest.createdAt,
          fileCount: manifest.fileCount ?? 0,
          totalBytes: manifest.totalBytes ?? 0,
        });
      }
    } catch {
      // Ignore incomplete backup directories.
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
}

function citationKeys(content: string): string[] {
  const keys = new Set<string>();
  const re = /@([A-Za-z0-9_:.+-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const key = match[1].replace(/[.,;:!?)]*$/g, '');
    if (key) keys.add(key);
  }
  return [...keys];
}

export async function getResearchReproducibilityReport(
  vaultPath: string
): Promise<ResearchReproducibilityReport> {
  const root = await resolveVaultRoot(vaultPath);
  const issues: VaultSafetyIssue[] = [];
  const { documents } = await collectMarkdownDocuments(root, issues);
  const paperPaths: string[] = [];
  const missingBibkey: string[] = [];
  const bibkeys = new Map<string, string[]>();
  const cited = new Set<string>();
  const experimentPaths: string[] = [];
  const experiments: Array<{ relPath: string; missingFields: string[] }> = [];

  for (const doc of documents) {
    const bibkey = asString(doc.meta.bibkey);
    if (bibkey) {
      const paths = bibkeys.get(bibkey) ?? [];
      paths.push(doc.relPath);
      bibkeys.set(bibkey, paths);
    }
    for (const key of citationKeys(doc.body)) cited.add(key);

    if (isPaper(doc.relPath, doc.meta)) {
      paperPaths.push(doc.relPath);
      if (!bibkey) missingBibkey.push(doc.relPath);
    }

    if (isExperiment(doc.relPath, doc.meta)) {
      experimentPaths.push(doc.relPath);
      const missingFields = [
        ['dataset'],
        ['code_commit', 'commit'],
        ['seed'],
        ['environment', 'env'],
      ]
        .filter((keys) => !hasMeta(doc.meta, keys))
        .map((keys) => keys[0]);
      if (missingFields.length > 0) {
        experiments.push({ relPath: doc.relPath, missingFields });
      }
    }
  }

  const duplicateBibkeys = [...bibkeys.entries()]
    .filter(([, relPaths]) => relPaths.length > 1)
    .map(([bibkey, relPaths]) => ({ bibkey, relPaths }));
  const unresolvedCitationKeys = [...cited].filter((key) => !bibkeys.has(key)).sort();

  for (const relPath of missingBibkey) {
    issues.push({
      severity: 'warning',
      code: 'paper_missing_bibkey',
      relPath,
      message: 'Paper note is missing bibkey.',
    });
  }
  for (const duplicate of duplicateBibkeys) {
    for (const relPath of duplicate.relPaths) {
      issues.push({
        severity: 'warning',
        code: 'duplicate_bibkey',
        relPath,
        message: `Duplicate bibkey "${duplicate.bibkey}".`,
      });
    }
  }
  for (const relPath of experiments.map((item) => item.relPath)) {
    issues.push({
      severity: 'warning',
      code: 'experiment_missing_repro_fields',
      relPath,
      message: 'Experiment note is missing reproducibility metadata.',
    });
  }
  for (const key of unresolvedCitationKeys) {
    issues.push({
      severity: 'info',
      code: 'unresolved_citation',
      message: `Citation key "${key}" is referenced but not found in paper metadata.`,
    });
  }

  const issueCounts = countIssues(issues);
  const score = Math.max(0, Math.min(100, 100 - issueCounts.error * 20 - issueCounts.warning * 8 - issueCounts.info * 2));

  return {
    checkedAt: new Date().toISOString(),
    score,
    papers: {
      total: paperPaths.length,
      withBibkey: paperPaths.length - missingBibkey.length,
      missingBibkey,
      duplicateBibkeys,
    },
    experiments: {
      total: experimentPaths.length,
      complete: experimentPaths.length - experiments.length,
      incomplete: experiments,
    },
    citations: {
      totalCitationKeys: cited.size,
      unresolvedCitationKeys,
    },
    issues: issues.slice(0, 200),
  };
}
