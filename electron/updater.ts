// Auto-update wiring via electron-updater.
//
// Behavior:
//   - On app ready, wait 5 s and check GitHub Releases (configured in
//     electron-builder.yml / GitHub Releases).
//   - When an update is available, fire `update:available` to the renderer.
//   - When download completes, fire `update:downloaded` so the renderer can
//     show "restart to install" UI.
//   - Manual check is exposed via the `update:check` IPC for the Settings
//     button.
//
// Important caveat: electron-updater **requires code-signed installers** on
// Windows and macOS. Unsigned builds will fail signature verification and
// updates will not apply. See docs/distribution.md for the signing setup.
//
// We import lazily so dev / unsigned builds don't crash on missing channels.
import { ipcMain, BrowserWindow, app } from 'electron';
import { logger } from './logger';

let initialized = false;
let autoUpdater: typeof import('electron-updater').autoUpdater | null = null;

// Use a permissive shape; the upstream type uses `string | ReleaseNoteInfo[] | null`
// for releaseNotes which would force an awkward narrowing on every callsite.
// We only forward `version` to the renderer anyway.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpdateInfo = any;

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload);
    } catch {
      // window closing
    }
  }
}

export async function initUpdater(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Manual check from Settings UI. Register this in all environments so the
  // renderer never invokes a missing IPC handler in dev/unsigned builds.
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged || !autoUpdater) {
      return { ok: false, error: 'アップデート確認は署名済み配布版でのみ利用できます' };
    }
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, version: r?.updateInfo.version };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('update:install', async () => {
    if (!app.isPackaged || !autoUpdater) {
      return { ok: false, error: 'インストール可能なアップデートはありません' };
    }
    try {
      autoUpdater.quitAndInstall();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // In development we don't have signed installers and the GitHub feed
  // points to a placeholder repo. Skip silently.
  if (!app.isPackaged) {
    logger.info('[updater] skipped — running unpackaged');
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    logger.warn('[updater] electron-updater not available', err);
    return;
  }
  if (!autoUpdater) return;

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcast('update:checking', null);
  });
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info('[updater] update available', info.version);
    broadcast('update:available', info);
  });
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    broadcast('update:not-available', info);
  });
  autoUpdater.on('error', (err: Error) => {
    logger.error('[updater] error', err);
    broadcast('update:error', { message: err.message });
  });
  autoUpdater.on('download-progress', (p: { percent: number }) => {
    broadcast('update:download-progress', { percent: p.percent });
  });
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info('[updater] downloaded', info.version);
    broadcast('update:downloaded', info);
  });

  // Initial check after a short delay so we don't block startup.
  setTimeout(() => {
    autoUpdater!.checkForUpdatesAndNotify().catch((err) => {
      logger.warn('[updater] initial check failed', err);
    });
  }, 5_000);
}
