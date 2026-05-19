// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote, writeMaterial } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => null,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

import { createAttachmentsHandlers } from '../../electron/ipc/attachments';

type Handlers = ReturnType<typeof createAttachmentsHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createAttachmentsHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('attachments:index', () => {
  it('returns empty index for empty vault', async () => {
    const result = await h['attachments:index'](null, root);
    expect(result).toEqual({});
  });

  it('indexes image files in materials folder', async () => {
    await addSubject(root, 'Math');
    const imgPath = path.join(root, 'Math', 'materials', 'diagram.png');
    await fs.writeFile(imgPath, Buffer.from('fakepng'));

    const result = await h['attachments:index'](null, root);
    expect(result['diagram.png']).toBe(imgPath);
  });

  it('indexes PDF files in materials folder', async () => {
    await addSubject(root, 'Physics');
    const pdfPath = path.join(root, 'Physics', 'materials', 'paper.pdf');
    await fs.writeFile(pdfPath, Buffer.from('fakepdf'));

    const result = await h['attachments:index'](null, root);
    expect(result['paper.pdf']).toBe(pdfPath);
  });

  it('ignores non-image/non-pdf files', async () => {
    await addSubject(root, 'CS');
    await fs.writeFile(path.join(root, 'CS', 'materials', 'readme.txt'), 'hello');

    const result = await h['attachments:index'](null, root);
    expect(result['readme.txt']).toBeUndefined();
  });

  it('prioritizes files closer to the note when noteFilePath is given', async () => {
    await addSubject(root, 'Math');
    const notePath = await writeNote(root, 'Math', 'calc.md', '# Calc');

    // Same-subject materials
    const closePath = path.join(root, 'Math', 'materials', 'fig.png');
    await fs.writeFile(closePath, Buffer.from('close'));

    // Another subject
    await addSubject(root, 'Physics');
    const farPath = path.join(root, 'Physics', 'materials', 'fig.png');
    await fs.writeFile(farPath, Buffer.from('far'));

    const result = await h['attachments:index'](null, root, notePath);
    // The closer one should win
    expect(result['fig.png']).toBe(closePath);
  });

  it('skips dotfiles and directories', async () => {
    await addSubject(root, 'Math');
    await fs.writeFile(path.join(root, 'Math', 'materials', '.hidden.png'), Buffer.from('x'));

    const result = await h['attachments:index'](null, root);
    expect(result['.hidden.png']).toBeUndefined();
  });
});

describe('attachments:saveImage', () => {
  it('saves a base64 data URL as an image file', async () => {
    await addSubject(root, 'Math');
    const notePath = await writeNote(root, 'Math', 'note1.md', '# Note');

    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const dataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;

    const result = await h['attachments:saveImage'](null, notePath, dataUrl, '.png');
    expect(result.ok).toBe(true);
    expect(result.name).toMatch(/^paste-\d{8}-\d{6}\.png$/);

    // Verify file was written in the materials dir
    const materialsDir = path.join(root, 'Math', 'materials');
    const files = await fs.readdir(materialsDir);
    expect(files.some((f) => f.startsWith('paste-'))).toBe(true);
  });

  it('returns error for invalid data url', async () => {
    await addSubject(root, 'Math');
    const notePath = await writeNote(root, 'Math', 'note1.md', '# Note');

    const result = await h['attachments:saveImage'](null, notePath, 'not-a-data-url', '.png');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid data url');
  });

  it('returns error when no vault is active', async () => {
    setCurrentVaultPath(null);
    const result = await h['attachments:saveImage'](null, '/some/path.md', 'data:image/png;base64,AA==', '.png');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no active vault');
  });
});

describe('attachments:pick', () => {
  it('returns ok:false when dialog is canceled', async () => {
    const { dialog } = await import('electron');
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });

    await addSubject(root, 'Math');
    const notePath = await writeNote(root, 'Math', 'note.md', '# Note');

    const fakeEvent = { sender: { id: 1 } };
    const result = await h['attachments:pick'](fakeEvent, notePath);
    expect(result.ok).toBe(false);
    expect(result.added).toEqual([]);
  });

  it('copies selected files to materials directory', async () => {
    await addSubject(root, 'Math');
    const notePath = await writeNote(root, 'Math', 'note.md', '# Note');

    // Create a source file to "pick"
    const srcFile = path.join(root, 'temp-src.png');
    await fs.writeFile(srcFile, Buffer.from('image data'));

    const { dialog } = await import('electron');
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [srcFile],
    });

    const fakeEvent = { sender: { id: 1 } };
    const result = await h['attachments:pick'](fakeEvent, notePath);
    expect(result.ok).toBe(true);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toBe('temp-src.png');
  });
});
