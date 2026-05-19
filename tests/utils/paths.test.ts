// Cross-platform path helpers — ensure macOS / Linux paths join correctly.
import { describe, it, expect } from 'vitest';
import { joinPath, basename, isUnderVaultDir, detectSep } from '../../src/utils/paths';

describe('detectSep', () => {
  it('returns \\ for Windows-style paths', () => {
    expect(detectSep('C:\\Users\\foo\\bar')).toBe('\\');
  });
  it('returns / for POSIX paths', () => {
    expect(detectSep('/Users/foo/bar')).toBe('/');
  });
  it('returns / when no separator is present', () => {
    expect(detectSep('relative')).toBe('/');
  });
});

describe('joinPath', () => {
  it('preserves Windows separators', () => {
    expect(joinPath('C:\\vault', 'Math', '_概要.md')).toBe('C:\\vault\\Math\\_概要.md');
  });
  it('preserves POSIX separators', () => {
    expect(joinPath('/Users/me/vault', 'Math', '_概要.md')).toBe('/Users/me/vault/Math/_概要.md');
  });
  it('drops empty segments and trims redundant separators', () => {
    expect(joinPath('/vault/', '', 'a/', '/b')).toBe('/vault/a/b');
  });
});

describe('basename', () => {
  it('returns the last segment regardless of separator', () => {
    expect(basename('C:\\vault\\Math\\note.md')).toBe('note.md');
    expect(basename('/vault/Math/note.md')).toBe('note.md');
  });
});

describe('isUnderVaultDir', () => {
  it('matches Windows paths', () => {
    expect(isUnderVaultDir('C:\\vault\\Books\\foo.md', 'books')).toBe(true);
  });
  it('matches POSIX paths', () => {
    expect(isUnderVaultDir('/vault/Books/foo.md', 'books')).toBe(true);
  });
  it('does not match unrelated dirs', () => {
    expect(isUnderVaultDir('/vault/Math/foo.md', 'books')).toBe(false);
  });
});
