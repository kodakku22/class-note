// Export the currently-rendered Markdown preview to PDF.
//
// We don't render the PDF from raw Markdown — instead we ask the focused
// BrowserWindow to print itself with `printToPDF` so the output matches what
// the user sees on screen (KaTeX, Mermaid, code highlighting all included).
//
// Caveat: the caller is expected to switch to the preview pane before
// invoking this, otherwise the PDF will reflect the editor view.
import { BrowserWindow, ipcMain, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateVaultPath, getCurrentVaultPath, atomicWrite } from './utils';

export function createExportHandlers() {
  return {
    'export:toPdf': async (e: unknown, sourcePath?: string) => {
      const win = BrowserWindow.fromWebContents((e as { sender: Electron.WebContents }).sender);
      if (!win) return { ok: false, error: 'no window' };

      let suggestedName = 'export.pdf';
      if (sourcePath && typeof sourcePath === 'string') {
        const root = getCurrentVaultPath();
        if (root) {
          try {
            validateVaultPath(sourcePath, root);
          } catch {
            return { ok: false, error: 'sourcePath outside vault' };
          }
        }
        suggestedName = path.basename(sourcePath).replace(/\.md$/i, '') + '.pdf';
      }

      const result = await dialog.showSaveDialog(win, {
        title: 'PDF として保存',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' };

      try {
        const data = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        });
        await atomicWrite(result.filePath, data);
        return { ok: true, filePath: result.filePath };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'export:toHtml': async (e: unknown, sourcePath?: string) => {
      const win = BrowserWindow.fromWebContents((e as { sender: Electron.WebContents }).sender);
      if (!win) return { ok: false, error: 'no window' };

      let suggestedName = 'export.html';
      if (sourcePath && typeof sourcePath === 'string') {
        const root = getCurrentVaultPath();
        if (root) {
          try {
            validateVaultPath(sourcePath, root);
          } catch {
            return { ok: false, error: 'sourcePath outside vault' };
          }
        }
        suggestedName = path.basename(sourcePath).replace(/\.md$/i, '') + '.html';
      }

      const result = await dialog.showSaveDialog(win, {
        title: 'HTML として保存',
        defaultPath: suggestedName,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' };

      try {
        const html = await win.webContents.executeJavaScript(
          `(() => {
            const el = document.querySelector('.markdown');
            return el ? '<!doctype html><meta charset="utf-8"><body>' + el.outerHTML + '</body>' : null;
          })()`
        );
        if (!html) return { ok: false, error: 'no preview rendered' };
        await fs.writeFile(result.filePath, html, 'utf-8');
        return { ok: true, filePath: result.filePath };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerExportHandlers() {
  const handlers = createExportHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
