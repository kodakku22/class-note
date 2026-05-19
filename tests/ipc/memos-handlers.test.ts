// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, readFile, fileExists } from './_vault-harness';
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
}));

import { createMemosHandlers, inlineTagsFromBody } from '../../electron/ipc/memos';

type Handlers = ReturnType<typeof createMemosHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createMemosHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('inlineTagsFromBody', () => {
  it('extracts hashtags from text', () => {
    expect(inlineTagsFromBody('Hello #world #test')).toEqual(
      expect.arrayContaining(['world', 'test'])
    );
  });

  it('returns empty for no tags', () => {
    expect(inlineTagsFromBody('Hello world')).toEqual([]);
  });

  it('deduplicates tags', () => {
    const tags = inlineTagsFromBody('#foo #bar #foo');
    expect(tags.filter((t) => t === 'foo').length).toBe(1);
  });
});

describe('memos:list', () => {
  it('returns empty array when Memos dir does not exist', async () => {
    const result = await h['memos:list'](null, root);
    expect(result).toEqual([]);
  });

  it('lists memo files', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    await fs.writeFile(
      path.join(memosDir, '2025-01-01-120000.md'),
      '---\ncreated: "2025-01-01 12:00"\ntags: [test]\n---\nHello memo',
      'utf-8'
    );

    const result = await h['memos:list'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('2025-01-01-120000.md');
    expect(result[0].body).toBe('Hello memo');
    expect(result[0].tags).toContain('test');
  });

  it('extracts inline tags from body', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    await fs.writeFile(
      path.join(memosDir, 'memo.md'),
      '---\ncreated: "2025-01-01"\ntags: []\n---\nContent with #inline tag',
      'utf-8'
    );

    const result = await h['memos:list'](null, root);
    expect(result[0].tags).toContain('inline');
  });

  it('skips files starting with underscore', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    await fs.writeFile(path.join(memosDir, '_hidden.md'), '---\n---\nHidden', 'utf-8');
    await fs.writeFile(path.join(memosDir, 'visible.md'), '---\n---\nVisible', 'utf-8');

    const result = await h['memos:list'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('visible.md');
  });
});

describe('memos:create', () => {
  it('creates a memo file', async () => {
    const result = await h['memos:create'](null, root, 'Test memo content', ['tag1']);
    expect(result.ok).toBe(true);
    expect(result.filePath).toContain('Memos');
    expect(await fileExists(result.filePath)).toBe(true);
    const content = await readFile(result.filePath);
    expect(content).toContain('Test memo content');
    expect(content).toContain('tag1');
  });

  it('rejects empty content', async () => {
    const result = await h['memos:create'](null, root, '  ', []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('空');
  });

  it('creates Memos directory if it does not exist', async () => {
    const result = await h['memos:create'](null, root, 'New memo', []);
    expect(result.ok).toBe(true);
    expect(await fileExists(path.join(root, 'Memos'))).toBe(true);
  });
});

describe('memos:update', () => {
  it('updates memo content while preserving frontmatter', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    const filePath = path.join(memosDir, 'test.md');
    await fs.writeFile(filePath, '---\ncreated: "2025-01-01"\ntags: [old]\n---\nOld content', 'utf-8');

    const result = await h['memos:update'](null, filePath, 'New content');
    expect(result.ok).toBe(true);

    const updated = await readFile(filePath);
    expect(updated).toContain('New content');
    expect(updated).toContain('created:');
  });

  it('throws when no active vault', async () => {
    setCurrentVaultPath(null);
    await expect(h['memos:update'](null, '/some/path.md', 'content')).rejects.toThrow();
  });
});

describe('memos:delete', () => {
  it('deletes a memo file', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    const filePath = path.join(memosDir, 'to-delete.md');
    await fs.writeFile(filePath, '---\n---\nDelete me', 'utf-8');

    const result = await h['memos:delete'](null, filePath);
    expect(result.ok).toBe(true);
    expect(await fileExists(filePath)).toBe(false);
  });

  it('rejects path outside Memos dir', async () => {
    const filePath = path.join(root, 'notes', 'not-memo.md');
    const result = await h['memos:delete'](null, filePath);
    expect(result.ok).toBe(false);
  });

  it('returns error when no active vault', async () => {
    setCurrentVaultPath(null);
    const result = await h['memos:delete'](null, '/some/path.md');
    expect(result.ok).toBe(false);
  });
});
