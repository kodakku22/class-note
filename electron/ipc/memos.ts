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
} from './utils';
import { logger } from '../logger';

const MEMOS_DIR = 'Memos';

export type MemoEntry = {
  filePath: string;
  fileName: string;
  created: string;
  tags: string[];
  body: string;
  mtime: number;
};

function timestampFilename(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(
    d.getMinutes()
  ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function inlineTagsFromBody(body: string): string[] {
  const set = new Set<string>();
  const re = /(?:^|\s)#([^\s#()[\].,!?]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) set.add(m[1]);
  return Array.from(set);
}

export { inlineTagsFromBody };

export function createMemosHandlers() {
  return {
    'memos:list': async (_e: unknown, vaultPath: string): Promise<MemoEntry[]> => {
      const root = path.resolve(vaultPath);
      const dir = path.join(root, MEMOS_DIR);
      validateVaultPath(dir, root);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items: MemoEntry[] = [];
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
        if (ent.name.startsWith('_')) continue;
        const full = path.join(dir, ent.name);
        try {
          const stat = await fs.stat(full);
          const raw = await fs.readFile(full, 'utf-8');
          const { meta, body } = parseFrontmatter(raw);
          const explicitTags = Array.isArray(meta.tags)
            ? (meta.tags as string[])
            : typeof meta.tags === 'string'
              ? [meta.tags as string]
              : [];
          const allTags = Array.from(new Set([...explicitTags, ...inlineTagsFromBody(body)]));
          items.push({
            filePath: full,
            fileName: ent.name,
            created: (meta.created as string) || ent.name.replace(/\.md$/, ''),
            tags: allTags,
            body: body.trim(),
            mtime: stat.mtimeMs,
          });
        } catch (err) {
          logger.warn('[memos:list] parse failed', { fileName: path.basename(full), error: err });
        }
      }
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    'memos:create': async (
      _e: unknown,
      vaultPath: string,
      content: string,
      tags: string[] = []
    ) => {
      if (!content.trim()) return { ok: false, error: 'メモが空です' };
      const root = path.resolve(vaultPath);
      const dir = path.join(root, MEMOS_DIR);
      validateVaultPath(dir, root);
      await ensureDir(dir);
      const stamp = timestampFilename();
      const filePath = path.join(dir, `${stamp}.md`);
      validateVaultPath(filePath, root);
      const d = new Date();
      const created = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}`;
      const meta: Frontmatter = {
        created,
        tags,
      };
      await atomicWrite(filePath, stringifyFrontmatter(meta, content.trim() + '\n'));
      return { ok: true, filePath };
    },

    'memos:update': async (_e: unknown, filePath: string, content: string) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      validateVaultPath(filePath, root);
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta } = parseFrontmatter(raw);
      await backupFile(filePath, root);
      await atomicWrite(filePath, stringifyFrontmatter(meta, content.trim() + '\n'));
      return { ok: true };
    },

    'memos:delete': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!filePath.includes(`${path.sep}${MEMOS_DIR}${path.sep}`)) {
        return { ok: false, error: 'invalid path' };
      }
      await fs.unlink(filePath);
      return { ok: true };
    },
  };
}

export function registerMemosHandlers() {
  const handlers = createMemosHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
