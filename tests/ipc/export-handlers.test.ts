// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempVault } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

const { mockPrintToPDF, mockExecuteJavaScript, mockShowSaveDialog } = vi.hoisted(() => ({
  mockPrintToPDF: vi.fn(),
  mockExecuteJavaScript: vi.fn(),
  mockShowSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: vi.fn().mockReturnValue({
      webContents: {
        printToPDF: mockPrintToPDF,
        executeJavaScript: mockExecuteJavaScript,
      },
    }),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: mockShowSaveDialog,
  },
  shell: { openPath: vi.fn() },
}));

import { createExportHandlers } from '../../electron/ipc/export';

type Handlers = ReturnType<typeof createExportHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createExportHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('export:toPdf', () => {
  it('returns error when dialog is canceled', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const fakeEvent = { sender: {} };
    const result = await h['export:toPdf'](fakeEvent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('cancelled');
  });

  it('returns error when no window is found', async () => {
    // Override fromWebContents to return null
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null as never);

    const fakeEvent = { sender: {} };
    const result = await h['export:toPdf'](fakeEvent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no window');
  });

  it('exports PDF successfully', async () => {
    const pdfData = Buffer.from('fake-pdf-content');
    const outPath = `${root}/export.pdf`;

    mockShowSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: outPath });
    mockPrintToPDF.mockResolvedValueOnce(pdfData);

    const fakeEvent = { sender: {} };
    const result = await h['export:toPdf'](fakeEvent);
    expect(result.ok).toBe(true);
    expect(result.filePath).toBe(outPath);
  });

  it('uses source path basename as suggested filename', async () => {
    const sourcePath = `${root}/MyNote.md`;
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const fakeEvent = { sender: {} };
    await h['export:toPdf'](fakeEvent, sourcePath);

    expect(mockShowSaveDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        defaultPath: 'MyNote.pdf',
      })
    );
  });

  it('returns error when printToPDF throws', async () => {
    const outPath = `${root}/export.pdf`;
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: outPath });
    mockPrintToPDF.mockRejectedValueOnce(new Error('print failed'));

    const fakeEvent = { sender: {} };
    const result = await h['export:toPdf'](fakeEvent);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('print failed');
  });
});

describe('export:toHtml', () => {
  it('returns error when dialog is canceled', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const fakeEvent = { sender: {} };
    const result = await h['export:toHtml'](fakeEvent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('cancelled');
  });

  it('returns error when no preview is rendered', async () => {
    const outPath = `${root}/export.html`;
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: outPath });
    mockExecuteJavaScript.mockResolvedValueOnce(null);

    const fakeEvent = { sender: {} };
    const result = await h['export:toHtml'](fakeEvent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no preview rendered');
  });

  it('exports HTML successfully', async () => {
    const outPath = `${root}/export.html`;
    const htmlContent = '<!doctype html><meta charset="utf-8"><body><div class="markdown">Hello</div></body>';
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: outPath });
    mockExecuteJavaScript.mockResolvedValueOnce(htmlContent);

    const fakeEvent = { sender: {} };
    const result = await h['export:toHtml'](fakeEvent);
    expect(result.ok).toBe(true);
    expect(result.filePath).toBe(outPath);
  });

  it('uses source path basename as suggested filename', async () => {
    const sourcePath = `${root}/Report.md`;
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const fakeEvent = { sender: {} };
    await h['export:toHtml'](fakeEvent, sourcePath);

    expect(mockShowSaveDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        defaultPath: 'Report.html',
      })
    );
  });

  it('returns error when no window is found', async () => {
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null as never);

    const fakeEvent = { sender: {} };
    const result = await h['export:toHtml'](fakeEvent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no window');
  });
});
