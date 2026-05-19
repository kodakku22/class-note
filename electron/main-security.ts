import { redactSecrets } from './redaction';

export type ExternalUrlDecision =
  | { ok: true; url: string; protocol: 'http:' | 'https:' | 'obsidian:' }
  | { ok: false; error: string };

const AI_CONNECT_SRC = [
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
];

export function buildContentSecurityPolicy(dev: boolean): string {
  const connect = ["'self'", ...AI_CONNECT_SRC];
  if (dev) connect.push('http://localhost:*', 'ws://localhost:*');

  const directives = dev
    ? [
        "default-src 'self'",
        "img-src 'self' app-file: plugin-file: data: blob: http://localhost:* ws://localhost:*",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' plugin-file: http://localhost:* ws://localhost:*",
        "style-src 'self' 'unsafe-inline' plugin-file:",
        "font-src 'self' plugin-file: data:",
        `connect-src ${connect.join(' ')}`,
        "media-src 'self' app-file: plugin-file:",
        "frame-src 'self' plugin-file:",
        "object-src 'none'",
      ]
    : [
        "default-src 'self'",
        "img-src 'self' app-file: plugin-file: data: blob:",
        "script-src 'self' 'wasm-unsafe-eval' plugin-file:",
        "style-src 'self' 'unsafe-inline' plugin-file:",
        "font-src 'self' plugin-file: data:",
        `connect-src ${connect.join(' ')}`,
        "media-src 'self' app-file: plugin-file:",
        "frame-src 'self' plugin-file:",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ];
  return directives.join('; ');
}

export function validateExternalUrl(url: string): ExternalUrlDecision {
  if (typeof url !== 'string' || url.length > 2048) {
    return { ok: false, error: 'Invalid URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'obsidian:'
  ) {
    return { ok: false, error: `Protocol not allowed: ${parsed.protocol}` };
  }

  return { ok: true, url, protocol: parsed.protocol };
}

export function decodeProtocolPath(url: string, scheme: 'app-file' | 'plugin-file'): string {
  return decodeURIComponent(url.replace(new RegExp(`^${scheme}:\\/\\/`), ''));
}

export function sanitizeRendererLogPayload(
  level: string,
  message: unknown,
  meta?: Record<string, unknown>
): {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta: unknown;
} {
  const safeLevel =
    level === 'debug' || level === 'info' || level === 'warn' || level === 'error'
      ? level
      : 'info';
  const safeMessage = typeof message === 'string' ? message.slice(0, 4000) : '(non-string)';
  return {
    level: safeLevel,
    message: safeMessage,
    meta: redactSecrets(meta ?? {}),
  };
}
