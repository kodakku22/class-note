import { describe, expect, it } from 'vitest';
import { safeName } from '../../electron/ipc/utils';

describe('safeName', () => {
  it('replaces Windows-illegal filename characters', () => {
    expect(safeName('a:b*c?d"e<f>g|h')).toBe('a_b_c_d_e_f_g_h');
  });

  it('trims trailing dots and spaces that Windows strips implicitly', () => {
    expect(safeName('report.  ')).toBe('report');
  });

  it('rejects reserved Windows device names', () => {
    expect(safeName('CON')).toBe('_');
    expect(safeName('lpt1.txt')).toBe('_');
  });
});
