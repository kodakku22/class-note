import { describe, expect, it } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../../src/utils/frontmatter';

describe('renderer frontmatter helpers', () => {
  it('parses valid YAML frontmatter and preserves the body', () => {
    const { meta, body } = parseFrontmatter(
      '---\ntitle: Gradient\ntags: [math, optimization]\nrating: 5\n---\n\n# Body'
    );

    expect(meta.title).toBe('Gradient');
    expect(meta.tags).toEqual(['math', 'optimization']);
    expect(meta.rating).toBe(5);
    expect(body.trim()).toBe('# Body');
  });

  it('falls back to plain body when frontmatter is absent or malformed', () => {
    expect(parseFrontmatter('plain note')).toEqual({ meta: {}, body: 'plain note' });

    const malformed = parseFrontmatter('---\ntags: [broken\n---\nBody');
    expect(malformed.meta).toEqual({});
    expect(malformed.body.trim()).toBe('Body');
  });

  it('stringifies clean metadata and drops empty values', () => {
    const text = stringifyFrontmatter(
      {
        title: 'Paper',
        empty: '',
        nil: null,
        tags: [],
        keepTags: ['ai'],
      },
      '\n# Notes'
    );

    expect(text).toContain('title: Paper');
    expect(text).toContain('keepTags:');
    expect(text).not.toContain('empty:');
    expect(text).not.toContain('nil:');
    expect(text).not.toContain('tags: []');
    expect(text).toMatch(/---\n\n# Notes$/);
  });

  it('returns a plain body when there is no metadata to write', () => {
    expect(stringifyFrontmatter({ title: '', tags: [] }, '\n\nBody')).toBe('Body');
  });
});
