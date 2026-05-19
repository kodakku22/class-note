// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject } from './_vault-harness';
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

import { createMaterialsHandlers } from '../../electron/ipc/materials';

type Handlers = ReturnType<typeof createMaterialsHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createMaterialsHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('materials:addFiles', () => {
  it('returns empty added array for empty subject name', async () => {
    const fakeEvent = { sender: { id: 1 } };
    const result = await h['materials:addFiles'](fakeEvent, root, '', []);
    expect(result).toEqual({ added: [] });
  });

  it('copies a file into the materials directory', async () => {
    await addSubject(root, 'Math');

    // Create a source file inside the vault to copy
    const srcFile = path.join(root, 'temp-source.pdf');
    await fs.writeFile(srcFile, Buffer.from('pdf content'));

    const fakeEvent = { sender: { id: 1 } };
    const result = await h['materials:addFiles'](fakeEvent, root, 'Math', [srcFile]);
    expect(result.added).toHaveLength(1);

    // Verify the file was actually copied into materials
    const materialsDir = path.join(root, 'Math', 'materials');
    const files = await fs.readdir(materialsDir);
    expect(files.some((f) => f.includes('temp-source'))).toBe(true);
  });

  it('creates the materials directory if it does not exist', async () => {
    // Create subject dir but not materials subdir
    const subjectDir = path.join(root, 'Biology');
    await fs.mkdir(subjectDir, { recursive: true });

    const srcFile = path.join(root, 'sample.png');
    await fs.writeFile(srcFile, Buffer.from('img'));

    const fakeEvent = { sender: { id: 1 } };
    const result = await h['materials:addFiles'](fakeEvent, root, 'Biology', [srcFile]);
    expect(result.added).toHaveLength(1);

    const materialsDir = path.join(root, 'Biology', 'materials');
    const stat = await fs.stat(materialsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('handles non-existent source files gracefully', async () => {
    await addSubject(root, 'Math');
    const fakeEvent = { sender: { id: 1 } };
    const result = await h['materials:addFiles'](fakeEvent, root, 'Math', [
      path.join(root, 'nonexistent-file.pdf'),
    ]);
    expect(result.added).toEqual([]);
  });

  it('avoids overwriting by generating unique names', async () => {
    await addSubject(root, 'Math');

    // Pre-create a file in materials with the same name
    const materialsDir = path.join(root, 'Math', 'materials');
    await fs.writeFile(path.join(materialsDir, 'doc.pdf'), 'existing');

    // Create source file
    const srcFile = path.join(root, 'doc.pdf');
    await fs.writeFile(srcFile, Buffer.from('new content'));

    const fakeEvent = { sender: { id: 1 } };
    const result = await h['materials:addFiles'](fakeEvent, root, 'Math', [srcFile]);
    expect(result.added).toHaveLength(1);

    // Should have two files in materials now
    const files = await fs.readdir(materialsDir);
    const pdfFiles = files.filter((f) => f.endsWith('.pdf'));
    expect(pdfFiles.length).toBe(2);
  });

  it('sanitizes subject names with special characters', async () => {
    const fakeEvent = { sender: { id: 1 } };
    // Subject with characters that safeName would strip
    const srcFile = path.join(root, 'test.png');
    await fs.writeFile(srcFile, Buffer.from('img'));

    const result = await h['materials:addFiles'](fakeEvent, root, 'Math/Physics', [srcFile]);
    // safeName replaces / with _ so it should still work
    expect(result.added).toHaveLength(1);
  });
});
