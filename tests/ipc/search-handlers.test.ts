// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
}));

// Mock vault-index
vi.mock('../../electron/vault-index', () => ({
  getVaultIndex: vi.fn(),
}));

import { createSearchHandlers } from '../../electron/ipc/search';
import { queryVaultSearch } from '../../electron/ipc/search';
import { getVaultIndex } from '../../electron/vault-index';

const mockGetVaultIndex = vi.mocked(getVaultIndex);

let h: ReturnType<typeof createSearchHandlers>;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createSearchHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

function mockIndex(files: Array<{
  relPath: string;
  kind: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  searchText: string;
}>) {
  mockGetVaultIndex.mockResolvedValue({ files } as ReturnType<typeof getVaultIndex> extends Promise<infer T> ? T : never);
}

describe('search:query', () => {
  it('returns empty for empty keyword', async () => {
    mockIndex([]);
    const result = await h['search:query'](null, root, '  ');
    expect(result).toEqual([]);
  });

  it('finds files by filename', async () => {
    mockIndex([
      {
        relPath: 'Math/notes/calculus.md',
        kind: 'note',
        tags: [],
        frontmatter: {},
        searchText: 'Integration basics.',
      },
    ]);

    const result = await h['search:query'](null, root, 'calculus');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('filename');
  });

  it('finds files by body content', async () => {
    mockIndex([
      {
        relPath: 'Math/notes/algebra.md',
        kind: 'note',
        tags: [],
        frontmatter: {},
        searchText: 'Matrices and determinants are important.',
      },
    ]);

    const result = await h['search:query'](null, root, 'determinants');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('body');
    expect(result[0].snippet).toContain('determinants');
  });

  it('finds files by tag', async () => {
    mockIndex([
      {
        relPath: 'Math/notes/sets.md',
        kind: 'note',
        tags: ['set-theory', 'foundations'],
        frontmatter: {},
        searchText: 'Set theory basics.',
      },
    ]);

    const result = await h['search:query'](null, root, 'set-theory');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('tag');
    expect(result[0].matchedTag).toBe('set-theory');
  });

  it('tag-only search with # prefix', async () => {
    mockIndex([
      {
        relPath: 'Math/notes/a.md',
        kind: 'note',
        tags: ['linear'],
        frontmatter: {},
        searchText: 'Linear algebra.',
      },
      {
        relPath: 'Math/notes/b.md',
        kind: 'note',
        tags: ['nonlinear'],
        frontmatter: {},
        searchText: 'Nonlinear dynamics.',
      },
    ]);

    const result = await h['search:query'](null, root, '#linear');
    expect(result).toHaveLength(2); // both tags contain 'linear'
    result.forEach((r: { matchType: string }) => {
      expect(r.matchType).toBe('tag');
    });
  });

  it('finds by frontmatter value', async () => {
    mockIndex([
      {
        relPath: 'Math/notes/paper.md',
        kind: 'note',
        tags: [],
        frontmatter: { author: 'Einstein' },
        searchText: 'General relativity.',
      },
    ]);

    const result = await h['search:query'](null, root, 'Einstein');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('frontmatter');
  });

  it('limits results to 100', async () => {
    const files = Array.from({ length: 150 }, (_, i) => ({
      relPath: `Math/notes/note${i}.md`,
      kind: 'note',
      tags: [],
      frontmatter: {},
      searchText: `content keyword${i}`,
    }));
    mockIndex(files);

    const result = await h['search:query'](null, root, 'content');
    expect(result.length).toBeLessThanOrEqual(100);
  });
});

describe('queryVaultSearch', () => {
  it('is exported and callable directly', async () => {
    mockIndex([]);
    const result = await queryVaultSearch(root, '');
    expect(result).toEqual([]);
  });
});
