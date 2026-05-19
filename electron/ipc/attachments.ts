import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  validateVaultPath,
  getCurrentVaultPath,
  ensureDir,
  exists,
  atomicWrite,
} from './utils';
import { consumeFileAccessGrant, isLikelyFileAccessToken } from './file-access';
import { logger } from '../logger';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const PDF_EXT = '.pdf';

async function uniqueDestination(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let i = 1;
  while (await exists(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

/**
 * Decide where attachments belong based on the note's location.
 * - Subject notes (`<vault>/<subject>/notes/*.md`)  → `<vault>/<subject>/materials/`
 * - Books (`<vault>/Books/*.md`)                    → `<vault>/Books/attachments/`
 * - Memos (`<vault>/Memos/*.md`)                    → `<vault>/Memos/attachments/`
 * - Anything else                                   → same folder as the note
 */
function attachmentDirForNote(noteFilePath: string): string {
  const noteDir = path.dirname(noteFilePath);
  const noteDirName = path.basename(noteDir);
  if (noteDirName === 'notes') {
    return path.join(path.dirname(noteDir), 'materials');
  }
  if (noteDirName === 'Books' || noteDirName === 'Memos') {
    return path.join(noteDir, 'attachments');
  }
  return noteDir;
}

function timestampName(ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `paste-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}${ext}`;
}

async function copyOne(srcPath: string, noteFilePath: string): Promise<string> {
  const root = getCurrentVaultPath();
  if (!root) throw new Error('Access denied: no active vault');
  validateVaultPath(noteFilePath, root);
  const targetDir = attachmentDirForNote(noteFilePath);
  validateVaultPath(targetDir, root);
  await ensureDir(targetDir);
  const safeBase = path.basename(srcPath).replace(/[\\/:*?"<>|]/g, '_');
  const dest = await uniqueDestination(targetDir, safeBase);
  validateVaultPath(dest, root);
  await fs.copyFile(srcPath, dest);
  return dest;
}

async function resolveDroppedSource(input: string, senderId: number): Promise<string> {
  if (isLikelyFileAccessToken(input)) {
    return consumeFileAccessGrant(input, 'attachment-source', senderId);
  }
  const root = getCurrentVaultPath();
  if (!root) throw new Error('Access denied: no active vault');
  return validateVaultPath(input, root);
}

async function listAllAttachments(vaultPath: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(vaultPath))) return out;

  async function walk(dir: string, depth = 0) {
    if (depth > 5) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (IMAGE_EXTS.has(ext) || ext === PDF_EXT) {
          out.push(full);
        }
      }
    }
  }
  await walk(vaultPath);
  return out;
}

/**
 * Build a name → absolute path map from the list of attachments,
 * with priority for files closer to the note.
 */
function buildIndex(paths: string[], noteFilePath?: string): Record<string, string> {
  const noteDir = noteFilePath ? path.dirname(noteFilePath) : '';
  const sameSubjectMaterials = noteFilePath
    ? path.join(path.dirname(noteDir), 'materials')
    : '';
  const ranked = [...paths].sort((a, b) => {
    const score = (p: string) => {
      const dir = path.dirname(p);
      if (dir === noteDir) return 0;
      if (dir === sameSubjectMaterials) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  const map: Record<string, string> = {};
  for (const p of ranked) {
    const name = path.basename(p);
    if (!(name in map)) map[name] = p; // first one wins (highest priority)
  }
  return map;
}

export function createAttachmentsHandlers() {
  return {
    'attachments:pick': async (e: unknown, noteFilePath: string) => {
      const win = BrowserWindow.fromWebContents((e as { sender: Electron.WebContents }).sender) ?? undefined;
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        title: '挿入する画像 / PDF を選んでください',
        filters: [
          { name: 'Images & PDF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'pdf'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: false, added: [] };
      const added: string[] = [];
      for (const src of result.filePaths) {
        try {
          const dest = await copyOne(src, noteFilePath);
          added.push(path.basename(dest));
        } catch (err) {
          logger.warn('[attachments:pick] copy failed', { fileName: path.basename(src), error: err });
        }
      }
      return { ok: true, added };
    },

    'attachments:saveImage': async (_e: unknown, noteFilePath: string, dataUrl: string, ext = '.png') => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(noteFilePath, root);
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return { ok: false, error: 'invalid data url' };
      const buf = Buffer.from(m[2], 'base64');
      const targetDir = attachmentDirForNote(noteFilePath);
      validateVaultPath(targetDir, root);
      await ensureDir(targetDir);
      const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
      const dest = await uniqueDestination(targetDir, timestampName(safeExt));
      validateVaultPath(dest, root);
      await atomicWrite(dest, buf);
      return { ok: true, name: path.basename(dest) };
    },

    'attachments:dropFiles': async (e: unknown, noteFilePath: string, srcPaths: string[]) => {
      const added: string[] = [];
      for (const src of srcPaths) {
        try {
          const resolved = await resolveDroppedSource(src, (e as { sender: { id: number } }).sender.id);
          const stat = await fs.stat(resolved);
          if (!stat.isFile()) continue;
          const dest = await copyOne(resolved, noteFilePath);
          added.push(path.basename(dest));
        } catch (err) {
          logger.warn('[attachments:dropFiles] rejected source', {
            fileName: path.basename(src),
            error: err,
          });
        }
      }
      return { ok: true, added };
    },

    'attachments:index': async (_e: unknown, vaultPath: string, noteFilePath?: string): Promise<Record<string, string>> => {
      const root = path.resolve(vaultPath);
      if (noteFilePath) validateVaultPath(noteFilePath, root);
      const all = await listAllAttachments(root);
      return buildIndex(all, noteFilePath);
    },
  };
}

export function registerAttachmentsHandlers() {
  const handlers = createAttachmentsHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
