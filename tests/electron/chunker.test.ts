// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildDocumentChunks,
  MAX_CHUNK_CHARS,
  parsePdfTextIntoPages,
  splitBookIntoChunks,
  splitMarkdownByHeadings,
  splitMarkdownIntoChunks,
  splitPdfIntoChunks,
} from '../../electron/ai/chunker';

describe('chunker / splitMarkdownByHeadings', () => {
  it('splits on H1/H2/H3 and records line numbers', () => {
    const body = `intro paragraph\n\n# A\nbody of A\n## B\nbody of B\n### C\nbody of C\n`;
    const out = splitMarkdownByHeadings(body);
    expect(out.map((s) => s.heading)).toEqual(['(導入)', 'A', 'B', 'C']);
    // line numbers: heading A is on line 3 (1-based)
    expect(out[1].startLine).toBe(3);
    expect(out[2].startLine).toBe(5);
    expect(out[3].startLine).toBe(7);
  });

  it('ignores empty headings gracefully', () => {
    const body = `#\nempty heading body\n## valid\ncontent\n`;
    const out = splitMarkdownByHeadings(body);
    expect(out.some((s) => s.heading === '(無題)')).toBe(true);
  });
});

describe('chunker / splitMarkdownIntoChunks', () => {
  it('produces one chunk per heading section under MAX_CHUNK_CHARS', () => {
    const body = '# A\nshort\n# B\nalso short\n';
    const chunks = splitMarkdownIntoChunks(body, 'Math/notes/sample.md', {
      title: 'sample',
      tags: ['math'],
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].id).toBe('Math/notes/sample.md#section:A');
    expect(chunks[0].section).toBe('A');
    expect(chunks[0].metadata.kind).toBe('note');
    expect(chunks[0].metadata.tags).toEqual(['math']);
    expect(chunks[0].startLine).toBe(1);
  });

  it('paragraph-splits oversized sections', () => {
    const big = 'p'.repeat(MAX_CHUNK_CHARS + 100);
    const second = 'q'.repeat(MAX_CHUNK_CHARS + 100);
    const body = `# Long\n${big}\n\n${second}\n`;
    const chunks = splitMarkdownIntoChunks(body, 'a.md', { title: 'a' });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
    expect(chunks[0].section).toMatch(/Long/);
  });
});

describe('chunker / parsePdfTextIntoPages', () => {
  it('parses the "## Page N" format from extractPdfTextFromBuffer', () => {
    const text = '## Page 1\nhello page one\n\n## Page 2\nhello page two';
    const pages = parsePdfTextIntoPages(text);
    expect(pages).toEqual([
      { pageNumber: 1, text: 'hello page one' },
      { pageNumber: 2, text: 'hello page two' },
    ]);
  });

  it('treats heading-less text as a single page 1', () => {
    const pages = parsePdfTextIntoPages('no markers here');
    expect(pages).toHaveLength(1);
    expect(pages[0].pageNumber).toBe(1);
  });

  it('returns empty for blank input', () => {
    expect(parsePdfTextIntoPages('')).toEqual([]);
    expect(parsePdfTextIntoPages('   ')).toEqual([]);
  });
});

describe('chunker / splitPdfIntoChunks', () => {
  it('emits one chunk per PDF page with pageNumber', () => {
    const text = '## Page 1\nfoo\n\n## Page 2\nbar\n\n## Page 3\nbaz';
    const chunks = splitPdfIntoChunks(text, 'Papers/paper.pdf', {
      title: 'paper',
      tags: [],
    });
    expect(chunks).toHaveLength(3);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].section).toBe('Page 1');
    expect(chunks[0].id).toBe('Papers/paper.pdf#page:1');
    expect(chunks[2].pageNumber).toBe(3);
  });

  it('splits dense pages but keeps the same pageNumber on sub-chunks', () => {
    const big = 'x'.repeat(MAX_CHUNK_CHARS + 200);
    const text = `## Page 5\n${big}`;
    const chunks = splitPdfIntoChunks(text, 'paper.pdf', { title: 'p' });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.pageNumber).toBe(5);
      expect(c.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(c.section).toMatch(/^Page 5/);
    }
  });
});

describe('chunker / splitBookIntoChunks', () => {
  it('emits an overview chunk plus reading-note sections', () => {
    const overview = 'book overview text';
    const notes = '# Chapter 1\nnotes for ch1\n# Chapter 2\nnotes for ch2';
    const chunks = splitBookIntoChunks(overview, notes, 'Books/atlas/index.md', {
      title: 'Atlas',
    });
    expect(chunks[0].section).toBe('概要');
    expect(chunks[0].id).toBe('Books/atlas/index.md#section:overview');
    expect(chunks.some((c) => c.section === 'Chapter 1')).toBe(true);
    expect(chunks.every((c) => c.metadata.kind === 'book')).toBe(true);
  });
});

describe('chunker / buildDocumentChunks dispatch', () => {
  it('dispatches to the note splitter', () => {
    const chunks = buildDocumentChunks({
      kind: 'note',
      relPath: 'n.md',
      title: 'n',
      body: '# h\nbody',
    });
    expect(chunks[0].metadata.kind).toBe('note');
  });

  it('dispatches to the pdf splitter', () => {
    const chunks = buildDocumentChunks({
      kind: 'pdf',
      relPath: 'p.pdf',
      title: 'p',
      extractedText: '## Page 1\nx',
    });
    expect(chunks[0].metadata.kind).toBe('pdf');
    expect(chunks[0].pageNumber).toBe(1);
  });

  it('dispatches to the book splitter', () => {
    const chunks = buildDocumentChunks({
      kind: 'book',
      relPath: 'b.md',
      title: 'b',
      overview: 'ov',
      readingNotes: '# ch\nbody',
    });
    expect(chunks[0].section).toBe('概要');
  });
});
