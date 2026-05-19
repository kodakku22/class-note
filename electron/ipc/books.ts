import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseFrontmatter, stringifyFrontmatter, Frontmatter } from './frontmatter';
import {
  validateVaultPath,
  getCurrentVaultPath,
  atomicWrite,
  backupFile,
  ensureDir,
  exists,
  safeName,
} from './utils';
import { logger } from '../logger';

const BOOKS_DIR = 'Books';

export type BookMeta = {
  title: string;
  author?: string;
  status?: 'want-to-read' | 'reading' | 'done';
  rating?: number;
  started?: string;
  finished?: string;
  tags?: string[];
  totalPages?: number;
  currentPage?: number;
};

export type BookEntry = {
  filePath: string;
  fileName: string;
  meta: BookMeta;
  bodyPreview: string;
  mtime: number;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createBooksHandlers() {
  return {
    'books:list': async (_e: unknown, vaultPath: string): Promise<BookEntry[]> => {
      const root = path.resolve(vaultPath);
      const dir = path.join(root, BOOKS_DIR);
      validateVaultPath(dir, root);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items: BookEntry[] = [];
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
        if (ent.name.startsWith('_')) continue;
        // Skip reading-note sidecar files (Phase 1)
        if (ent.name.endsWith('_reading.md')) continue;
        const full = path.join(dir, ent.name);
        try {
          const stat = await fs.stat(full);
          const raw = await fs.readFile(full, 'utf-8');
          const { meta, body } = parseFrontmatter(raw);
          const tags = Array.isArray(meta.tags)
            ? (meta.tags as string[])
            : typeof meta.tags === 'string'
              ? [meta.tags as string]
              : [];
          items.push({
            filePath: full,
            fileName: ent.name,
            meta: {
              title: (meta.title as string) || ent.name.replace(/\.md$/, ''),
              author: meta.author as string | undefined,
              status: meta.status as BookMeta['status'],
              rating: typeof meta.rating === 'number' ? meta.rating : undefined,
              started: meta.started as string | undefined,
              finished: meta.finished as string | undefined,
              tags,
              totalPages: typeof meta.totalPages === 'number' ? meta.totalPages : undefined,
              currentPage: typeof meta.currentPage === 'number' ? meta.currentPage : undefined,
            },
            bodyPreview: body.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 200),
            mtime: stat.mtimeMs,
          });
        } catch (err) {
          logger.warn('[books:list] parse failed', { fileName: path.basename(full), error: err });
        }
      }
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    'books:create': async (
      _e: unknown,
      vaultPath: string,
      title: string,
      author?: string
    ) => {
      const root = path.resolve(vaultPath);
      const dir = path.join(root, BOOKS_DIR);
      validateVaultPath(dir, root);
      await ensureDir(dir);
      const safeTitle = safeName(title);
      if (!safeTitle) return { ok: false, error: 'タイトルが空です' };
      let filePath = path.join(dir, `${safeTitle}.md`);
      let i = 1;
      while (await exists(filePath)) {
        filePath = path.join(dir, `${safeTitle} (${i}).md`);
        i += 1;
      }
      validateVaultPath(filePath, root);
      const meta: Frontmatter = {
        title,
        author: author || '',
        status: 'want-to-read',
        rating: null,
        started: null,
        finished: null,
        tags: [],
      };
      const body = `# ${title}\n\n## 概要\n\n\n## 印象に残った所\n\n\n## 学んだこと・感想\n\n`;
      await atomicWrite(filePath, stringifyFrontmatter(meta, body));
      return { ok: true, filePath };
    },

    'books:updateMeta': async (
      _e: unknown,
      filePath: string,
      partialMeta: Partial<BookMeta>
    ) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      validateVaultPath(filePath, root);
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const merged: Frontmatter = { ...meta };
      for (const [k, v] of Object.entries(partialMeta)) {
        if (v === undefined) continue;
        merged[k] = v as Frontmatter[string];
      }
      // Auto-set started/finished based on status changes
      if (partialMeta.status === 'reading' && !merged.started) {
        merged.started = todayISO();
      }
      if (partialMeta.status === 'done' && !merged.finished) {
        merged.finished = todayISO();
      }
      await backupFile(filePath, root);
      await atomicWrite(filePath, stringifyFrontmatter(merged, body));
      return { ok: true };
    },

    'books:delete': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!filePath.includes(`${path.sep}${BOOKS_DIR}${path.sep}`)) {
        return { ok: false, error: 'invalid path' };
      }
      await fs.unlink(filePath);
      // Also delete the sidecar reading-note file if it exists
      const reading = readingNotePath(filePath);
      if (await exists(reading)) {
        await fs.unlink(reading).catch(() => {});
      }
      return { ok: true };
    },

    // ---- Reading-note (timestamped append-only sidecar) ----

    'books:getReadingNote': async (_e: unknown, bookFilePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      validateVaultPath(bookFilePath, root);
      const notePath = readingNotePath(bookFilePath);
      validateVaultPath(notePath, root);
      if (!(await exists(notePath))) return { content: '', notePath };
      return { content: await fs.readFile(notePath, 'utf-8'), notePath };
    },

    'books:appendReadingNote': async (_e: unknown, bookFilePath: string, text: string) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      validateVaultPath(bookFilePath, root);
      if (typeof text !== 'string' || !text.trim()) {
        return { ok: false, error: '本文が空です' };
      }
      const notePath = readingNotePath(bookFilePath);
      validateVaultPath(notePath, root);
      await ensureDir(path.dirname(notePath));
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const block = `\n---\n**${ts}**\n\n${text.trim()}\n`;
      await fs.appendFile(notePath, block, 'utf-8');
      return { ok: true, notePath };
    },

    'books:writeReadingNote': async (_e: unknown, bookFilePath: string, content: string) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      validateVaultPath(bookFilePath, root);
      const notePath = readingNotePath(bookFilePath);
      validateVaultPath(notePath, root);
      await atomicWrite(notePath, typeof content === 'string' ? content : '');
      return { ok: true, notePath };
    },
  };
}

export function registerBooksHandlers() {
  const handlers = createBooksHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}

function readingNotePath(bookFilePath: string): string {
  const dir = path.dirname(bookFilePath);
  const base = path.basename(bookFilePath, '.md');
  return path.join(dir, `${base}_reading.md`);
}
