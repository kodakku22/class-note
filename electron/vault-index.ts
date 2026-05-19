import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseFrontmatter } from './ipc/frontmatter';
import { validateVaultPath } from './ipc/utils';

export type VaultIndexFileKind = 'note' | 'pdf' | 'image' | 'office' | 'other';

export type VaultIndexFile = {
  relPath: string;
  kind: VaultIndexFileKind;
  mtimeMs: number;
  size: number;
  title: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  preview: string;
  searchText: string;
  wikilinks: string[];
};

export type VaultIndex = {
  version: 1;
  vaultRootHash: string;
  builtAt: string;
  files: VaultIndexFile[];
};

export type VaultIndexStatus = {
  ready: boolean;
  fileCount: number;
  builtAt?: string;
};

const SCHEMA_VERSION = 1;
const MARKDOWN_EXTS = new Set(['.md', '.markdown']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const OFFICE_EXTS = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx']);
const RESERVED_DIRS = new Set([
  '.obsidian',
  '.history',
  '.trash',
  '.classnotes',
  '_templates',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'coverage',
  'release',
  'out',
  'Outputs',
]);

let indexDirectoryOverride: string | null = null;

export function setVaultIndexDirectoryForTests(dir: string | null): void {
  indexDirectoryOverride = dir;
}

function getDefaultIndexDirectory(): string {
  if (indexDirectoryOverride) return indexDirectoryOverride;
  if (!process.versions.electron) {
    return path.join(os.tmpdir(), 'classnotes-indexes');
  }
  try {
    // Electron's `app` object is only available in the main process. Tests run
    // in plain Node, so keep this lookup lazy and fall back to tmpdir there.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getPath(name: string): string } };
    const userData = electron.app?.getPath?.('userData');
    if (userData) return path.join(userData, 'indexes');
  } catch {
    // Fall through to a test-safe location.
  }
  return path.join(os.tmpdir(), 'classnotes-indexes');
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
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

async function indexFilePathForRoot(root: string): Promise<string> {
  const hash = sha256(root);
  return path.join(getDefaultIndexDirectory(), `${hash}.json`);
}

function relPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isInside(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function hasReservedSegment(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  for (const segment of segments.slice(0, -1)) {
    if (segment.startsWith('.') || RESERVED_DIRS.has(segment)) return true;
  }
  return false;
}

function shouldIndex(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith('..')) return false;
  if (hasReservedSegment(relativePath)) return false;
  const name = path.basename(relativePath);
  if (!name || name.startsWith('.')) return false;
  return true;
}

function kindFor(fileName: string): VaultIndexFileKind {
  const ext = path.extname(fileName).toLowerCase();
  if (MARKDOWN_EXTS.has(ext)) return 'note';
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (OFFICE_EXTS.has(ext)) return 'office';
  return 'other';
}

function normalizeText(text: string, max = 20_000): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function extractTags(meta: Record<string, unknown>): string[] {
  const raw = meta.tags;
  const tags = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 100);
}

function sanitizeFrontmatterValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return '[nested]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeFrontmatterValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[key] = sanitizeFrontmatterValue(child, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 1000);
}

function sanitizeFrontmatter(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta).slice(0, 100)) {
    out[key] = sanitizeFrontmatterValue(value);
  }
  return out;
}

export function extractWikilinksFromText(content: string): string[] {
  const out = new Set<string>();
  const re = /(!?)\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const target = match[2].trim();
    if (target) out.add(target);
  }
  return [...out];
}

async function buildFileEntry(root: string, fullPath: string): Promise<VaultIndexFile | null> {
  const relative = relPath(root, fullPath);
  if (!shouldIndex(relative)) return null;

  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) return null;

  const kind = kindFor(fullPath);
  const fileName = path.basename(fullPath);
  let title = path.basename(fullPath, path.extname(fullPath));
  let tags: string[] = [];
  let frontmatter: Record<string, unknown> = {};
  let preview = '';
  let searchText = fileName;
  let wikilinks: string[] = [];

  if (kind === 'note') {
    const raw = await fs.readFile(fullPath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const safeMeta = sanitizeFrontmatter(meta as Record<string, unknown>);
    frontmatter = safeMeta;
    title = typeof safeMeta.title === 'string' && safeMeta.title ? safeMeta.title : title;
    tags = extractTags(safeMeta);
    preview = normalizeText(body, 360);
    wikilinks = extractWikilinksFromText(body);
    const fmText = Object.entries(safeMeta)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value ?? '')}`)
      .join(' ');
    searchText = normalizeText(`${fileName} ${title} ${tags.join(' ')} ${fmText} ${body}`);
  }

  return {
    relPath: relative,
    kind,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    title,
    tags,
    frontmatter,
    preview,
    searchText,
    wikilinks,
  };
}

async function* walkFiles(root: string, dir = root): AsyncGenerator<string> {
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
      if (!shouldIndex(`${relative}/placeholder`)) continue;
      yield* walkFiles(root, full);
    } else if (entry.isFile() && shouldIndex(relative)) {
      yield full;
    }
  }
}

function isValidIndex(value: unknown, expectedHash: string): value is VaultIndex {
  if (!value || typeof value !== 'object') return false;
  const idx = value as Partial<VaultIndex>;
  return (
    idx.version === SCHEMA_VERSION &&
    idx.vaultRootHash === expectedHash &&
    typeof idx.builtAt === 'string' &&
    Array.isArray(idx.files)
  );
}

async function readIndex(root: string): Promise<VaultIndex | null> {
  const filePath = await indexFilePathForRoot(root);
  const hash = sha256(root);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    return isValidIndex(parsed, hash) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeIndex(root: string, index: VaultIndex): Promise<void> {
  const filePath = await indexFilePathForRoot(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(index, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, filePath);
}

export async function rebuildVaultIndex(vaultPath: string): Promise<VaultIndex> {
  const root = await resolveVaultRoot(vaultPath);
  const files: VaultIndexFile[] = [];
  for await (const filePath of walkFiles(root)) {
    try {
      const entry = await buildFileEntry(root, filePath);
      if (entry) files.push(entry);
    } catch {
      // Skip unreadable files; index is a derived cache and should not block app use.
    }
  }
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const index: VaultIndex = {
    version: SCHEMA_VERSION,
    vaultRootHash: sha256(root),
    builtAt: new Date().toISOString(),
    files,
  };
  await writeIndex(root, index);
  return index;
}

export async function getVaultIndex(vaultPath: string): Promise<VaultIndex> {
  const root = await resolveVaultRoot(vaultPath);
  const existing = await readIndex(root);
  return existing ?? rebuildVaultIndex(root);
}

export async function getVaultIndexStatus(vaultPath: string): Promise<VaultIndexStatus> {
  const root = await resolveVaultRoot(vaultPath);
  const existing = await readIndex(root);
  if (!existing) return { ready: false, fileCount: 0 };
  return { ready: true, fileCount: existing.files.length, builtAt: existing.builtAt };
}

export async function updateVaultIndexFile(vaultPath: string, filePath: string): Promise<void> {
  const root = await resolveVaultRoot(vaultPath);
  const full = path.resolve(filePath);
  if (!isInside(root, full)) return;

  const index = await getVaultIndex(root);
  const relative = relPath(root, full);
  index.files = index.files.filter((file) => file.relPath !== relative);

  try {
    const entry = await buildFileEntry(root, full);
    if (entry) index.files.push(entry);
  } catch {
    // Deleted or unreadable; removing stale entry is enough.
  }
  index.builtAt = new Date().toISOString();
  index.files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  await writeIndex(root, index);
}

export async function removeVaultIndexFile(vaultPath: string, filePath: string): Promise<void> {
  const root = await resolveVaultRoot(vaultPath);
  const full = path.resolve(filePath);
  if (!isInside(root, full)) return;
  const index = await readIndex(root);
  if (!index) return;
  const relative = relPath(root, full);
  const nextFiles = index.files.filter((file) => file.relPath !== relative);
  if (nextFiles.length === index.files.length) return;
  await writeIndex(root, { ...index, files: nextFiles, builtAt: new Date().toISOString() });
}
