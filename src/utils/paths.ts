// Renderer-side path helpers.
//
// We can't import Node's `path` in the sandboxed renderer, so this module
// provides minimal cross-platform path joining and inspection that mirrors
// Node's behavior closely enough for our use cases (vault file paths).
//
// All app vault paths are absolute and may use either `/` or `\\` depending
// on the OS. These utilities normalize for inspection while preserving the
// original separator when joining (so that paths handed back to the main
// process via IPC look native).

/** Detect the path separator used in an absolute path. */
export function detectSep(absPath: string): '/' | '\\' {
  // Windows absolute paths start with a drive letter and a backslash, but
  // some tools mix separators. Honor whichever appears first.
  const firstSlash = absPath.indexOf('/');
  const firstBack = absPath.indexOf('\\');
  if (firstBack === -1) return '/';
  if (firstSlash === -1) return '\\';
  return firstBack < firstSlash ? '\\' : '/';
}

/**
 * Join path segments, using the same separator as `base`.
 * Drops empty segments and trims redundant separators between parts.
 */
export function joinPath(base: string, ...rest: string[]): string {
  const sep = detectSep(base);
  const trimmedBase = base.replace(/[\\/]+$/, '');
  const parts = rest
    .filter((p) => p && p.length > 0)
    .map((p) => p.replace(/^[\\/]+/, '').replace(/[\\/]+$/, ''));
  return [trimmedBase, ...parts].join(sep);
}

/** Last segment of a path (filename + extension). */
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() || '';
}

/**
 * Returns true if `absPath` lives anywhere under `<vaultRoot>/<dirName>/`.
 * Works regardless of separator style.
 */
export function isUnderVaultDir(absPath: string, dirName: string): boolean {
  const lower = absPath.toLowerCase();
  const d = dirName.toLowerCase();
  return lower.includes(`\\${d}\\`) || lower.includes(`/${d}/`);
}

/**
 * Convert an absolute filesystem path to the `app-file://` URL form expected
 * by the custom protocol handler. Both `/` and `\\` are accepted as input.
 *
 * Implementation: encode each segment so spaces and unicode characters survive
 * the URL parser, but keep separators as `/` (the URL syntax). The protocol
 * handler validates the path is inside the active vault before returning bytes.
 */
export function toAppFileUrl(absPath: string): string {
  const slashed = absPath.replace(/\\/g, '/');
  // Avoid double-encoding: split on `/` and encode each part.
  const encoded = slashed
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `app-file://${encoded}`;
}
