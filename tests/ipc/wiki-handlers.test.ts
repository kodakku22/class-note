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

import { createWikiHandlers } from '../../electron/ipc/wiki';
import { runPrompt } from '../../electron/ai/provider';

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
  vi.restoreAllMocks();
});

describe('wiki:list', () => {
  it('returns empty array when Wiki dir does not exist', async () => {
    const result = await h['wiki:list'](null, root);
    expect(result).toEqual([]);
  });

  it('lists wiki pages sorted by mtime descending', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'PageA.md'), '# A');
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(wikiDir, 'PageB.md'), '# B');

    const result = await h['wiki:list'](null, root);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('PageB.md');
    expect(result[1].name).toBe('PageA.md');
  });

  it('excludes WIKI_SCHEMA.md from listing', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'WIKI_SCHEMA.md'), '# Schema');
    await fs.writeFile(path.join(wikiDir, 'Topic.md'), '# Topic');

    const result = await h['wiki:list'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Topic.md');
  });
});

describe('wiki:read', () => {
  it('reads existing wiki page', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'Test.md'), '# Test content');

    const content = await h['wiki:read'](null, root, 'Test.md');
    expect(content).toBe('# Test content');
  });

  it('returns empty string for non-existent page', async () => {
    const content = await h['wiki:read'](null, root, 'NonExistent.md');
    expect(content).toBe('');
  });
});

describe('wiki:write', () => {
  it('creates a wiki page', async () => {
    const result = await h['wiki:write'](null, root, 'NewPage', '# New page content');
    expect(result.ok).toBe(true);
    expect(result.filePath).toContain('NewPage.md');

    const content = await readFile(result.filePath);
    expect(content).toBe('# New page content');
  });

  it('strips .md extension before safeName to avoid doubling', async () => {
    const result = await h['wiki:write'](null, root, 'Test.md', '# Content');
    expect(result.ok).toBe(true);
    expect(result.filePath).toMatch(/Test\.md$/);
    expect(result.filePath).not.toMatch(/Test\.md\.md$/);
  });

  it('handles empty fileName gracefully', async () => {
    const result = await h['wiki:write'](null, root, '', '# Content');
    expect(result.ok).toBe(true);
    // safeName('') returns '_', so we get _.md
    expect(result.filePath).toMatch(/\.md$/);
  });
});

describe('wiki:readIndex', () => {
  it('returns null when INDEX.md does not exist', async () => {
    const result = await h['wiki:readIndex'](null, root);
    expect(result).toBeNull();
  });

  it('reads INDEX.md content', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'INDEX.md'), '# Index');

    const result = await h['wiki:readIndex'](null, root);
    expect(result).toBe('# Index');
  });
});

describe('wiki:saveOutput', () => {
  it('saves output file with date prefix', async () => {
    const result = await h['wiki:saveOutput'](null, root, 'report', '# Report content');
    expect(result.ok).toBe(true);
    expect(result.filePath).toContain('Outputs');
    expect(result.filePath).toContain('report.md');

    const content = await readFile(result.filePath);
    expect(content).toBe('# Report content');
  });
});

describe('outputs:list', () => {
  it('returns empty array when Outputs dir does not exist', async () => {
    const result = await h['outputs:list'](null, root);
    expect(result).toEqual([]);
  });

  it('lists output files', async () => {
    const outDir = path.join(root, 'Outputs');
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'report1.md'), '# R1');
    await fs.writeFile(path.join(outDir, 'report2.md'), '# R2');

    const result = await h['outputs:list'](null, root);
    expect(result).toHaveLength(2);
  });
});

describe('wiki:collectRaw', () => {
  it('collects notes from subject directories', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'lecture1.md', '# Lecture 1');

    const result = await h['wiki:collectRaw'](null, root, 'all');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('Math/lecture1.md');
  });

  it('filters by scope', async () => {
    await addSubject(root, 'Math');
    await addSubject(root, 'Physics');
    await writeNote(root, 'Math', 'lecture.md', '# Math lecture');
    await writeNote(root, 'Physics', 'lecture.md', '# Physics lecture');

    const result = await h['wiki:collectRaw'](null, root, 'Math');
    expect(result).toHaveLength(1);
    expect(result[0].source).toContain('Math');
  });
});

describe('wiki:getSchema / wiki:setSchema', () => {
  it('returns default schema when none is set', async () => {
    const schema = await h['wiki:getSchema'](null, root);
    expect(schema).toContain('Wiki 生成ルール');
  });

  it('writes and reads custom schema', async () => {
    await h['wiki:setSchema'](null, root, '# Custom schema');
    const schema = await h['wiki:getSchema'](null, root);
    expect(schema).toBe('# Custom schema');
  });

  it('falls back to default when non-string schema given', async () => {
    await h['wiki:setSchema'](null, root, null as unknown as string);
    const schema = await h['wiki:getSchema'](null, root);
    expect(schema).toContain('Wiki 生成ルール');
  });
});

describe('wiki:compile', () => {
  it('returns error when no notes found', async () => {
    const result = await h['wiki:compile'](null, root, 'all');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('見つかりません');
  });

  it('calls runPrompt and writes wiki pages', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'lecture.md', '# Lecture content that is quite substantial for testing purposes and has enough length');

    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: '### INDEX.md\n\nThis is the index page with enough content to pass the length check for wiki output parsing.\n\n### Math-Overview.md\n\nThis is the math overview page with substantial content for testing wiki compile functionality.',
    });

    const result = await h['wiki:compile'](null, root, 'all');
    expect(result.ok).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(mockRunPrompt).toHaveBeenCalledOnce();

    const indexContent = await readFile(path.join(root, 'Wiki', 'INDEX.md'));
    expect(indexContent).toBeTruthy();
  });

  it('returns error when runPrompt fails', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'lecture.md', '# Lecture');

    mockRunPrompt.mockResolvedValueOnce({
      ok: false,
      error: 'AI error',
      text: '',
    });

    const result = await h['wiki:compile'](null, root, 'all');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AI error');
  });
});

describe('wiki:healthCheck', () => {
  it('returns error when Wiki dir does not exist', async () => {
    const result = await h['wiki:healthCheck'](null, root);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('存在しません');
  });

  it('returns error when Wiki is empty', async () => {
    await fs.mkdir(path.join(root, 'Wiki'), { recursive: true });
    const result = await h['wiki:healthCheck'](null, root);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('空です');
  });

  it('generates health check report', async () => {
    const wikiDir = path.join(root, 'Wiki');
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(wikiDir, 'Topic.md'), '# Topic\n\nSome content here.');

    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: 'Health check report content',
    });

    const result = await h['wiki:healthCheck'](null, root);
    expect(result.ok).toBe(true);
    expect(result.reportPath).toContain('Outputs');
    expect(result.report).toContain('ヘルスチェックレポート');
    expect(mockRunPrompt).toHaveBeenCalledOnce();
  });
});

describe('wiki:importFromQALogs', () => {
  it('imports QA logs into Wiki', async () => {
    await addSubject(root, 'Math');
    const qaDir = path.join(root, 'Math', 'qa');
    await fs.mkdir(qaDir, { recursive: true });
    await fs.writeFile(path.join(qaDir, 'log.md'), '# QA Log\n\nQ: What is 1+1?\nA: 2');

    const result = await h['wiki:importFromQALogs'](null, root);
    expect(result.ok).toBe(true);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toContain('Math');

    const wikiFile = path.join(root, 'Wiki', result.imported[0]);
    expect(await fileExists(wikiFile)).toBe(true);
    const content = await readFile(wikiFile);
    expect(content).toContain('Q&A まとめ');
  });

  it('skips subjects without QA logs', async () => {
    await addSubject(root, 'Empty');
    const result = await h['wiki:importFromQALogs'](null, root);
    expect(result.ok).toBe(true);
    expect(result.imported).toHaveLength(0);
  });
});
