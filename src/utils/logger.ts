// Renderer-side logger that forwards to the main process via IPC.
//
// Why: console.log only lives in DevTools, which the user almost never opens.
// Sending structured logs through the preload bridge gets them into the same
// `main.log` file as Electron-process events, so support requests can attach
// one log file with the full picture.
//
// Usage:
//   import { log } from '@/utils/logger';
//   log.info('user opened note', { path: '...' });
//   log.error('save failed', { error: String(err) });
//
// Note: meta keys matching /api[_-]?key|token|password|secret/i are stripped
// in the main-process handler before they hit disk.

type Level = 'debug' | 'info' | 'warn' | 'error';

function send(level: Level, message: string, meta?: Record<string, unknown>) {
  try {
    // Best-effort; if the bridge isn't ready, fall back to console.
    void window.api?.log?.write?.(level, message, meta);
  } catch {
    // ignore
  }
  // Always also mirror to console for in-DevTools development.
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug;
  if (meta) fn(`[${level}]`, message, meta);
  else fn(`[${level}]`, message);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => send('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => send('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => send('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => send('error', msg, meta),
};
