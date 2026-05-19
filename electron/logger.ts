// Centralized logger for the main process.
// Replaces ad-hoc console.* calls with structured, file-backed logs.
//
// Logs land in:
//   Windows: %USERPROFILE%\AppData\Roaming\<app>\logs\main.log
//   macOS:   ~/Library/Logs/<app>/main.log
//   Linux:   ~/.config/<app>/logs/main.log
//
// Each line is plain text with timestamp + level. Files rotate at 5 MB,
// keeping the last 5 archives.
import log from 'electron-log/main';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { redactSecrets, registerSensitivePath } from './redaction';

let initialized = false;
export { redactSecrets, registerSensitivePath };

export function initLogger(): void {
  if (initialized) return;
  initialized = true;

  // Resolve log file path explicitly so it appears under userData/logs.
  log.transports.file.resolvePathFn = (variables) =>
    path.join(app.getPath('userData'), 'logs', variables.fileName ?? 'main.log');

  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB per file
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.format = '[{level}] {text}';

  // Rotate up to 5 archived files (main.old.1.log .. main.old.5.log). The
  // default electron-log archiver only keeps 1 archive — explicitly cap at 5
  // so a chatty session doesn't exceed ~30 MB on disk (5 MB × current + 5 archives).
  log.transports.file.archiveLogFn = (oldLogFile) => {
    try {
      const info = path.parse(oldLogFile.toString());
      const dir = info.dir;
      const base = info.name;
      const ext = info.ext;
      // Shift main.old.4.log → main.old.5.log, … main.old.1.log → main.old.2.log
      // then move the freshly-rotated file to main.old.1.log.
      for (let i = 4; i >= 1; i -= 1) {
        const from = path.join(dir, `${base}.old.${i}${ext}`);
        const to = path.join(dir, `${base}.old.${i + 1}${ext}`);
        if (fs.existsSync(from)) {
          try { fs.renameSync(from, to); } catch {}
        }
      }
      const target = path.join(dir, `${base}.old.1${ext}`);
      try { fs.renameSync(oldLogFile.toString(), target); } catch {}
    } catch {
      // Best-effort rotation; never crash the app over log files.
    }
  };

  // In production, drop debug noise from the file.
  log.transports.file.level = app.isPackaged ? 'info' : 'debug';
  log.transports.console.level = app.isPackaged ? 'warn' : 'debug';
  registerSensitivePath(app.getPath('userData'));

  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    const original = log[level].bind(log);
    (log as unknown as Record<typeof level, (...args: unknown[]) => void>)[level] = (
      ...args: unknown[]
    ) => original(...args.map((arg) => redactSecrets(arg)));
  }

  // Capture uncaught exceptions and unhandled promise rejections so they
  // always land in the log file even if no handler is in place upstream.
  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error, processType }) => {
      log.error(`[${processType ?? 'unknown'}] uncaught:`, error);
    },
  });

  log.info('--- ClassNotes started ---');
  log.info(`version=${app.getVersion()} platform=${process.platform} node=${process.versions.node}`);
}

/** Reveal the log directory in the OS file manager. Used by the Settings UI. */
export function getLogDirectory(): string {
  return path.join(app.getPath('userData'), 'logs');
}

export function getLogFilePath(): string {
  return path.join(getLogDirectory(), 'main.log');
}

export const logger = log;
