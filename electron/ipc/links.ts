import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateVaultPath, setCurrentVaultPath, exists as fsExists } from './utils';
import { getBacklinkSources } from './backlinks';

const RESERVED_DIRS = new Set(['.obsidian', '.classnotes', '.history', 'Books', 'Memos']);

export type LinkTarget = {
  name: string;        // wikilink target (filename without .md)
  filePath: string;    // absolute path
  category: 'subject-note' | 'subject-overview' | 'book' | 'memo';
  subject?: string;
};

export type Backlink = {
  filePath: string;
  fileName: string;
  category: string;
  subject?: string;
  snippet: string;
};

const exists = fsExists;

async function listMdInDir(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .map((e) => path.join(dir, e.name));
}

async function collectAllMd(vaultPath: string): Promise<LinkTarget[]> {
  const targets: LinkTarget[] = [];
  if (!(await exists(vaultPath))) return targets;

  const subjectEntries = await fs.readdir(vaultPath, { withFileTypes: true });
  for (const sd of subjectEntries) {
    if (!sd.isDirectory()) continue;
    if (sd.name.startsWith('.')) continue;
    if (sd.name === 'Books') {
      for (const f of await listMdInDir(path.join(vaultPath, 'Books'))) {
        targets.push({
          name: path.basename(f, '.md'),
          filePath: f,
          category: 'book',
        });
      }
      continue;
    }
    if (sd.name === 'Memos') {
      for (const f of await listMdInDir(path.join(vaultPath, 'Memos'))) {
        targets.push({
          name: path.basename(f, '.md'),
          filePath: f,
          category: 'memo',
        });
      }
      continue;
    }
    if (RESERVED_DIRS.has(sd.name)) continue;

    const subject = sd.name;
    const overview = path.join(vaultPath, subject, '_概要.md');
    if (await exists(overview)) {
      targets.push({
        name: subject,
        filePath: overview,
        category: 'subject-overview',
        subject,
      });
    }
    const notesDir = path.join(vaultPath, subject, 'notes');
    for (const f of await listMdInDir(notesDir)) {
      targets.push({
        name: path.basename(f, '.md'),
        filePath: f,
        category: 'subject-note',
        subject,
      });
    }
  }
  return targets;
}

export function createLinksHandlers() {
  return {
    'links:listTargets': async (_e: unknown, vaultPath: string): Promise<LinkTarget[]> => {
      const root = path.resolve(vaultPath);
      setCurrentVaultPath(root);
      return collectAllMd(root);
    },

    'links:backlinks': async (_e: unknown, vaultPath: string, targetName: string): Promise<Backlink[]> => {
      const root = path.resolve(vaultPath);
      setCurrentVaultPath(root);
      const escaped = targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wikilinkRe = new RegExp(`\\[\\[\\s*${escaped}(\\|[^\\]]*)?\\s*\\]\\]`, 'i');

      const sourceFiles = await getBacklinkSources(root, targetName);
      if (sourceFiles.length === 0) return [];

      const targets = await collectAllMd(root);
      const targetByPath = new Map(targets.map((t) => [t.filePath, t]));

      const hits: Backlink[] = [];
      for (const fp of sourceFiles) {
        const t = targetByPath.get(fp);
        if (!t || t.name === targetName) continue;
        try {
          validateVaultPath(t.filePath, root);
          const content = await fs.readFile(t.filePath, 'utf-8');
          const m = content.match(wikilinkRe);
          if (m) {
            const idx = content.indexOf(m[0]);
            const start = Math.max(0, idx - 40);
            const end = Math.min(content.length, idx + m[0].length + 60);
            const snippet = content.slice(start, end).replace(/\s+/g, ' ');
            hits.push({
              filePath: t.filePath,
              fileName: path.basename(t.filePath),
              category: t.category,
              subject: t.subject,
              snippet: (start > 0 ? '…' : '') + snippet + (end < content.length ? '…' : ''),
            });
          }
        } catch {
          // ignore unreadable files
        }
      }
      return hits;
    },
  };
}

export function registerLinksHandlers() {
  const handlers = createLinksHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
