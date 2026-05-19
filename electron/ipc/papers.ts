// Papers (論文・文献) IPC handlers.
//
// Papers live under <vault>/Papers/<safe-title>.md as plain Markdown with
// rich academic frontmatter (authors, venue, year, DOI/arXiv, bibkey, etc.).
// They are distinct from Books — Books are general reading, Papers are
// citation-aware research artifacts.
//
// Each Paper can also have a sidecar reading note (`<base>_reading.md`)
// which stores chronological reading log entries — same pattern as Books.
//
// Phase 2 capabilities added:
//   - papers:importFromArxiv   — fetch metadata from export.arxiv.org
//   - papers:importFromDOI     — fetch metadata from api.crossref.org
//   - papers:exportBibtex      — aggregate frontmatter into refs.bib
//   - papers:listForCitation   — quick lookup for citation picker UI
import { ipcMain, net, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter';
import {
  validateVaultPath,
  getCurrentVaultPath,
  atomicWrite,
  backupFile,
  ensureDir,
  exists,
  safeName,
} from './utils';
import {
  PaperFrontmatterSchema,
  type PaperFrontmatter,
  type PaperStatus,
} from './schemas';
import { logger } from '../logger';
import { runPrompt } from '../ai/provider';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import { RetryableHttpError, withResilience } from '../net/resilience';
import { bibtexEntryToPaper, parseBibtex } from '../papers/bibtex';
import { consumeFileAccessGrant, createFileAccessGrant } from './file-access';
import { extractPdfTextFromBuffer, imageOnlyPdfError } from '../pdf-text';

const PAPERS_DIR = 'Papers';
const READING_SUFFIX = '_reading.md';

export type PaperEntry = {
  filePath: string;
  fileName: string;
  meta: PaperFrontmatter;
  bodyPreview: string;
  mtime: number;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Coerce raw frontmatter into the typed shape, preserving unknown keys.
 * If parsing fails (corrupted YAML), fall back to a minimal stub so the
 * paper still appears in the list — losing metadata is preferable to losing
 * the file entirely.
 */
function coerceMeta(raw: Record<string, unknown>): PaperFrontmatter {
  const result = PaperFrontmatterSchema.safeParse(raw);
  if (result.success) return result.data;
  return { type: 'paper' as const };
}

// BibTeX entry types we recognize. We default to @article unless venue
// hints at a conference (NeurIPS / ICLR / ACL / etc.) → @inproceedings.
function inferBibtexType(venue: string | undefined): string {
  if (!venue) return 'misc';
  const v = venue.toLowerCase();
  if (/proc\.|conference|symposium|workshop|neurips|nips|iclr|icml|cvpr|acl|emnlp|naacl|aaai|kdd|sigir|chi|uist/.test(v)) {
    return 'inproceedings';
  }
  if (v.includes('arxiv')) return 'misc';
  return 'article';
}

function escapeBibValue(s: string): string {
  return s.replace(/[{}\\]/g, (c) => `\\${c}`).replace(/\n+/g, ' ');
}

function readingPathFor(paperFilePath: string): string {
  const ext = path.extname(paperFilePath);
  const base = paperFilePath.slice(0, paperFilePath.length - ext.length);
  return `${base}${READING_SUFFIX}`;
}

export { coerceMeta, readingPathFor, todayISO };

/**
 * IPC handler table of contents (Phase 2-D logical sectioning):
 *
 *   Reading I/O ............... papers:list, papers:listForCitation, papers:getReadingNote
 *   CRUD ...................... papers:create, papers:updateMeta, papers:appendReadingNote, papers:delete
 *   Citation export ........... papers:exportBibtex
 *   External import ........... papers:importFromArxiv, papers:importFromDOI
 *
 * Section dividers below mark these groups for review. We keep the file
 * physically intact (vs splitting into a directory) because the handlers
 * share many helpers (coerceMeta, readingPathFor, escapeBibValue) and the
 * file is well-tested as a unit.
 */
export function createPapersHandlers() {
  return {
    // ===== Reading I/O =====
    // List all papers under <vault>/Papers/, excluding sidecar reading notes.
    'papers:list': async (_e: unknown, vaultPath: string): Promise<PaperEntry[]> => {
      const root = path.resolve(vaultPath);
      const dir = path.join(root, PAPERS_DIR);
      validateVaultPath(dir, root);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items: PaperEntry[] = [];
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
        if (ent.name.startsWith('_')) continue;
        if (ent.name.endsWith(READING_SUFFIX)) continue;
        const full = path.join(dir, ent.name);
        try {
          const stat = await fs.stat(full);
          const raw = await fs.readFile(full, 'utf-8');
          const { meta, body } = parseFrontmatter(raw);
          items.push({
            filePath: full,
            fileName: ent.name,
            meta: coerceMeta(meta as Record<string, unknown>),
            bodyPreview: body.slice(0, 280).replace(/\s+/g, ' ').trim(),
            mtime: stat.mtimeMs,
          });
        } catch {
          // unreadable paper — skip silently
        }
      }
      // Default sort: most recently modified first. Renderer can re-sort.
      items.sort((a, b) => b.mtime - a.mtime);
      return items;
    },

    // Create a new paper. The minimal input is { title }; bibkey, authors, year
    // are optional. Returns the created file path so the renderer can navigate.
    // ===== CRUD =====
    'papers:create': async (
      _e: unknown,
      vaultPath: string,
      input: {
        title: string;
        bibkey?: string;
        authors?: string[];
        year?: number;
        venue?: string;
        doi?: string;
        arxiv?: string;
        url?: string;
        tags?: string[];
        status?: PaperStatus;
      }
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const title = (input.title ?? '').trim();
      if (!title) return { ok: false, error: 'タイトルが空です' };
      const dir = path.join(root, PAPERS_DIR);
      await ensureDir(dir);
      const fileName = `${safeName(title) || 'paper'}.md`;
      const full = path.join(dir, fileName);
      validateVaultPath(full, root);
      if (await exists(full)) {
        return { ok: false, error: '同じタイトルの論文が既に存在します', filePath: full };
      }
      const meta: PaperFrontmatter = {
        title,
        type: 'paper',
        addedAt: todayISO(),
        status: input.status ?? 'to-read',
        ...(input.bibkey ? { bibkey: input.bibkey } : {}),
        ...(input.authors ? { authors: input.authors } : {}),
        ...(input.year ? { year: input.year } : {}),
        ...(input.venue ? { venue: input.venue } : {}),
        ...(input.doi ? { doi: input.doi } : {}),
        ...(input.arxiv ? { arxiv: input.arxiv } : {}),
        ...(input.url ? { url: input.url } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
      };
      const body = `# ${title}\n\n## 概要\n\n_（AI 要約 or 手動でここに記入）_\n\n## ノート\n\n## 関連\n\n## 引用\n`;
      const content = stringifyFrontmatter(meta as Record<string, unknown>, body);
      await atomicWrite(full, content);
      return { ok: true, filePath: full };
    },

    // Update frontmatter only (preserves the body). Mirror books:updateMeta.
    'papers:updateMeta': async (
      _e: unknown,
      filePath: string,
      partial: Partial<PaperFrontmatter>
    ) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      let full: string;
      try {
        full = validateVaultPath(filePath, root);
      } catch {
        return { ok: false, error: 'filePath outside active vault' };
      }
      if (!(await exists(full))) return { ok: false, error: 'paper not found' };
      const raw = await fs.readFile(full, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const merged: PaperFrontmatter = coerceMeta({
        ...(meta as Record<string, unknown>),
        ...(partial as Record<string, unknown>),
        type: 'paper',
      });
      await backupFile(full, root);
      await atomicWrite(full, stringifyFrontmatter(merged as Record<string, unknown>, body));
      return { ok: true };
    },

    // Soft-delete: move the paper (and its reading sidecar if any) into
    // <vault>/.trash/Papers/<orig>_<ts>.md.
    'papers:delete': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      let full: string;
      try {
        full = validateVaultPath(filePath, root);
      } catch {
        return { ok: false, error: 'filePath outside active vault' };
      }
      if (!(await exists(full))) return { ok: false, error: 'paper not found' };
      const trashDir = path.join(root, '.trash', 'Papers');
      await ensureDir(trashDir);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = path.basename(full, '.md');
      const dest = path.join(trashDir, `${base}_${stamp}.md`);
      validateVaultPath(dest, root);
      await fs.rename(full, dest);
      // Move the reading-note sidecar if present (best-effort).
      const reading = readingPathFor(full);
      validateVaultPath(reading, root);
      if (await exists(reading)) {
        const readingDest = path.join(trashDir, `${base}_${stamp}_reading.md`);
        validateVaultPath(readingDest, root);
        try {
          await fs.rename(reading, readingDest);
        } catch {
          // ignore
        }
      }
      return { ok: true, trashedTo: dest };
    },

    // Reading note sidecar — same shape as books:appendReadingNote.
    'papers:getReadingNote': async (_e: unknown, paperFilePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { content: '', notePath: '' };
      let paperFull: string;
      try {
        paperFull = validateVaultPath(paperFilePath, root);
      } catch {
        return { content: '', notePath: '' };
      }
      const reading = readingPathFor(paperFull);
      validateVaultPath(reading, root);
      if (!(await exists(reading))) return { content: '', notePath: reading };
      const content = await fs.readFile(reading, 'utf-8');
      return { content, notePath: reading };
    },

    'papers:appendReadingNote': async (_e: unknown, paperFilePath: string, text: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      let paperFull: string;
      try {
        paperFull = validateVaultPath(paperFilePath, root);
      } catch {
        return { ok: false, error: 'filePath outside active vault' };
      }
      const reading = readingPathFor(paperFull);
      validateVaultPath(reading, root);
      await ensureDir(path.dirname(reading));
      const ts = new Date();
      const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
      const block = `\n---\n**${stamp}**\n\n${text.trim()}\n`;
      await fs.appendFile(reading, block, 'utf-8');
      return { ok: true };
    },

    // Export BibTeX
    // ===== Citation export =====
    'papers:exportBibtex': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);
      const dir = path.join(root, PAPERS_DIR);
      if (!(await exists(dir))) return { ok: false, error: 'Papers フォルダがありません' };

      const entries = await fs.readdir(dir, { withFileTypes: true });
      const bibEntries: string[] = [];
      let skipped = 0;
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
        if (ent.name.endsWith(READING_SUFFIX)) continue;
        const full = path.join(dir, ent.name);
        try {
          const raw = await fs.readFile(full, 'utf-8');
          const { meta } = parseFrontmatter(raw);
          const bibkey = (meta as { bibkey?: string }).bibkey;
          if (!bibkey) {
            skipped += 1;
            continue;
          }
          const title = (meta as { title?: string }).title ?? ent.name.replace(/\.md$/, '');
          const authors = Array.isArray((meta as { authors?: unknown }).authors)
            ? ((meta as { authors?: string[] }).authors as string[]).join(' and ')
            : typeof (meta as { authors?: unknown }).authors === 'string'
              ? ((meta as { authors?: string }).authors as string)
              : '';
          const year = (meta as { year?: number }).year;
          const venue = (meta as { venue?: string }).venue;
          const doi = (meta as { doi?: string }).doi;
          const arxiv = (meta as { arxiv?: string }).arxiv;
          const url = (meta as { url?: string }).url;
          const type = inferBibtexType(venue);
          const fields: string[] = [
            `  title = {${escapeBibValue(title)}}`,
            authors ? `  author = {${escapeBibValue(authors)}}` : '',
            year ? `  year = {${year}}` : '',
            venue
              ? type === 'inproceedings'
                ? `  booktitle = {${escapeBibValue(venue)}}`
                : `  journal = {${escapeBibValue(venue)}}`
              : '',
            doi ? `  doi = {${escapeBibValue(doi)}}` : '',
            arxiv ? `  eprint = {${escapeBibValue(arxiv)}}` : '',
            arxiv ? `  archivePrefix = {arXiv}` : '',
            url ? `  url = {${escapeBibValue(url)}}` : '',
          ].filter(Boolean);
          bibEntries.push(`@${type}{${bibkey},\n${fields.join(',\n')}\n}`);
        } catch {
          skipped += 1;
        }
      }

      if (bibEntries.length === 0) {
        return { ok: false, error: 'bibkey 付きの論文が 1 件もありません', skipped };
      }
      const refsPath = path.join(dir, 'refs.bib');
      validateVaultPath(refsPath, root);
      const header = `% ClassNotes refs.bib — auto-generated ${new Date().toISOString()}\n% Edit your papers' frontmatter to update; this file will be overwritten on next export.\n\n`;
      await atomicWrite(refsPath, header + bibEntries.join('\n\n') + '\n');
      return { ok: true, filePath: refsPath, count: bibEntries.length, skipped };
    },

    // Lightweight list for the citation picker
    'papers:listForCitation': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      const dir = path.join(root, PAPERS_DIR);
      validateVaultPath(dir, root);
      if (!(await exists(dir))) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const out: { bibkey: string; title: string; authors: string; year: number | null }[] = [];
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
        if (ent.name.endsWith(READING_SUFFIX)) continue;
        try {
          const raw = await fs.readFile(path.join(dir, ent.name), 'utf-8');
          const { meta } = parseFrontmatter(raw);
          const bibkey = (meta as { bibkey?: string }).bibkey;
          if (!bibkey) continue;
          const title = (meta as { title?: string }).title ?? ent.name.replace(/\.md$/, '');
          const authorsRaw = (meta as { authors?: unknown }).authors;
          const authors = Array.isArray(authorsRaw)
            ? (authorsRaw as string[]).slice(0, 2).join(', ') + (authorsRaw.length > 2 ? ' et al.' : '')
            : typeof authorsRaw === 'string'
              ? authorsRaw
              : '';
          const year = (meta as { year?: number }).year ?? null;
          out.push({ bibkey, title, authors, year });
        } catch {
          // skip
        }
      }
      return out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    },
  };
}

export function registerPapersHandlers() {
  const handlers = createPapersHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }

  // ----- Phase 2: arXiv / DOI / BibTeX -----

  // Fetch a URL's body via Electron's net module. Caps at 1 MB and 30s.
  function fetchTextOnce(url: string, headers: Record<string, string> = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = net.request({ method: 'GET', url, redirect: 'follow' });
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
      let total = 0;
      const MAX = 1024 * 1024;
      const buf: Buffer[] = [];
      const timeout = setTimeout(() => {
        req.abort();
        reject(new Error('タイムアウト (30s)'));
      }, 30_000);
      req.on('response', (resp) => {
        if (resp.statusCode < 200 || resp.statusCode >= 400) {
          clearTimeout(timeout);
          reject(new RetryableHttpError(resp.statusCode));
          return;
        }
        resp.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX) {
            clearTimeout(timeout);
            req.abort();
            reject(new Error('応答サイズが上限を超えています'));
            return;
          }
          buf.push(chunk);
        });
        resp.on('end', () => {
          clearTimeout(timeout);
          resolve(Buffer.concat(buf).toString('utf-8'));
        });
        resp.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      req.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
      req.end();
    });
  }

  async function fetchText(
    url: string,
    headers: Record<string, string> = {},
    maxRetries = 2
  ): Promise<string> {
    const host = new URL(url).host || 'unknown';
    return withResilience(`papers:${host}`, () => fetchTextOnce(url, headers), {
      maxRetries,
      baseDelayMs: 500,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 },
    });
  }

  /**
   * Extract a single tag value from arXiv XML, handling the Atom namespace.
   * arXiv uses `<title>`, `<summary>`, `<published>`, `<author><name>` etc.
   * We do simple regex-based parsing rather than pulling in a full XML lib.
   */
  function arxivField(xml: string, tag: string): string | undefined {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim().replace(/\s+/g, ' ') : undefined;
  }

  /**
   * Generate a Pandoc-style bibkey from "FirstAuthor + Year + FirstWord".
   * E.g. "Vaswani et al. 2017 Attention…" → "vaswani2017attention"
   */
  function deriveBibkey(authors: string[], year: number | undefined, title: string): string {
    const first = (authors[0] ?? '').split(/\s+/).pop() ?? 'unknown';
    const yearPart = year ? String(year) : 'nd';
    const word = (title.match(/[A-Za-z]+/) ?? ['paper'])[0].toLowerCase();
    return `${first.toLowerCase()}${yearPart}${word}`.replace(/[^a-z0-9]/g, '');
  }

  /**
   * Import a paper from arXiv. Accepts either a full URL or a bare ID
   * (e.g. "1706.03762" or "1706.03762v3").
   *
   * arXiv export API: http://export.arxiv.org/api/query?id_list=<ID>
   * Returns Atom XML; we parse the minimum fields and compose frontmatter.
   */
  ipcMain.handle('papers:importFromArxiv', async (_e, vaultPath: string, idOrUrl: string) => {
    const root = path.resolve(vaultPath);
    validateVaultPath(root, root);

    // Normalize input: strip URL chrome and version suffix for the API call,
    // but preserve the version in the saved frontmatter when present.
    const trimmed = idOrUrl.trim();
    const idMatch = trimmed.match(/(\d{4}\.\d{4,5})(v\d+)?/);
    if (!idMatch) return { ok: false, error: '有効な arXiv ID が見つかりません (例: 1706.03762)' };
    const arxivId = idMatch[1] + (idMatch[2] ?? '');
    const apiUrl = `http://export.arxiv.org/api/query?id_list=${idMatch[1]}`;

    let xml: string;
    try {
      xml = await fetchText(apiUrl, { 'user-agent': 'ClassNotes/0.1' });
    } catch (err) {
      logger.warn('[papers:importFromArxiv] fetch failed', err);
      return { ok: false, error: `arXiv API 取得失敗: ${String(err)}` };
    }

    // Find the <entry> ... </entry> block (skip the feed-level <title>).
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return { ok: false, error: 'arXiv レスポンスに entry が含まれません' };
    const entry = entryMatch[1];

    const title = arxivField(entry, 'title') ?? `arXiv:${arxivId}`;
    const summary = arxivField(entry, 'summary') ?? '';
    const published = arxivField(entry, 'published') ?? '';
    const year = published ? Number(published.slice(0, 4)) : undefined;
    // Authors: each <author><name>X</name></author>
    const authors = Array.from(entry.matchAll(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g))
      .map((m) => m[1].trim())
      .filter(Boolean);
    // Primary category from <arxiv:primary_category term="cs.LG"/> or similar.
    const categoryMatch = entry.match(/primary_category[^>]*term="([^"]+)"/);
    const venue = categoryMatch ? `arXiv (${categoryMatch[1]})` : 'arXiv';
    const bibkey = deriveBibkey(authors, year, title);

    const meta: PaperFrontmatter = {
      title,
      type: 'paper',
      bibkey,
      authors,
      year,
      venue,
      arxiv: arxivId,
      url: `https://arxiv.org/abs/${idMatch[1]}`,
      addedAt: new Date().toISOString().slice(0, 10),
      status: 'to-read',
      summary: summary.slice(0, 280),
    };
    const dir = path.join(root, PAPERS_DIR);
    await ensureDir(dir);
    const fileName = `${safeName(title) || `arxiv-${arxivId}`}.md`;
    const full = path.join(dir, fileName);
    validateVaultPath(full, root);
    if (await exists(full)) {
      return { ok: false, error: '同名の論文が既に存在します', filePath: full };
    }
    const body = `# ${title}\n\n## 概要\n\n${summary}\n\n## ノート\n\n## 関連\n\n## 引用\n\n[arXiv:${arxivId}](https://arxiv.org/abs/${idMatch[1]})\n`;
    await atomicWrite(full, stringifyFrontmatter(meta as Record<string, unknown>, body));
    return { ok: true, filePath: full, bibkey, title };
  });

  /**
   * Import a paper from a DOI via Crossref's REST API.
   *   GET https://api.crossref.org/works/<DOI>
   * Returns JSON; we extract title, authors, container-title, year, etc.
   */
  ipcMain.handle('papers:importFromDOI', async (_e, vaultPath: string, doiInput: string) => {
    const root = path.resolve(vaultPath);
    validateVaultPath(root, root);

    // Allow "10.1000/xyz" or full URL "https://doi.org/10.1000/xyz".
    const trimmed = doiInput.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    if (!/^10\.\d+\//.test(trimmed)) {
      return { ok: false, error: '有効な DOI ではありません (例: 10.1145/3292500.3330701)' };
    }

    const apiUrl = `https://api.crossref.org/works/${encodeURIComponent(trimmed)}`;
    let body: string;
    try {
      body = await fetchText(apiUrl, {
        'user-agent': 'ClassNotes/0.1 (mailto:noreply@classnotes.app)',
        accept: 'application/json',
      });
    } catch (err) {
      logger.warn('[papers:importFromDOI] fetch failed', err);
      return { ok: false, error: `Crossref 取得失敗: ${String(err)}` };
    }

    let parsed: { message?: Record<string, unknown> };
    try {
      parsed = JSON.parse(body);
    } catch {
      return { ok: false, error: 'Crossref 応答のパースに失敗' };
    }
    const msg = parsed.message;
    if (!msg) return { ok: false, error: 'Crossref レスポンスに message がありません' };

    const titleArr = msg.title as string[] | undefined;
    const title = (titleArr && titleArr[0]) || `DOI:${trimmed}`;
    type CrossrefAuthor = { given?: string; family?: string; literal?: string };
    const authors = ((msg.author as CrossrefAuthor[]) ?? [])
      .map((a) => {
        if (a.literal) return a.literal;
        const parts = [a.given, a.family].filter(Boolean);
        return parts.join(' ');
      })
      .filter(Boolean);
    type CrossrefDateParts = { 'date-parts'?: number[][] };
    const issued = msg.issued as CrossrefDateParts | undefined;
    const year = issued?.['date-parts']?.[0]?.[0];
    const containerArr = msg['container-title'] as string[] | undefined;
    const venue = (containerArr && containerArr[0]) || (msg.publisher as string | undefined);
    const url = (msg.URL as string | undefined) ?? `https://doi.org/${trimmed}`;
    const abstractRaw = msg.abstract as string | undefined;
    // Crossref abstracts often contain JATS XML — strip tags for the summary.
    const summary = abstractRaw ? abstractRaw.replace(/<[^>]+>/g, '').trim() : '';
    const bibkey = deriveBibkey(authors, year, title);

    const meta: PaperFrontmatter = {
      title,
      type: 'paper',
      bibkey,
      authors,
      year,
      venue,
      doi: trimmed,
      url,
      addedAt: new Date().toISOString().slice(0, 10),
      status: 'to-read',
      summary: summary.slice(0, 280),
    };
    const dir = path.join(root, PAPERS_DIR);
    await ensureDir(dir);
    const fileName = `${safeName(title) || 'doi-import'}.md`;
    const full = path.join(dir, fileName);
    validateVaultPath(full, root);
    if (await exists(full)) {
      return { ok: false, error: '同名の論文が既に存在します', filePath: full };
    }
    const bodyMd = `# ${title}\n\n## 概要\n\n${summary}\n\n## ノート\n\n## 関連\n\n## 引用\n\n[DOI:${trimmed}](${url})\n`;
    await atomicWrite(full, stringifyFrontmatter(meta as Record<string, unknown>, bodyMd));
    return { ok: true, filePath: full, bibkey, title };
  });

  /**
   * Phase 3: Import a paper from a local PDF file using the selected AI provider.
   *
   * Flow:
   *  1. Read the PDF bytes (cap at ~30 MB — anything larger likely won't fit
   *     in the API's token budget anyway, and slow paths waste minutes).
   *  2. Base64-encode and send as a `document` content block alongside a
   *     structured extraction prompt.
   *  3. Parse the JSON response into PaperFrontmatter + body sections.
   *  4. Save under <vault>/Papers/.
   *
   * Provider behavior:
   *  - API key mode sends the PDF as a provider-native document/file part.
   *  - Login mode extracts text locally first, then sends text to the official
   *    CLI/OAuth backend. Image-only PDFs are rejected with a clear error.
   */
  /**
   * Open a system file picker for PDFs. Returns a one-time token, not the raw
   * path. Main keeps the real path in a short-lived registry.
   */
  ipcMain.handle('papers:pickPDFFile', async (e) => {
    const result = await dialog.showOpenDialog({
      title: '取込む PDF を選択',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return createFileAccessGrant(result.filePaths[0], 'paper-pdf', e.sender.id);
  });

  ipcMain.handle('papers:pickBibtexFile', async (e) => {
    const result = await dialog.showOpenDialog({
      title: '取込む BibTeX ファイルを選択',
      filters: [{ name: 'BibTeX', extensions: ['bib'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return createFileAccessGrant(result.filePaths[0], 'paper-bibtex', e.sender.id);
  });

  ipcMain.handle('papers:importFromBibtex', async (e, vaultPath: string, token: string) => {
    const root = path.resolve(vaultPath);
    validateVaultPath(root, root);
    let source: string;
    try {
      source = await consumeFileAccessGrant(token, 'paper-bibtex', e.sender.id);
    } catch {
      return {
        ok: false,
        imported: 0,
        skipped: 0,
        errors: ['BibTeX ファイルのアクセス許可が無効です。もう一度選択してください'],
        filePaths: [],
      };
    }
    if (!source.toLowerCase().endsWith('.bib')) {
      return { ok: false, imported: 0, skipped: 0, errors: ['.bib ファイルを選択してください'], filePaths: [] };
    }
    if (!(await exists(source))) {
      return { ok: false, imported: 0, skipped: 0, errors: ['BibTeX ファイルが見つかりません'], filePaths: [] };
    }
    const stat = await fs.stat(source);
    if (stat.size > 10 * 1024 * 1024) {
      return { ok: false, imported: 0, skipped: 0, errors: ['BibTeX ファイルが 10 MB を超えています'], filePaths: [] };
    }

    let entries;
    try {
      entries = parseBibtex(await fs.readFile(source, 'utf-8'));
    } catch (err) {
      return {
        ok: false,
        imported: 0,
        skipped: 0,
        errors: [`BibTeX の解析に失敗しました: ${String(err)}`],
        filePaths: [],
      };
    }
    const dir = path.join(root, PAPERS_DIR);
    await ensureDir(dir);

    const existingBibkeys = new Set<string>();
    const existingNames = new Set<string>();
    const currentFiles = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of currentFiles) {
      if (!ent.isFile()) continue;
      existingNames.add(ent.name.toLowerCase());
      if (!ent.name.endsWith('.md') || ent.name.endsWith(READING_SUFFIX)) continue;
      try {
        const raw = await fs.readFile(path.join(dir, ent.name), 'utf-8');
        const { meta } = parseFrontmatter(raw);
        const bibkey = (meta as { bibkey?: unknown }).bibkey;
        if (typeof bibkey === 'string' && bibkey.trim()) {
          existingBibkeys.add(bibkey.trim().toLowerCase());
        }
      } catch {
        // Corrupt notes should not block importing unrelated entries.
      }
    }

    const errors: string[] = [];
    const filePaths: string[] = [];
    let imported = 0;
    let skipped = 0;
    for (const entry of entries) {
      const paper = bibtexEntryToPaper(entry);
      const bibkey = paper.bibkey.trim();
      if (!bibkey) {
        skipped += 1;
        errors.push('bibkey が空のエントリをスキップしました');
        continue;
      }
      if (existingBibkeys.has(bibkey.toLowerCase())) {
        skipped += 1;
        continue;
      }

      const title = paper.title.trim() || bibkey;
      const meta: PaperFrontmatter = {
        title,
        type: 'paper',
        bibkey,
        authors: paper.authors,
        ...(paper.year ? { year: paper.year } : {}),
        ...(paper.venue ? { venue: paper.venue } : {}),
        ...(paper.doi ? { doi: paper.doi } : {}),
        ...(paper.arxiv ? { arxiv: paper.arxiv } : {}),
        ...(paper.url ? { url: paper.url } : {}),
        addedAt: todayISO(),
        status: 'to-read',
      };

      const safeBase = safeName(title) || safeName(bibkey) || 'paper';
      let fileName = `${safeBase}.md`;
      if (existingNames.has(fileName.toLowerCase())) {
        fileName = `${safeBase}-${safeName(bibkey) || 'bibtex'}.md`;
      }
      let full = path.join(dir, fileName);
      let suffix = 2;
      while (existingNames.has(path.basename(full).toLowerCase()) || (await exists(full))) {
        full = path.join(dir, `${safeBase}-${suffix}.md`);
        suffix += 1;
      }
      validateVaultPath(full, root);
      const body = [
        `# ${title}`,
        '',
        '## 概要',
        '',
        '_Zotero / Better BibTeX から取り込んだ論文です。必要に応じて概要を追加してください。_',
        '',
        '## ノート',
        '',
        '## 関連',
        '',
        '## 引用',
        '',
        `[@${bibkey}]`,
        '',
      ].join('\n');
      try {
        await atomicWrite(full, stringifyFrontmatter(meta as Record<string, unknown>, body));
        imported += 1;
        filePaths.push(full);
        existingBibkeys.add(bibkey.toLowerCase());
        existingNames.add(path.basename(full).toLowerCase());
      } catch (err) {
        skipped += 1;
        errors.push(`${bibkey}: ${String(err)}`);
      }
    }

    return { ok: true, imported, skipped, errors, filePaths };
  });

  ipcMain.handle('papers:importFromPDF', async (e, vaultPath: string, token: string) => {
    const root = path.resolve(vaultPath);
    validateVaultPath(root, root);
    let pdfPath: string;
    try {
      pdfPath = await consumeFileAccessGrant(token, 'paper-pdf', e.sender.id);
    } catch {
      return { ok: false, error: 'PDF ファイルのアクセス許可が無効です。もう一度選択してください' };
    }
    if (!(await exists(pdfPath))) {
      return { ok: false, error: 'PDF が見つかりません' };
    }

    const settings = await loadSettings();
    if (settings.aiProvider === 'none') {
      return { ok: false, error: 'AI 機能が無効です。Settings から有効にしてください。' };
    }
    const apiKey = await loadSelectedAiApiKey(settings);
    if (settings.aiAuthMode === 'api-key' && !apiKey) {
      return { ok: false, error: '選択中プロバイダーの API キーが未設定です' };
    }

    // Size cap. Files larger than 30 MB are unlikely to fit in token budget.
    const stat = await fs.stat(pdfPath);
    if (stat.size > 30 * 1024 * 1024) {
      return { ok: false, error: 'PDF が 30 MB を超えています (取込上限)' };
    }

    let pdfBytes: Buffer;
    try {
      pdfBytes = await fs.readFile(pdfPath);
    } catch (err) {
      return { ok: false, error: `PDF 読込失敗: ${String(err)}` };
    }
    const base64 = pdfBytes.toString('base64');

    const extractPrompt = `この論文 PDF からメタデータと要約を抽出し、以下の JSON 形式で **厳密に** 出力してください。説明文は付けないでください。

{
  "title": "論文タイトル",
  "authors": ["著者 1", "著者 2"],
  "year": 2024,
  "venue": "学会または雑誌名 (例: NeurIPS 2024 / Nature)",
  "doi": "DOI があれば (無ければ null)",
  "arxiv": "arXiv ID があれば (無ければ null)",
  "abstract": "原文の abstract (英語のまま)",
  "oneLiner": "50 文字以内の超要約 (日本語)",
  "contributions": ["主要貢献 1", "主要貢献 2", "..."],
  "methods": "手法の概略 (3-5 文)",
  "limitations": "限界・未解決の問い (2-3 文)"
}`;

    let prompt = extractPrompt;
    const documents =
      settings.aiAuthMode === 'api-key'
        ? [{ base64, mediaType: 'application/pdf' as const, fileName: path.basename(pdfPath) }]
        : undefined;
    if (settings.aiAuthMode === 'login') {
      let extracted = '';
      try {
        extracted = (await extractPdfTextFromBuffer(pdfBytes)).text;
      } catch (err) {
        logger.warn('[papers:importFromPDF] local PDF text extraction failed', err);
      }
      if (extracted.trim().length < 200) {
        return { ok: false, error: imageOnlyPdfError() };
      }
      prompt = `${extractPrompt}\n\n---\n\n以下はローカルで抽出した PDF テキストです。このテキストだけを根拠に抽出してください。\n\n${extracted.slice(0, 120_000)}`;
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

    // Extract the JSON. We reuse the same defensive extraction logic as
    // ai/agents.ts — fence-aware, prose-tolerant.
    const extractJSON = (text: string): Record<string, unknown> | null => {
      if (!text) return null;
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const candidate = (fence ? fence[1] : text).trim();
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start < 0 || end < 0) return null;
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    };
    const parsed = extractJSON(result.text);
    if (!parsed || typeof parsed.title !== 'string') {
      return { ok: false, error: 'AI 出力からメタデータを抽出できませんでした' };
    }

    const title = String(parsed.title).trim();
    const authors = Array.isArray(parsed.authors)
      ? (parsed.authors as unknown[]).filter((a) => typeof a === 'string') as string[]
      : [];
    const year = typeof parsed.year === 'number' ? parsed.year : undefined;
    const venue =
      typeof parsed.venue === 'string' && parsed.venue.toLowerCase() !== 'null'
        ? parsed.venue
        : undefined;
    const doi =
      typeof parsed.doi === 'string' && parsed.doi.toLowerCase() !== 'null'
        ? parsed.doi
        : undefined;
    const arxiv =
      typeof parsed.arxiv === 'string' && parsed.arxiv.toLowerCase() !== 'null'
        ? parsed.arxiv
        : undefined;
    const abstract = typeof parsed.abstract === 'string' ? parsed.abstract : '';
    const oneLiner = typeof parsed.oneLiner === 'string' ? parsed.oneLiner : '';
    const contributions = Array.isArray(parsed.contributions)
      ? (parsed.contributions as unknown[]).filter((c) => typeof c === 'string') as string[]
      : [];
    const methods = typeof parsed.methods === 'string' ? parsed.methods : '';
    const limitations = typeof parsed.limitations === 'string' ? parsed.limitations : '';

    // Re-derive bibkey using the same logic as arXiv/DOI imports.
    const firstName = (authors[0] ?? '').split(/\s+/).pop() ?? 'unknown';
    const yearPart = year ? String(year) : 'nd';
    const word = (title.match(/[A-Za-z]+/) ?? ['paper'])[0].toLowerCase();
    const bibkey = `${firstName.toLowerCase()}${yearPart}${word}`.replace(/[^a-z0-9]/g, '');

    // Copy the source PDF into the vault so the note has a stable reference.
    const attachmentsDir = path.join(root, '.attachments', 'papers');
    await ensureDir(attachmentsDir);
    const pdfFileName = `${safeName(title) || 'imported'}.pdf`;
    const pdfDest = path.join(attachmentsDir, pdfFileName);
    validateVaultPath(pdfDest, root);
    try {
      await fs.copyFile(pdfPath, pdfDest);
    } catch (err) {
      logger.warn('[papers:importFromPDF] copy PDF failed', err);
    }

    const meta: PaperFrontmatter = {
      title,
      type: 'paper',
      bibkey,
      authors,
      year,
      venue,
      ...(doi ? { doi } : {}),
      ...(arxiv ? { arxiv } : {}),
      pdf: pdfDest,
      addedAt: new Date().toISOString().slice(0, 10),
      status: 'reading',
      summary: oneLiner.slice(0, 280),
    };

    const body = [
      `# ${title}`,
      '',
      '## 概要 (AI 抽出)',
      '',
      oneLiner,
      '',
      '## Abstract',
      '',
      abstract,
      '',
      '## 主要貢献',
      ...contributions.map((c) => `- ${c}`),
      '',
      '## 手法',
      '',
      methods,
      '',
      '## 限界・未解決の問い',
      '',
      limitations,
      '',
      '## ノート',
      '',
      '## 関連',
      '',
      '## 引用',
      '',
      `[元 PDF](${pdfDest.replace(/\\/g, '/')})`,
      '',
    ].join('\n');

    const dir = path.join(root, PAPERS_DIR);
    await ensureDir(dir);
    const fileName = `${safeName(title) || 'imported'}.md`;
    const full = path.join(dir, fileName);
    validateVaultPath(full, root);
    if (await exists(full)) {
      return { ok: false, error: '同名の論文が既に存在します', filePath: full };
    }
    await atomicWrite(full, stringifyFrontmatter(meta as Record<string, unknown>, body));
    logger.info('[papers:importFromPDF] ok', { title, bibkey, pdfSize: stat.size });
    return { ok: true, filePath: full, bibkey, title };
  });

}
