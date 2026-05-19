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

import { createBooksHandlers } from '../../electron/ipc/books';

type Handlers = ReturnType<typeof createBooksHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createBooksHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

async function writeBook(title: string, meta: Record<string, unknown> = {}): Promise<string> {
  const dir = path.join(root, 'Books');
  await fs.mkdir(dir, { recursive: true });
  const fm = { title, status: 'reading', ...meta };
  const frontmatter = Object.entries(fm)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
      if (v === null) return `${k}: null`;
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join('\n');
  const filePath = path.join(dir, `${title}.md`);
  await fs.writeFile(filePath, `---\n${frontmatter}\n---\n\n# ${title}\n\nBook notes.`, 'utf-8');
  return filePath;
}

describe('books:list', () => {
  it('returns empty when Books dir does not exist', async () => {
    const result = await h['books:list'](null, root);
    expect(result).toEqual([]);
  });

  it('lists book files', async () => {
    await writeBook('Book A', { author: 'Author A', status: 'reading' });
    await writeBook('Book B', { author: 'Author B', status: 'done' });

    const result = await h['books:list'](null, root);
    expect(result).toHaveLength(2);
    const titles = result.map((b: { meta: { title: string } }) => b.meta.title);
    expect(titles).toEqual(expect.arrayContaining(['Book A', 'Book B']));
  });

  it('skips files starting with underscore', async () => {
    const dir = path.join(root, 'Books');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '_template.md'), '---\ntitle: Template\n---\nTemplate', 'utf-8');
    await writeBook('Real Book');

    const result = await h['books:list'](null, root);
    expect(result).toHaveLength(1);
  });

  it('skips reading-note sidecar files', async () => {
    const dir = path.join(root, 'Books');
    await fs.mkdir(dir, { recursive: true });
    await writeBook('MyBook');
    await fs.writeFile(path.join(dir, 'MyBook_reading.md'), 'Reading notes', 'utf-8');

    const result = await h['books:list'](null, root);
    expect(result).toHaveLength(1);
  });
});

describe('books:create', () => {
  it('creates a book file', async () => {
    const result = await h['books:create'](null, root, 'New Book', 'An Author');
    expect(result.ok).toBe(true);
    expect(await fileExists(result.filePath)).toBe(true);

    const content = await readFile(result.filePath);
    expect(content).toContain('New Book');
    expect(content).toContain('An Author');
    expect(content).toContain('want-to-read');
  });

  it('handles empty title gracefully', async () => {
    // safeName('') returns '_', so it creates a file with fallback name
    const result = await h['books:create'](null, root, '', undefined);
    expect(result.ok).toBe(true);
    expect(result.filePath).toMatch(/\.md$/);
  });

  it('avoids filename collision', async () => {
    const r1 = await h['books:create'](null, root, 'Same Title', undefined);
    const r2 = await h['books:create'](null, root, 'Same Title', undefined);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.filePath).not.toBe(r2.filePath);
  });
});

describe('books:updateMeta', () => {
  it('updates book metadata', async () => {
    const filePath = await writeBook('Update Me', { status: 'want-to-read', rating: null });

    const result = await h['books:updateMeta'](null, filePath, { status: 'reading' });
    expect(result.ok).toBe(true);

    const content = await readFile(filePath);
    expect(content).toContain('reading');
  });

  it('auto-sets started date when status changes to reading', async () => {
    const filePath = await writeBook('AutoDate', { status: 'want-to-read' });

    await h['books:updateMeta'](null, filePath, { status: 'reading' });
    const content = await readFile(filePath);
    expect(content).toContain('started:');
  });

  it('auto-sets finished date when status changes to done', async () => {
    const filePath = await writeBook('AutoDone', { status: 'reading' });

    await h['books:updateMeta'](null, filePath, { status: 'done' });
    const content = await readFile(filePath);
    expect(content).toContain('finished:');
  });
});

describe('books:delete', () => {
  it('deletes a book file', async () => {
    const filePath = await writeBook('Delete Me');

    const result = await h['books:delete'](null, filePath);
    expect(result.ok).toBe(true);
    expect(await fileExists(filePath)).toBe(false);
  });

  it('rejects path outside Books dir', async () => {
    const fakeFile = path.join(root, 'notes', 'not-book.md');
    const result = await h['books:delete'](null, fakeFile);
    expect(result.ok).toBe(false);
  });
});

describe('books:getReadingNote', () => {
  it('returns empty content when reading note does not exist', async () => {
    const filePath = await writeBook('NoNote');

    const result = await h['books:getReadingNote'](null, filePath);
    expect(result.content).toBe('');
  });
});

describe('books:appendReadingNote', () => {
  it('appends text to reading note', async () => {
    const filePath = await writeBook('WithNote');

    const result = await h['books:appendReadingNote'](null, filePath, 'Chapter 1 was great!');
    expect(result.ok).toBe(true);

    const readResult = await h['books:getReadingNote'](null, filePath);
    expect(readResult.content).toContain('Chapter 1 was great!');
  });

  it('rejects empty text', async () => {
    const filePath = await writeBook('EmptyAppend');
    const result = await h['books:appendReadingNote'](null, filePath, '  ');
    expect(result.ok).toBe(false);
  });
});

describe('books:writeReadingNote', () => {
  it('overwrites reading note content', async () => {
    const filePath = await writeBook('Overwrite');

    await h['books:appendReadingNote'](null, filePath, 'Old note');
    await h['books:writeReadingNote'](null, filePath, 'New content');

    const readResult = await h['books:getReadingNote'](null, filePath);
    expect(readResult.content).toBe('New content');
  });
});
