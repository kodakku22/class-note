import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session, screen } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { initLogger, logger, getLogDirectory } from './logger';
import { initSentryIfEnabled, captureException as sentryCapture } from './sentry';
import { initTelemetry, track } from './telemetry';
import { initUpdater } from './updater';
import { loadSettings } from './ipc/settings';
import { getCurrentVaultPath, validateVaultPath, validateAgainstCurrentVault } from './ipc/utils';
import { registerVaultHandlers } from './ipc/vault';
import { registerMaterialsHandlers } from './ipc/materials';
import { registerSearchHandlers } from './ipc/search';
import { registerSettingsHandlers } from './ipc/settings';
import { registerTimetableHandlers } from './ipc/timetable';
import { registerQAHandlers } from './ipc/qa';
import { registerBooksHandlers } from './ipc/books';
import { registerPapersHandlers } from './ipc/papers';
import { registerAgentsHandlers } from './ipc/agents';
import { registerDocAIHandlers } from './ipc/docai';
import { registerWebHandlers } from './ipc/web';
import { registerSkillsHandlers } from './ipc/skills';
import { registerLatexHandlers } from './ipc/latex';
import { registerMemosHandlers } from './ipc/memos';
import { registerLinksHandlers } from './ipc/links';
import { registerAttachmentsHandlers } from './ipc/attachments';
import { registerExportHandlers } from './ipc/export';
import { registerWikiHandlers } from './ipc/wiki';
import { registerExperimentHandlers } from './ipc/experiments';
import { registerEpistemicHandlers } from './ipc/epistemic';
import { registerResearchHandlers } from './ipc/research';
import { isAllowedPluginAssetPath, registerPluginHandlers } from './ipc/plugins';
import { registerIndexHandlers } from './ipc/index';
import { registerDiagnosticsHandlers } from './ipc/diagnostics';
import { registerVaultSafetyHandlers } from './ipc/vault-safety';
import { startWatcher, stopWatcher } from './ipc/watcher';
import {
  buildContentSecurityPolicy,
  decodeProtocolPath,
  sanitizeRendererLogPayload,
  validateExternalUrl,
} from './main-security';

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const SMOKE_USER_DATA_DIR = process.env.CLASSNOTES_SMOKE_USER_DATA_DIR;
const WINDOW_ICON = VITE_DEV_SERVER_URL
  ? path.join(process.cwd(), 'build', 'icon.png')
  : path.join(__dirname, '../dist/icon.png');

if (SMOKE_USER_DATA_DIR) {
  app.setPath('userData', SMOKE_USER_DATA_DIR);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'plugin-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let mainWindow: BrowserWindow | null = null;

/**
 * Persist the window's current bounds + maximized flag into settings.json.
 * Wrapped in try/catch so a settings write failure never crashes the app.
 */
async function persistWindowState(win: BrowserWindow | null): Promise<void> {
  if (!win || win.isDestroyed()) return;
  try {
    const { setWindowState } = await import('./ipc/settings');
    const maximized = win.isMaximized();
    // getNormalBounds() returns the un-maximized geometry, which is what we
    // want to restore to. Falls back to getBounds() if normal bounds aren't
    // tracked (rare).
    const bounds = (win as BrowserWindow & { getNormalBounds?: () => Electron.Rectangle }).getNormalBounds?.()
      ?? win.getBounds();
    await setWindowState({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    }, maximized);
  } catch (err) {
    logger.warn('[main] persistWindowState failed', err);
  }
}

/**
 * Pick the initial window background color to match the persisted theme.
 * This eliminates the dark/light flash when the user has the opposite theme
 * configured. Falls back to dark if settings aren't loaded yet — matches
 * the historical default.
 */
function initialBackgroundColor(theme: 'light' | 'dark'): string {
  // Keep these in sync with src/styles/tokens.css `:root` / `[data-theme="dark"]`.
  return theme === 'light' ? '#F9F9F7' : '#313338';
}

/**
 * Validate persisted window bounds against currently-attached displays.
 * Returns null if the rectangle is entirely off-screen (e.g. monitor removed
 * since last session). In that case we fall back to the default centered
 * window instead of opening invisibly.
 */
function isVisibleOnAnyDisplay(bounds: { x: number; y: number; width: number; height: number }): boolean {
  const displays = screen.getAllDisplays();
  // Considered "visible" if at least 100px × 100px of the window overlaps a display.
  const MIN_OVERLAP = 100;
  for (const d of displays) {
    const wa = d.workArea; // excludes taskbar / menubar
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y));
    if (overlapX >= MIN_OVERLAP && overlapY >= MIN_OVERLAP) return true;
  }
  return false;
}

/** Debounce timer for bounds persistence — avoid hammering settings.json on every drag pixel. */
let boundsPersistTimer: ReturnType<typeof setTimeout> | null = null;

type WindowOpenOptions = {
  theme: 'light' | 'dark';
  bounds?: { x: number; y: number; width: number; height: number } | null;
  maximized?: boolean;
};

function createWindow(opts: WindowOpenOptions = { theme: 'dark' }) {
  const useBounds = opts.bounds && isVisibleOnAnyDisplay(opts.bounds) ? opts.bounds : null;
  mainWindow = new BrowserWindow({
    ...(useBounds
      ? { x: useBounds.x, y: useBounds.y, width: useBounds.width, height: useBounds.height }
      : { width: 1400, height: 900 }),
    minWidth: 900,
    minHeight: 600,
    title: 'ClassNotes',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: initialBackgroundColor(opts.theme),
    icon: WINDOW_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true requires the preload to NOT use Node APIs directly.
      // Our preload uses only contextBridge + ipcRenderer which are sandbox-safe.
      sandbox: true,
      webSecurity: true,
    },
  });
  if (opts.maximized) mainWindow.maximize();

  // Persist bounds on resize/move (debounced). We do NOT persist while the
  // window is maximized — bounds reflect the "restored" size, and we record
  // the maximized flag separately.
  // The heavy lifting (writing settings.json) is dynamic-import'd to avoid
  // any circular dependency between settings.ts and main.ts.
  const persistBoundsDebounced = () => {
    if (!mainWindow) return;
    if (boundsPersistTimer) clearTimeout(boundsPersistTimer);
    boundsPersistTimer = setTimeout(() => {
      void persistWindowState(mainWindow);
    }, 500);
  };
  mainWindow.on('resize', persistBoundsDebounced);
  mainWindow.on('move', persistBoundsDebounced);
  mainWindow.on('maximize', () => void persistWindowState(mainWindow));
  mainWindow.on('unmaximize', () => void persistWindowState(mainWindow));

  // Block any unexpected window.open / target=_blank navigation.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) return;
    if (url.startsWith('app-file://') || url.startsWith('file://')) return;
    event.preventDefault();
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopWatcher();
  });
}

// Global safety nets — always log, never crash silently.
process.on('uncaughtException', (err) => {
  try {
    logger.error('[main] uncaughtException:', err);
    void sentryCapture(err);
  } catch {
    // logger may not be initialized yet
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    logger.error('[main] unhandledRejection:', reason);
    void sentryCapture(reason);
  } catch {
    // logger may not be initialized yet
  }
});

app.whenReady().then(async () => {
  initLogger();
  logger.info('app.whenReady — registering IPC handlers');

  // Initialize observability based on user opt-in. These are no-ops unless
  // both (a) the user enabled them in Settings AND (b) a DSN/endpoint is
  // configured at build time.
  try {
    const settings = await loadSettings();
    await initSentryIfEnabled({ telemetryEnabled: settings.telemetryEnabled ?? false });
    await initTelemetry({ enabled: settings.telemetryEnabled ?? false });
    void track('app_launched');
  } catch (err) {
    logger.warn('observability init failed', err);
  }

  // Auto-updater is best-effort; failures only log.
  try {
    await initUpdater();
  } catch (err) {
    logger.warn('updater init failed', err);
  }

  // app-file:// protocol — restricted to the active vault tree to prevent
  // a malicious note from referencing arbitrary system files via image src
  // or fetch. Out-of-scope requests are rejected before disk I/O.
  protocol.handle('app-file', async (request) => {
    try {
      const decoded = decodeProtocolPath(request.url, 'app-file');
      const normalized = path.normalize(decoded);
      const vault = getCurrentVaultPath();
      if (!vault) {
        return new Response('No active vault', { status: 403 });
      }
      try {
        validateVaultPath(normalized, vault);
      } catch {
        logger.warn('[app-file] rejected out-of-scope request', normalized);
        return new Response('Access denied', { status: 403 });
      }
      return net.fetch(pathToFileURL(normalized).toString());
    } catch (err) {
      logger.error('[app-file] handler failed', err);
      return new Response('Bad request', { status: 400 });
    }
  });

  // plugin-file:// protocol — narrower than app-file://. Only plugin assets
  // under a loaded `.classnotes/plugins/<id>/` directory can be served, so a
  // sandboxed plugin iframe cannot walk the whole Vault by guessing paths.
  protocol.handle('plugin-file', async (request) => {
    try {
      const decoded = decodeProtocolPath(request.url, 'plugin-file');
      const normalized = path.normalize(decoded);
      if (!isAllowedPluginAssetPath(normalized)) {
        logger.warn('[plugin-file] rejected out-of-scope request', normalized);
        return new Response('Access denied', { status: 403 });
      }
      return net.fetch(pathToFileURL(normalized).toString());
    } catch (err) {
      logger.error('[plugin-file] handler failed', err);
      return new Response('Bad request', { status: 400 });
    }
  });

  // Content-Security-Policy — restrict what the renderer can load. dev mode
  // needs HMR + websocket so we relax it; production locks down to self +
  // app-file: for vault assets + official AI API endpoints for direct provider calls.
  const csp = buildContentSecurityPolicy(Boolean(VITE_DEV_SERVER_URL));
  // The session is shared across windows; install once at startup.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
      },
    });
  });

  registerVaultHandlers();
  registerMaterialsHandlers();
  registerSearchHandlers();
  registerSettingsHandlers();
  registerTimetableHandlers();
  registerQAHandlers();
  registerBooksHandlers();
  registerPapersHandlers();
  registerAgentsHandlers();
  registerDocAIHandlers();
  registerWebHandlers();
  registerSkillsHandlers();
  registerLatexHandlers();
  registerMemosHandlers();
  registerLinksHandlers();
  registerAttachmentsHandlers();
  registerExportHandlers();
  registerWikiHandlers();
  registerExperimentHandlers();
  registerEpistemicHandlers();
  registerResearchHandlers();
  registerPluginHandlers();
  registerIndexHandlers();
  registerDiagnosticsHandlers();
  registerVaultSafetyHandlers();

  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Vault を作成する場所を選んでください',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
    return { ok: true };
  });

  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return { ok: false, maximized: false };
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return { ok: true, maximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('window:isMaximized', () => ({
    ok: true,
    maximized: mainWindow?.isMaximized() ?? false,
  }));

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
    return { ok: true };
  });

  ipcMain.handle('shell:openExternal', async (_e, filePath: string) => {
    if (typeof filePath !== 'string' || /^https?:\/\//i.test(filePath)) {
      return { ok: false, error: 'Invalid file path' };
    }
    try {
      validateAgainstCurrentVault(filePath);
    } catch {
      return { ok: false, error: 'filePath outside active vault' };
    }
    const err = await shell.openPath(filePath);
    return err === '' ? { ok: true } : { ok: false, error: err };
  });

  ipcMain.handle('shell:openUrl', async (_e, url: string) => {
    const decision = validateExternalUrl(url);
    if (!decision.ok) return decision;
    try {
      await shell.openExternal(decision.url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('shell:revealInFolder', async (_e, filePath: string) => {
    if (typeof filePath !== 'string') {
      return { ok: false, error: 'Invalid file path' };
    }
    try {
      validateAgainstCurrentVault(filePath);
    } catch {
      return { ok: false, error: 'filePath outside active vault' };
    }
    shell.showItemInFolder(filePath);
    return { ok: true };
  });

  // Open the log directory in the OS file manager. Used by Settings → "ログを開く".
  ipcMain.handle('shell:openLogDir', async () => {
    const dir = getLogDirectory();
    const err = await shell.openPath(dir);
    return err === '' ? { ok: true, path: dir } : { ok: false, error: err };
  });

  // Receive renderer-side telemetry events. The whitelist of event types is
  // enforced inside `track()` via the union type.
  ipcMain.handle('telemetry:track', async (_e, type: string) => {
    const allowed = ['vault_opened', 'note_created', 'wiki_compiled', 'qa_asked'] as const;
    if ((allowed as readonly string[]).includes(type)) {
      await track(type as (typeof allowed)[number]);
    }
    return { ok: true };
  });

  // Receive renderer-side logs and pipe them through electron-log so that
  // ErrorBoundary stack traces, IPC failures, and other client-side issues
  // land in the same main.log file as main-process events. Sanitize aggressively:
  // we never want to leak API keys via log forwarding.
  ipcMain.handle(
    'log:write',
    async (
      _e,
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string,
      meta?: Record<string, unknown>
    ) => {
      const safe = sanitizeRendererLogPayload(level, message, meta);
      logger[safe.level]('[renderer]', safe.message, safe.meta);
      return { ok: true };
    }
  );

  ipcMain.handle('watcher:start', (_e, vaultPath: string) => {
    startWatcher(vaultPath, (event, file) => {
      mainWindow?.webContents.send('vault:changed', { event, file });
    });
    return { ok: true };
  });

  ipcMain.handle('watcher:stop', () => {
    stopWatcher();
    return { ok: true };
  });

  // Read the persisted theme + window bounds so the window opens at the
  // last-known size/position with the matching background (no dark/light flash).
  const persisted = await loadSettings()
    .then((s) => ({
      theme: (s.theme === 'light' ? 'light' : 'dark') as 'light' | 'dark',
      bounds: s.windowBounds ?? null,
      maximized: s.windowMaximized ?? false,
    }))
    .catch(() => ({ theme: 'dark' as const, bounds: null, maximized: false }));
  createWindow(persisted);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(persisted);
  });
});

app.on('window-all-closed', () => {
  stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});

// Defense-in-depth: ensure the chokidar watcher is closed before the process
// exits even in the macOS "dock close → quit menu" path, where
// `window-all-closed` doesn't fire because the app stays alive.
app.on('before-quit', () => {
  try { stopWatcher(); } catch { /* best-effort */ }
});

app.on('will-quit', () => {
  try { stopWatcher(); } catch { /* best-effort */ }
});
