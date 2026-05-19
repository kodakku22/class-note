import * as path from 'path';

const sensitivePaths = new Set<string>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pathVariants(value: string): string[] {
  const resolved = path.resolve(value);
  return [...new Set([resolved, resolved.replace(/\\/g, '/'), resolved.replace(/\//g, '\\')])];
}

export function registerSensitivePath(value: string | null | undefined): void {
  if (!value) return;
  for (const variant of pathVariants(value)) {
    sensitivePaths.add(variant);
  }
}

function redactString(input: string): string {
  let out = input
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-ant-[A-Za-z0-9_-]+\b/g, '[REDACTED_API_KEY]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(
      /\b(api[_-]?key|token|password|secret)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
      '$1=[REDACTED]'
    );

  const flags = process.platform === 'win32' ? 'gi' : 'g';
  const paths = [...sensitivePaths].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const sensitivePath of paths) {
    out = out.replace(new RegExp(escapeRegExp(sensitivePath), flags), '[REDACTED_PATH]');
  }
  return out;
}

export function redactSecrets<T>(input: T): T {
  if (typeof input === 'string') return redactString(input) as T;
  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactString(input.message),
      stack: input.stack ? redactString(input.stack) : undefined,
    } as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item)) as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (/api[_-]?key|token|password|secret/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSecrets(value);
      }
    }
    return out as T;
  }
  return input;
}
