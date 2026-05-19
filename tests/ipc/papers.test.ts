// @vitest-environment node
//
// Papers IPC tests — exercises the schema + naming logic without spinning up
// the full Electron handler. We focus on the parts most likely to silently
// drift: PaperFrontmatter coercion and bibkey/safeName interaction.
import { describe, it, expect } from 'vitest';
import { PaperFrontmatterSchema } from '../../electron/ipc/schemas';
import { safeName } from '../../electron/ipc/utils';

describe('PaperFrontmatterSchema', () => {
  it('accepts a minimal paper with type defaulted', () => {
    const r = PaperFrontmatterSchema.parse({ title: 'X' });
    expect(r.type).toBe('paper');
    expect(r.title).toBe('X');
  });

  it('preserves authors as an array', () => {
    const r = PaperFrontmatterSchema.parse({
      title: 'Attention',
      authors: ['Vaswani', 'Shazeer'],
    });
    expect(r.authors).toEqual(['Vaswani', 'Shazeer']);
  });

  it('accepts authors as a single string (loose CSV)', () => {
    const r = PaperFrontmatterSchema.parse({
      title: 'X',
      authors: 'A, B, C',
    });
    expect(r.authors).toBe('A, B, C');
  });

  it('clamps rating to [0, 5]', () => {
    expect(() => PaperFrontmatterSchema.parse({ title: 'X', rating: 6 })).toThrow();
    expect(() => PaperFrontmatterSchema.parse({ title: 'X', rating: -1 })).toThrow();
    expect(PaperFrontmatterSchema.parse({ title: 'X', rating: 4 }).rating).toBe(4);
  });

  it('rejects unknown status values', () => {
    expect(() =>
      PaperFrontmatterSchema.parse({ title: 'X', status: 'bogus' })
    ).toThrow();
  });

  it('passes through unknown frontmatter fields', () => {
    const r = PaperFrontmatterSchema.parse({
      title: 'X',
      myCustomField: 42,
    });
    expect((r as { myCustomField?: number }).myCustomField).toBe(42);
  });
});

describe('safeName for paper titles', () => {
  it('strips Windows-illegal chars commonly seen in paper titles', () => {
    // Real paper title: "Attention is All You Need" → safe.
    // But academic titles often have slashes ("X/Y trade-off") and colons.
    expect(safeName('Sample Efficient: A Study')).toBe('Sample Efficient_ A Study');
    expect(safeName('On the Trade-off A/B')).toBe('On the Trade-off A_B');
  });

  it('preserves Japanese characters in titles', () => {
    expect(safeName('機械学習における損失関数')).toBe('機械学習における損失関数');
  });
});
