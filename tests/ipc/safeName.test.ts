// @vitest-environment node
//
// safeName normalizes filenames written under the vault. Used by Wiki page
// writes, Books, Outputs. Must:
//   - Strip Windows-illegal chars (\\ / : * ? " < > |)
//   - Normalize Unicode so 「数学」 written by Claude composes the same way
//     no matter which representation it sent
//   - Cap length to avoid Windows MAX_PATH explosions
import { describe, it, expect } from 'vitest';
import { safeName } from '../../electron/ipc/utils';

describe('safeName', () => {
  it('strips path separators and other illegal chars', () => {
    expect(safeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('normalizes Unicode to NFC', () => {
    // NFD: "が" decomposed = "か" + combining mark
    const nfd = 'が ファイル.md';
    const normalized = safeName(nfd);
    expect(normalized.normalize('NFC')).toBe(normalized);
    expect(normalized).toContain('が');
  });

  it('caps length to 200 chars', () => {
    const huge = 'a'.repeat(500);
    const out = safeName(huge);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('collapses runs of whitespace', () => {
    expect(safeName('  hello   world  ')).toBe('hello world');
  });

  it('returns empty for non-string', () => {
    // @ts-expect-error testing input validation
    expect(safeName(null)).toBe('');
  });
});
