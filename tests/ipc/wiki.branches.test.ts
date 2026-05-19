// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote, readFile, fileExists } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
  net: { request: vi.fn() },
}));

vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn(),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));

vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ aiProvider: 'claude', aiAuthMode: 'apiKey' }),
  loadSelectedAiApiKey: vi.fn().mockResolvedValue('test-key'),
  selectedAiModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
}));

import {
  createWikiHandlers,
  registerWikiHandlers,
  buildRawText,
  parseWikiOutput,
} from '../../electron/ipc/wiki';
import { runPrompt } from '../../electron/ai/provider';
import { ipcMain } from 'electron';

const mockRunPrompt = vi.mocked(runPrompt);

type Handlers = ReturnType<typeof createWikiHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createWikiHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

// --------------------------------------------------------------------------
// Coverage targets for wiki.ts:
//   - buildRawText: chunking, PER_CHUNK_LIMIT truncation, TOTAL_RAW_LIMIT break
//   - parseWikiOutput: various edge cases (no newline, empty name, short body, .md ext)
//   - collectRaw: Books dir, Memos dir, scope filtering, skip reserved dirs
//   - wiki:compile: manual edit conflict detection, overwriteManuallyEdited
//   - wiki:write: non-string content coercion
//   - wiki:setSchema: non-string schema fallback
//   - wiki:healthCheck: runPrompt error
//   - registerWikiHandlers
// --------------------------------------------------------------------------

describe('buildRawText', () => {
  it('returns concatenated blocks sorted by mtime desc', () => {
    const chunks = [
      { source: 'old.md', content: 'Old content', mtime: 100 },
      { source: 'new.md', content: 'New content', mtime: 200 },
    ];
    const text = buildRawText(chunks);
    // Newest first
    expect(text.indexOf('new.md')).toBeLessThan(text.indexOf('old.md'));
    expect(text).toContain('---');
  });

  it('truncates chunks exceeding PER_CHUNK_LIMIT', () => {
    const longContent = 'x'.repeat(9000); // > 8000 PER_CHUNK_LIMIT
    const chunks = [{ source: 'long.md', content: longContent, mtime: 1 }];
    const text = buildRawText(chunks);
    expect(text).toContain('...(略)');
    expect(text.length).toBeLessThan(longContent.length + 200);
  });

  it('drops chunks that would exceed TOTAL_RAW_LIMIT', () => {
    // Create chunks totalling more than 80_000
    const chunks = Array.from({ length: 20 }, (_, i) => ({
      source: `note${i}.md`,
      content: 'A'.repeat(5000),
      mtime: i,
    }));
    const text = buildRawText(chunks);
    // Should not include all 20 chunks (20 * 5000 = 100K > 80K)
    const noteCount = (text.match(/## note/g) || []).length;
    expect(noteCount).toBeLessThan(20);
    expect(noteCount).toBeGreaterThan(0);
  });

  it('returns empty string for no chunks', () => {
    expect(buildRawText([])).toBe('');
  });
});

describe('parseWikiOutput', () => {
  it('parses valid wiki output into pages', () => {
    const output = `### INDEX.md\n\nThis is the index page with plenty of content to pass the minimum body length check.\n\n### Topic A.md\n\nThis topic page has sufficient content to pass the fifty character minimum body length requirement.`;
    const pages = parseWikiOutput(output);
    expect(Object.keys(pages)).toHaveLength(2);
    expect(pages['INDEX.md']).toBeDefined();
    expect(pages['Topic A.md']).toBeDefined();
  });

  it('adds .md extension when missing', () => {
    const output = `### MyTopic\n\nThis page content is long enough to pass the minimum fifty character body length check for wiki output.`;
    const pages = parseWikiOutput(output);
    expect(pages['MyTopic.md']).toBeDefined();
  });

  it('skips sections without newline', () => {
    const output = `### NoNewline`;
    const pages = parseWikiOutput(output);
    expect(Object.keys(pages)).toHaveLength(0);
  });

  it('skips sections with empty name', () => {
    const output = `### \n\nBody content that is definitely long enough to pass the fifty character body length minimum check.`;
    const pages = parseWikiOutput(output);
    expect(Object.keys(pages)).toHaveLength(0);
  });

  it('skips sections with body shorter than 50 chars', () => {
    const output = `### ShortPage.md\n\nToo short.`;
    const pages = parseWikiOutput(output);
    expect(Object.keys(pages)).toHaveLength(0);
  });

  it('handles empty output', () => {
    expect(parseWikiOutput('')).toEqual({});
  });
});

describe('wiki:collectRaw – Books and Memos', () => {
  it('collects from Books directory when scope is all', async () => {
    const booksDir = path.join(root, 'Books');
    await fs.mkdir(booksDir, { recursive: true });
    await fs.writeFile(path.join(booksDir, 'mybook.md'), '# My Book Notes');

    const result = await h['wiki:collectRaw'](null, root, 'all');
    expect(result.some((c: any) => c.source.includes('Books/'))).toBe(true);
  });

  it('excludes _reading.md files from Books', async () => {
    const booksDir = path.join(root, 'Books');
    await fs.mkdir(booksDir, { recursive: true });
    await fs.writeFile(path.join(booksDir, 'mybook.md'), '# Book Notes');
    await fs.writeFile(path.join(booksDir, 'mybook_reading.md'), '# Reading Progress');

    const result = await h['wiki:collectRaw'](null, root, 'all');
    const bookSources = result.filter((c: any) => c.source.includes('Books/'));
    expect(bookSources).toHaveLength(1);
    expect(bookSources[0].source).not.toContain('_reading.md');
  });

  it('collects from Memos directory when scope is all', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    await fs.writeFile(path.join(memosDir, 'idea.md'), '# Quick idea');

    const result = await h['wiki:collectRaw'](null, root, 'all');
    expect(result.some((c: any) => c.source.includes('Memos/'))).toBe(true);
  });

  it('does not collect Books/Memos when scope is specific subject', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'lecture.md', '# Lecture');
    const booksDir = path.join(root, 'Books');
    await fs.mkdir(booksDir, { recursive: true });
    await fs.writeFile(path.join(booksDir, 'book.md'), '# Book');

    const result = await h['wiki:collectRaw'](null, root, 'Math');
    expect(result.some((c: any) => c.source.includes('Books/'))).toBe(false);
    expect(result.some((c: any) => c.source.includes('Math/'))).toBe(true);
  });

  it('skips reserved directories', async () => {
    // Create a directory matching a reserved name
    const wikiNotesDir = path.join(root, 'Wiki', 'notes');
    await fs.mkdir(wikiNotesDir, { recursive: true });
    await fs.writeFile(path.join(wikiNotesDir, 'internal.md'), '# Internal');

    const result = await h['wiki:collectRaw'](null, root, 'all');
    expect(result.some((c: any) => c.source.includes('Wiki/'))).toBe(false);
  });
});

describe('wiki:compile – manual edit conflict detection', () => {
  it('detects manually edited pages and returns conflict', async () => {
    await addSubject(root, 'Sci');
    await writeNote(root, 'Sci', 'note.md', '# Science note with enough content for compilation');

    // First compile succeeds
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: '### Topic.md\n\nThis is the topic page content that is definitely long enough to pass the fifty character minimum body check.',
    });

    const result1 = await h['wiki:compile'](null, root, 'all');
    expect(result1.ok).toBe(true);

    // Manually edit a compiled page
    const topicPath = path.join(root, 'Wiki', 'Topic.md');
    await new Promise((r) => setTimeout(r, 20)); // ensure mtime differs
    await fs.writeFile(topicPath, '# Manually edited content');

    // Second compile should detect conflict
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: '### Topic.md\n\nThis is the updated topic page that is definitely long enough to pass the fifty character minimum body length check.',
    });

    const result2 = await h['wiki:compile'](null, root, 'all');
    expect(result2.ok).toBe(false);
    expect(result2.conflict).toBe(true);
    expect(result2.manuallyEdited).toContain('Topic.md');
  });

  it('overwrites manually edited pages when overwriteManuallyEdited is true', async () => {
    await addSubject(root, 'Art');
    await writeNote(root, 'Art', 'note.md', '# Art note');

    // First compile
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: '### ArtPage.md\n\nThis is the art page content that is definitely long enough to pass the fifty character minimum body check.',
    });
    await h['wiki:compile'](null, root, 'all');

    // Manually edit
    const artPagePath = path.join(root, 'Wiki', 'ArtPage.md');
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(artPagePath, '# Manual changes');

    // Compile with overwrite
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: '### ArtPage.md\n\nThis is the new art page content that is definitely long enough to pass the fifty character minimum body check.',
    });
    const result = await h['wiki:compile'](null, root, 'all', true);
    expect(result.ok).toBe(true);
    expect(result.pageCount).toBe(1);
  });

  it('returns error when AI output has no parseable pages', async () => {
    await addSubject(root, 'Lang');
    await writeNote(root, 'Lang', 'note.md', '# Language note');

    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: 'Just some text without any ### headers at all',
    });

    const result = await h['wiki:compile'](null, root, 'all');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ページを抽出できません');
  });
});

describe('wiki:write – content coercion', () => {
  it('handles non-string content by writing empty string', async () => {
    const result = await h['wiki:write'](null, root, 'test', 42 as unknown as string);
    expect(result.ok).toBe(true);
    const content = await readFile(result.filePath);
    expect(content).toBe('');
  });
});

describe('wiki:saveOutput – non-string content', () => {
  it('handles non-string content', async () => {
    const result = await h['wiki:saveOutput'](null, root, 'report', null as unknown as string);
    expect(result.ok).toBe(true);
    const content = await readFile(result.filePath);
    expect(content).toBe('');
  });
});

describe('wiki:healthCheck – additional branches', () => {
  it('returns error when runPrompt fails', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'Page.md'), '# Some wiki page content');

    mockRunPrompt.mockResolvedValueOnce({
      ok: false,
      error: 'AI service down',
      text: '',
    });

    const result = await h['wiki:healthCheck'](null, root);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AI service down');
  });

  it('handles wiki dir with only schema file (empty pages)', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'WIKI_SCHEMA.md'), '# Schema');

    const result = await h['wiki:healthCheck'](null, root);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('空です');
  });
});

describe('wiki:importFromQALogs – additional branches', () => {
  it('handles subjects with unreadable QA logs gracefully', async () => {
    await addSubject(root, 'Broken');
    const qaDir = path.join(root, 'Broken', 'qa');
    // Create log.md as a directory instead of a file to trigger read error
    await fs.mkdir(path.join(qaDir, 'log.md'), { recursive: true });

    // Also create a valid subject
    await addSubject(root, 'Valid');
    const validQaDir = path.join(root, 'Valid', 'qa');
    await fs.writeFile(path.join(validQaDir, 'log.md'), '# QA Log\n\nQ: Test\nA: Yes');

    const result = await h['wiki:importFromQALogs'](null, root);
    expect(result.ok).toBe(true);
    // Only the Valid subject should have been imported
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toContain('Valid');
  });
});

describe('registerWikiHandlers', () => {
  it('registers all wiki channels with ipcMain', () => {
    registerWikiHandlers();
    const mockHandle = ipcMain.handle as ReturnType<typeof vi.fn>;
    const channels = mockHandle.mock.calls.map((c: any[]) => c[0]);
    expect(channels).toContain('wiki:list');
    expect(channels).toContain('wiki:read');
    expect(channels).toContain('wiki:write');
    expect(channels).toContain('wiki:readIndex');
    expect(channels).toContain('wiki:saveOutput');
    expect(channels).toContain('outputs:list');
    expect(channels).toContain('wiki:collectRaw');
    expect(channels).toContain('wiki:getSchema');
    expect(channels).toContain('wiki:setSchema');
    expect(channels).toContain('wiki:compile');
    expect(channels).toContain('wiki:importFromQALogs');
    expect(channels).toContain('wiki:healthCheck');
  });
});
