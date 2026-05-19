import { ipcMain } from 'electron';
import * as path from 'path';
import { setCurrentVaultPath } from './utils';
import { getVaultIndex } from '../vault-index';

type Hit = {
  subject: string;
  filePath: string;
  fileName: string;
  snippet: string;
  matchType?: 'filename' | 'body' | 'tag' | 'frontmatter';
  matchedTag?: string;
};

function makeSnippet(text: string, keyword: string): string {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return '';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + keyword.length + 60);
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  return (head + text.slice(start, end) + tail).replace(/\s+/g, ' ');
}

function frontmatterMatchSnippet(
  meta: Record<string, unknown>,
  keyword: string
): string | null {
  const lower = keyword.toLowerCase();
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'tags') continue;
    const valStr = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    if (valStr.toLowerCase().includes(lower) || k.toLowerCase().includes(lower)) {
      return `${k}: ${valStr}`;
    }
  }
  return null;
}

function searchScope(relPath: string): { subject: string } | null {
  const parts = relPath.split('/');
  if (parts.length < 3) return null;
  if (parts[1] !== 'notes' && parts[1] !== 'materials') return null;
  return { subject: parts[0] };
}

export async function queryVaultSearch(vaultPath: string, keyword: string): Promise<Hit[]> {
    const root = path.resolve(vaultPath);
    const kw = keyword.trim();
    if (!kw) return [];

    // Tag-only search mode: query starts with "#"
    const isTagSearch = kw.startsWith('#');
    const tagQuery = isTagSearch ? kw.slice(1).trim().toLowerCase() : '';
    const lowerKw = kw.toLowerCase();

    const index = await getVaultIndex(root);
    const hits: Hit[] = [];

    for (const file of index.files) {
      const scope = searchScope(file.relPath);
      if (!scope) continue;
      const fileName = path.basename(file.relPath);
      const filePath = path.join(root, ...file.relPath.split('/'));
      const isMd = file.kind === 'note';

      // Tag-only search: only inspect markdown frontmatter
      if (isTagSearch) {
        if (!isMd) continue;
        const matched = file.tags.find((tag) =>
          tagQuery ? tag.toLowerCase().includes(tagQuery) : true
        );
        if (matched) {
          hits.push({
            subject: scope.subject,
            filePath,
            fileName,
            snippet: `tags: [${file.tags.join(', ')}]`,
            matchType: 'tag',
            matchedTag: matched,
          });
        }
        continue;
      }

      // Filename match (case-insensitive)
      if (fileName.toLowerCase().includes(lowerKw)) {
        hits.push({
          subject: scope.subject,
          filePath,
          fileName,
          snippet: '(ファイル名一致)',
          matchType: 'filename',
        });
        continue;
      }

      if (!isMd) continue;

      // Frontmatter (non-tag) match
      const fmSnippet = frontmatterMatchSnippet(file.frontmatter, kw);
      if (fmSnippet) {
        hits.push({
          subject: scope.subject,
          filePath,
          fileName,
          snippet: fmSnippet,
          matchType: 'frontmatter',
        });
        continue;
      }

      // Tag match in regular search
      const tagHit = file.tags.find((tag) => tag.toLowerCase().includes(lowerKw));
      if (tagHit) {
        hits.push({
          subject: scope.subject,
          filePath,
          fileName,
          snippet: `tags: [${file.tags.join(', ')}]`,
          matchType: 'tag',
          matchedTag: tagHit,
        });
        continue;
      }

      // Body/search text match
      if (file.searchText.toLowerCase().includes(lowerKw)) {
        hits.push({
          subject: scope.subject,
          filePath,
          fileName,
          snippet: makeSnippet(file.searchText, kw),
          matchType: 'body',
        });
      }
    }

    return hits.slice(0, 100);
}

export function createSearchHandlers() {
  return {
    'search:query': async (_e: unknown, vaultPath: string, keyword: string): Promise<Hit[]> => {
      const root = path.resolve(vaultPath);
      setCurrentVaultPath(root);
      return queryVaultSearch(root, keyword);
    },
  };
}

export function registerSearchHandlers() {
  const handlers = createSearchHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
