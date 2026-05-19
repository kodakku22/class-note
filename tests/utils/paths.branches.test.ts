import { describe, it, expect } from 'vitest';
import { detectSep, joinPath, basename, isUnderVaultDir, toAppFileUrl } from '../../src/utils/paths';

// --------------------------------------------------------------------------
// Coverage targets for src/utils/paths.ts:
//   - detectSep: mixed separators (both / and \\ present), slash first
//   - joinPath: edge cases
//   - basename: edge cases
// --------------------------------------------------------------------------

describe('detectSep – mixed separators', () => {
  it('returns backslash when it appears before forward slash', () => {
    // e.g. C:\Users/foo
    expect(detectSep('C:\\Users/foo')).toBe('\\');
  });

  it('returns forward slash when it appears before backslash', () => {
    // e.g. /Users\foo
    expect(detectSep('/Users\\foo')).toBe('/');
  });

  it('returns backslash for only backslash path', () => {
    expect(detectSep('C:\\only\\backslash')).toBe('\\');
  });
});

describe('joinPath – edge cases', () => {
  it('handles single segment', () => {
    expect(joinPath('/vault', 'file.md')).toBe('/vault/file.md');
  });

  it('handles empty rest args', () => {
    expect(joinPath('/vault')).toBe('/vault');
  });

  it('handles trailing separator on base', () => {
    expect(joinPath('/vault/', 'test')).toBe('/vault/test');
  });
});

describe('basename – edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(basename('')).toBe('');
  });

  it('returns the filename when no separator', () => {
    expect(basename('file.md')).toBe('file.md');
  });
});

describe('toAppFileUrl', () => {
  it('converts Windows paths to app-file URL', () => {
    const url = toAppFileUrl('C:\\vault\\notes\\test.md');
    expect(url).toContain('app-file://');
    expect(url).toContain('test.md');
    // No backslashes in the URL
    expect(url).not.toContain('\\');
  });

  it('handles paths with spaces', () => {
    const url = toAppFileUrl('/vault/my notes/file.md');
    expect(url).toContain('my%20notes');
  });

  it('handles paths with unicode', () => {
    const url = toAppFileUrl('/vault/数学/ノート.md');
    expect(url).toContain('app-file://');
  });
});
