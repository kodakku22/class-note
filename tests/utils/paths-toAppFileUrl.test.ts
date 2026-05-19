// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toAppFileUrl } from '../../src/utils/paths';

describe('toAppFileUrl', () => {
  it('converts Windows backslashes to forward slashes and encodes segments', () => {
    expect(toAppFileUrl('C:\\vault\\Math\\note.md')).toBe('app-file://C%3A/vault/Math/note.md');
  });
  it('encodes spaces and unicode in segments', () => {
    const url = toAppFileUrl('/vault/数学/勾配 降下法.md');
    expect(url.startsWith('app-file://')).toBe(true);
    expect(url).toContain(encodeURIComponent('数学'));
    expect(url).toContain(encodeURIComponent('勾配 降下法.md'));
  });
  it('keeps separator structure intact', () => {
    const url = toAppFileUrl('/a/b/c');
    expect(url).toBe('app-file:///a/b/c');
  });
});
