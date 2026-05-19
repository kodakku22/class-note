// Document chunking for DocAI (Acrobat AI Assistant features).
//
// Splits Markdown notes, PDF text extractions, and books into uniform
// DocumentChunk objects that the retrieval + agent layer can reason over.
//
// Design constraints:
//   - Each chunk has a stable id ("{relPath}#page:N" or "{relPath}#section:slug")
//     so citations remain valid across runs.
//   - Each chunk records pageNumber (PDF) or startLine (Markdown) so the
//     viewer can jump to the source.
//   - Content is bounded at MAX_CHUNK_CHARS (≈ 1500 tokens) and sanitized via
//     sanitizeForPrompt() before reaching any model.
import { sanitizeForPrompt } from '../ipc/utils';

export type ChunkKind = 'note' | 'pdf' | 'book';

export type DocumentChunk = {
  /** Stable id, used as citation key. */
  id: string;
  /** Vault-relative path of the source document. */
  source: string;
  /** Human-readable section label ("Page 3" or "勾配降下法"). */
  section: string;
  /** Chunk body, max MAX_CHUNK_CHARS. */
  content: string;
  /** 1-based line number where the chunk starts inside the source (Markdown only). */
  startLine?: number;
  /** 1-based PDF page number (PDF only). */
  pageNumber?: number;
  metadata: {
    title: string;
    kind: ChunkKind;
    tags: string[];
  };
};

export type ChunkableDocument =
  | {
      kind: 'note';
      relPath: string;
      title: string;
      tags?: string[];
      body: string;
    }
  | {
      kind: 'pdf';
      relPath: string;
      title: string;
      tags?: string[];
      extractedText: string;
    }
  | {
      kind: 'book';
      relPath: string;
      title: string;
      tags?: string[];
      overview: string;
      readingNotes: string;
    };

/** ≈ 1500 tokens at ~3 chars/token (Japanese-leaning estimate). */
export const MAX_CHUNK_CHARS = 4500;

/** Hard cap on the number of chunks returned for a single document. */
export const MAX_CHUNKS_PER_DOC = 80;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a section label into a slug suitable for use inside an id. */
function slugForId(label: string): string {
  return label
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[#/?&%]/g, '')
    .slice(0, 60);
}

/** Split a body that exceeds MAX_CHUNK_CHARS into paragraph-sized sub-chunks. */
function splitOversizedByParagraph(body: string): string[] {
  const paras = body.split(/\n{2,}/);
  const parts: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (!p.trim()) continue;
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length > MAX_CHUNK_CHARS) {
      if (buf) parts.push(buf);
      if (p.length > MAX_CHUNK_CHARS) {
        // Single paragraph too large: hard-slice it.
        for (let i = 0; i < p.length; i += MAX_CHUNK_CHARS) {
          parts.push(p.slice(i, i + MAX_CHUNK_CHARS));
        }
        buf = '';
      } else {
        buf = p;
      }
    } else {
      buf = candidate;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

type HeadingSplit = {
  heading: string;
  /** 1-based line number of the heading line itself. */
  startLine: number;
  body: string;
};

/**
 * Split a Markdown body by H1/H2/H3 headings. The text before the first
 * heading is emitted under a synthetic "(導入)" section so nothing is lost.
 */
export function splitMarkdownByHeadings(body: string): HeadingSplit[] {
  const lines = body.split(/\r?\n/);
  const splits: HeadingSplit[] = [];
  let current: HeadingSplit = { heading: '(導入)', startLine: 1, body: '' };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^(#{1,3})(?:\s+(.*?))?\s*$/);
    if (m) {
      if (current.body.trim()) splits.push(current);
      current = { heading: (m[2] ?? '').trim() || '(無題)', startLine: i + 1, body: '' };
    } else {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current.body.trim()) splits.push(current);
  return splits;
}

export function splitMarkdownIntoChunks(
  body: string,
  relPath: string,
  meta: { title: string; tags?: string[] }
): DocumentChunk[] {
  const splits = splitMarkdownByHeadings(body);
  const chunks: DocumentChunk[] = [];
  for (const split of splits) {
    const trimmed = split.body.trim();
    if (!trimmed) continue;
    if (trimmed.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        id: `${relPath}#section:${slugForId(split.heading)}`,
        source: relPath,
        section: split.heading,
        content: sanitizeForPrompt(trimmed, MAX_CHUNK_CHARS),
        startLine: split.startLine,
        metadata: { title: meta.title, kind: 'note', tags: meta.tags ?? [] },
      });
    } else {
      const parts = splitOversizedByParagraph(trimmed);
      parts.forEach((part, idx) => {
        chunks.push({
          id: `${relPath}#section:${slugForId(split.heading)}:${idx + 1}`,
          source: relPath,
          section: parts.length > 1 ? `${split.heading} (${idx + 1}/${parts.length})` : split.heading,
          content: sanitizeForPrompt(part, MAX_CHUNK_CHARS),
          // We don't know exact line of each sub-chunk; conservative: keep heading line.
          startLine: split.startLine,
          metadata: { title: meta.title, kind: 'note', tags: meta.tags ?? [] },
        });
      });
    }
    if (chunks.length >= MAX_CHUNKS_PER_DOC) break;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Parse the "## Page N\n..." output of extractPdfTextFromBuffer into per-page entries. */
export function parsePdfTextIntoPages(extractedText: string): Array<{ pageNumber: number; text: string }> {
  if (!extractedText.trim()) return [];
  const pages: Array<{ pageNumber: number; text: string }> = [];
  // Split on the page heading; keep the heading with its body via a capture-aware regex.
  const re = /^##\s+Page\s+(\d+)\s*$/gm;
  const indices: Array<{ pageNumber: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(extractedText)) !== null) {
    indices.push({ pageNumber: Number(m[1]), start: m.index + m[0].length });
  }
  if (indices.length === 0) {
    // No page headings: treat the whole text as page 1.
    return [{ pageNumber: 1, text: extractedText.trim() }];
  }
  for (let i = 0; i < indices.length; i += 1) {
    const end = i + 1 < indices.length ? extractedText.lastIndexOf('## Page', indices[i + 1].start) : extractedText.length;
    const text = extractedText.slice(indices[i].start, end).trim();
    if (text) pages.push({ pageNumber: indices[i].pageNumber, text });
  }
  return pages;
}

export function splitPdfIntoChunks(
  extractedText: string,
  relPath: string,
  meta: { title: string; tags?: string[] }
): DocumentChunk[] {
  const pages = parsePdfTextIntoPages(extractedText);
  const chunks: DocumentChunk[] = [];
  for (const page of pages) {
    if (page.text.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        id: `${relPath}#page:${page.pageNumber}`,
        source: relPath,
        section: `Page ${page.pageNumber}`,
        content: sanitizeForPrompt(page.text, MAX_CHUNK_CHARS),
        pageNumber: page.pageNumber,
        metadata: { title: meta.title, kind: 'pdf', tags: meta.tags ?? [] },
      });
    } else {
      // Very dense page: paragraph-split, keep page number on all parts.
      const parts = splitOversizedByParagraph(page.text);
      parts.forEach((part, idx) => {
        chunks.push({
          id: `${relPath}#page:${page.pageNumber}:${idx + 1}`,
          source: relPath,
          section: parts.length > 1 ? `Page ${page.pageNumber} (${idx + 1}/${parts.length})` : `Page ${page.pageNumber}`,
          content: sanitizeForPrompt(part, MAX_CHUNK_CHARS),
          pageNumber: page.pageNumber,
          metadata: { title: meta.title, kind: 'pdf', tags: meta.tags ?? [] },
        });
      });
    }
    if (chunks.length >= MAX_CHUNKS_PER_DOC) break;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------

export function splitBookIntoChunks(
  overview: string,
  readingNotes: string,
  relPath: string,
  meta: { title: string; tags?: string[] }
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  if (overview.trim()) {
    // Treat the overview as a single "概要" section so it always gets indexed.
    chunks.push({
      id: `${relPath}#section:overview`,
      source: relPath,
      section: '概要',
      content: sanitizeForPrompt(overview.trim(), MAX_CHUNK_CHARS),
      startLine: 1,
      metadata: { title: meta.title, kind: 'book', tags: meta.tags ?? [] },
    });
  }
  if (readingNotes.trim()) {
    chunks.push(
      ...splitMarkdownIntoChunks(readingNotes, relPath, meta).map((c) => ({
        ...c,
        metadata: { ...c.metadata, kind: 'book' as ChunkKind },
      }))
    );
  }
  return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

// ---------------------------------------------------------------------------
// Unified entry
// ---------------------------------------------------------------------------

export function buildDocumentChunks(doc: ChunkableDocument): DocumentChunk[] {
  if (doc.kind === 'note') {
    return splitMarkdownIntoChunks(doc.body, doc.relPath, { title: doc.title, tags: doc.tags });
  }
  if (doc.kind === 'pdf') {
    return splitPdfIntoChunks(doc.extractedText, doc.relPath, { title: doc.title, tags: doc.tags });
  }
  return splitBookIntoChunks(doc.overview, doc.readingNotes, doc.relPath, {
    title: doc.title,
    tags: doc.tags,
  });
}
