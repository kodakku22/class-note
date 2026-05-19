import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { registerSensitivePath } from '../redaction';

// ---------------------------------------------------------------------------
// Current vault tracking (set by vault:init / setCurrentVault)
// ---------------------------------------------------------------------------

let currentVaultPath: string | null = null;

export function setCurrentVaultPath(p: string | null): void {
  currentVaultPath = p ? path.resolve(p) : null;
  registerSensitivePath(currentVaultPath);
}

export function getCurrentVaultPath(): string | null {
  return currentVaultPath;
}

// ---------------------------------------------------------------------------
// Path validation (security)
// ---------------------------------------------------------------------------

/**
 * Throws if `filePath` is not inside `vaultRoot` (or equal to it).
 * Returns the resolved canonical absolute path on success.
 *
 * Use this in EVERY IPC handler that touches the filesystem with a
 * caller-supplied path.
 */
function canonicalizeForVaultCheck(p: string): string {
  const resolved = path.resolve(p);
  const missingParts: string[] = [];
  let cursor = resolved;

  while (!fsSync.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missingParts.unshift(path.basename(cursor));
    cursor = parent;
  }

  const realBase = fsSync.existsSync(cursor) ? fsSync.realpathSync.native(cursor) : cursor;
  return missingParts.length > 0 ? path.join(realBase, ...missingParts) : realBase;
}

export function validateVaultPath(filePath: string, vaultRoot: string): string {
  if (typeof filePath !== 'string' || typeof vaultRoot !== 'string') {
    throw new Error('Access denied: invalid path');
  }
  const resolved = canonicalizeForVaultCheck(filePath);
  const root = canonicalizeForVaultCheck(vaultRoot);
  const rel = path.relative(root, resolved);
  if (rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(`Access denied: path outside vault — ${resolved}`);
  }
  return resolved;
}

/**
 * Convenience wrapper: validates against the currently-active vault path.
 * Throws if no vault is currently set.
 */
export function validateAgainstCurrentVault(filePath: string): string {
  if (!currentVaultPath) {
    throw new Error('Access denied: no active vault');
  }
  return validateVaultPath(filePath, currentVaultPath);
}

// ---------------------------------------------------------------------------
// Filesystem helpers (de-duplicated from vault/materials/search)
// ---------------------------------------------------------------------------

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

export async function listMarkdownFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.markdown')))
    .map((e) => path.join(dir, e.name));
}

// ---------------------------------------------------------------------------
// Atomic write + backup (data integrity)
// ---------------------------------------------------------------------------

/**
 * Crash-safe write: write to a temp file, then atomically rename it onto
 * the final path. The OS guarantees rename atomicity within the same volume.
 */
export async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`;
  try {
    if (typeof content === 'string') {
      await fs.writeFile(tmp, content, 'utf-8');
    } else {
      await fs.writeFile(tmp, content);
    }
    await fs.rename(tmp, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

const BACKUP_KEEP_DEFAULT = 10;

/**
 * Copy `filePath` into `<vaultRoot>/.history/<rel-dir>/<base>_<timestamp><ext>`
 * before it is overwritten. Keeps at most `keep` historical copies per file.
 */
export async function backupFile(
  filePath: string,
  vaultRoot: string,
  keep: number = BACKUP_KEEP_DEFAULT
): Promise<void> {
  if (!(await exists(filePath))) return;
  const rel = path.relative(vaultRoot, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return; // outside vault
  const backDir = path.join(vaultRoot, '.history', path.dirname(rel));
  await ensureDir(backDir);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dest = path.join(backDir, `${base}_${ts}${ext}`);

  try {
    await fs.copyFile(filePath, dest);
  } catch {
    // best-effort backup; do not block the write
    return;
  }

  try {
    const entries = (await fs.readdir(backDir))
      .filter((f) => f.startsWith(base + '_'))
      .sort();
    for (const old of entries.slice(0, -keep)) {
      await fs.unlink(path.join(backDir, old)).catch(() => {});
    }
  } catch {
    // ignore listing errors
  }
}

// ---------------------------------------------------------------------------
// Filename sanitization (Unicode-safe, used by books/wiki/outputs writers)
// ---------------------------------------------------------------------------

const SAFE_NAME_MAX_LENGTH = 200;

/**
 * Normalize a filename so it is safe to write under the vault tree.
 * - Trims surrounding whitespace
 * - Strips characters that are illegal on Windows (or would confuse the parser)
 * - Normalizes Unicode to NFC so Japanese filenames composed by Claude don't
 *   produce duplicate path entries on Windows
 * - Caps length to 200 chars to avoid Windows MAX_PATH issues
 */
export function safeName(name: string): string {
  if (typeof name !== 'string') return '';
  const normalized = name
    .normalize('NFC')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, SAFE_NAME_MAX_LENGTH);
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (!normalized || reserved.test(normalized)) return '_';
  return normalized;
}

// ---------------------------------------------------------------------------
// Claude CLI helpers (shared by qa.ts and wiki.ts)
// ---------------------------------------------------------------------------

const MAX_PROMPT_LENGTH = 3000;

/**
 * Sanitize user-supplied text before embedding it inside a Claude prompt or
 * a CLI argument. Mitigates prompt injection via code-fence breakouts and
 * unbounded inputs.
 *
 * `maxLength` defaults to 3000 chars (the QA chat limit). Wiki compilation
 * passes a much larger budget (e.g. 80000) because the input is the user's
 * own collected raw notes, not free-form chat.
 */
export function sanitizeForPrompt(text: string, maxLength: number = MAX_PROMPT_LENGTH): string {
  if (typeof text !== 'string') return '';
  return text
    .split('\0')
    .join('')
    .replace(/```/g, '` ` `')
    .replace(/\n{4,}/g, '\n\n\n')
    .slice(0, maxLength);
}

const executableCache = new Map<string, string | null>();

export function __clearExecutableCacheForTests(): void {
  executableCache.clear();
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function windowsExecutableNames(name: string): string[] {
  const lower = name.toLowerCase();
  if (/\.(exe|cmd|bat)$/i.test(lower)) return [name];
  return [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`];
}

function windowsExecutableSearchDirs(name: string): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pathDirs = (process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const dirs = [
    ...pathDirs,
    home ? path.join(home, '.local', 'bin') : '',
    appData ? path.join(appData, 'npm') : '',
    localAppData ? path.join(localAppData, 'OpenAI', 'Codex', 'bin') : '',
    localAppData ? path.join(localAppData, 'Programs', 'OpenAI Codex', 'bin') : '',
    localAppData ? path.join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin') : '',
    path.join(programFiles, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'),
    path.join(programFilesX86, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'),
  ];

  // Microsoft Store apps often live under versioned WindowsApps directories.
  // They may not be discoverable from Electron launched through Explorer even
  // when a terminal session can run them.
  if (name.toLowerCase() === 'codex') {
    const windowsApps = path.join(programFiles, 'WindowsApps');
    try {
      for (const entry of fsSync.readdirSync(windowsApps, { withFileTypes: true })) {
        if (entry.isDirectory() && /^OpenAI\.Codex_/i.test(entry.name)) {
          dirs.push(path.join(windowsApps, entry.name, 'app', 'resources'));
        }
      }
    } catch {
      // WindowsApps is commonly access-restricted; fall back to PATH candidates.
    }
  }

  return uniqueNonEmpty(dirs);
}

async function findExecutableInCommonLocations(name: string): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  for (const dir of windowsExecutableSearchDirs(name)) {
    for (const exeName of windowsExecutableNames(name)) {
      const candidate = path.join(dir, exeName);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) return candidate;
      } catch {
        // keep searching
      }
    }
  }
  return null;
}

/**
 * Locate an executable using the platform's path lookup tool. Caches the
 * result for the process lifetime.
 */
export async function findExecutable(name: string): Promise<string | null> {
  const cached = executableCache.get(name);
  if (cached) return cached;
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  return new Promise((resolve) => {
    execFile(finder, [name], { windowsHide: true }, async (err, stdout) => {
      if (err) {
        const fallback = await findExecutableInCommonLocations(name);
        executableCache.set(name, fallback);
        return resolve(fallback);
      }
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const exe =
        lines.find((l) => l.toLowerCase().endsWith('.exe')) ||
        lines.find((l) => l.toLowerCase().endsWith('.cmd')) ||
        lines.find((l) => l.toLowerCase().endsWith('.bat')) ||
        lines.find((l) => !l.toLowerCase().endsWith('.cmd')) ||
        lines[0] ||
        (await findExecutableInCommonLocations(name));
      const found = exe || null;
      executableCache.set(name, found);
      resolve(found);
    });
  });
}

export async function findClaudePath(): Promise<string | null> {
  return findExecutable('claude');
}

export async function findCodexPath(): Promise<string | null> {
  return findExecutable('codex');
}

export async function findGcloudPath(): Promise<string | null> {
  return findExecutable('gcloud');
}

export async function findGeminiPath(): Promise<string | null> {
  return findExecutable('gemini');
}
