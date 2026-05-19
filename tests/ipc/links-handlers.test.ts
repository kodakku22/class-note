// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote } from './_vault-harness';
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

vi.mock('../../electron/ipc/backlinks', () => ({
  getBacklinkSources: vi.fn().mockResolvedValue([]),
  refreshFile: vi.fn(),
  removeFile: vi.fn(),
  invalidateBacklinkCache: vi.fn(),
}));

import { createLinksHandlers } from '../../electron/ipc/links';
import { getBacklinkSources } from '../../electron/ipc/backlinks';

const mockGetBacklinkSources = vi.mocked(getBacklinkSources);

let h: ReturnType<typeof createLinksHandlers>;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createLinksHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('links:listTargets', () => {
  it('returns empty for empty vault', async () => {
    const result = await h['links:listTargets'](null, root);
    expect(result).toEqual([]);
  });

  it('lists note files as targets', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'calculus.md', '# Calculus\n\nContent here.');

    const result = await h['links:listTargets'](null, root);
    expect(result.length).toBeGreaterThan(0);
    const names = result.map((t: { name: string }) => t.name);
    expect(names).toContain('calculus');
  });

  it('categorizes subject notes', async () => {
    await addSubject(root, 'Physics');
    await writeNote(root, 'Physics', 'quantum.md', '# Quantum\n\nContent.');

    const result = await h['links:listTargets'](null, root);
    const note = result.find((t: { name: string }) => t.name === 'quantum');
    expect(note).toBeDefined();
    expect(note.category).toBe('subject-note');
    expect(note.subject).toBe('Physics');
  });

  it('lists books when Books dir exists', async () => {
    const booksDir = path.join(root, 'Books');
    await fs.mkdir(booksDir, { recursive: true });
    await fs.writeFile(path.join(booksDir, 'MyBook.md'), '# My Book', 'utf-8');

    const result = await h['links:listTargets'](null, root);
    const book = result.find((t: { name: string }) => t.name === 'MyBook');
    expect(book).toBeDefined();
    expect(book.category).toBe('book');
  });

  it('lists memos when Memos dir exists', async () => {
    const memosDir = path.join(root, 'Memos');
    await fs.mkdir(memosDir, { recursive: true });
    await fs.writeFile(path.join(memosDir, 'MyMemo.md'), '# Memo', 'utf-8');

    const result = await h['links:listTargets'](null, root);
    const memo = result.find((t: { name: string }) => t.name === 'MyMemo');
    expect(memo).toBeDefined();
    expect(memo.category).toBe('memo');
  });

  it('skips reserved dirs like .obsidian', async () => {
    await fs.mkdir(path.join(root, '.obsidian', 'notes'), { recursive: true });
    await fs.writeFile(path.join(root, '.obsidian', 'notes', 'config.md'), '# Config', 'utf-8');

    const result = await h['links:listTargets'](null, root);
    const config = result.find((t: { name: string }) => t.name === 'config');
    expect(config).toBeUndefined();
  });
});

describe('links:backlinks', () => {
  it('returns empty when no backlinks exist', async () => {
    const result = await h['links:backlinks'](null, root, 'NonExistentNote');
    expect(result).toEqual([]);
  });

  it('finds backlinks when references exist', async () => {
    await addSubject(root, 'Math');
    const noteA = await writeNote(root, 'Math', 'algebra.md', '# Algebra\n\nSee [[calculus]] for more.');
    await writeNote(root, 'Math', 'calculus.md', '# Calculus');

    // Mock backlink index to return noteA as a source
    mockGetBacklinkSources.mockResolvedValueOnce([noteA]);

    const result = await h['links:backlinks'](null, root, 'calculus');
    expect(result.length).toBe(1);
    expect(result[0].fileName).toBe('algebra.md');
    expect(result[0].snippet).toContain('calculus');
  });
});
