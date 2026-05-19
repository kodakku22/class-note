// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../../electron/ipc/frontmatter';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const { meta, body } = parseFrontmatter('---\ntitle: Test\ntags: [a, b]\n---\n\nHello');
    expect(meta.title).toBe('Test');
    expect(meta.tags).toEqual(['a', 'b']);
    expect(body.trim()).toBe('Hello');
  });

  it('returns empty meta when no frontmatter', () => {
    const { meta, body } = parseFrontmatter('Just content\nNo frontmatter');
    expect(meta).toEqual({});
    expect(body).toBe('Just content\nNo frontmatter');
  });

  it('handles empty frontmatter block', () => {
    const { meta, body } = parseFrontmatter('---\n\n---\n\nBody text');
    expect(meta).toEqual({});
    expect(body.trim()).toBe('Body text');
  });

  it('handles nested objects', () => {
    const { meta } = parseFrontmatter('---\nparent:\n  key: value\n---\n\n');
    expect((meta.parent as Record<string, unknown>).key).toBe('value');
  });

  it('handles invalid YAML gracefully', () => {
    const { meta } = parseFrontmatter('---\n[invalid\n---\n\nBody');
    expect(meta).toEqual({});
  });

  it('handles array YAML (non-object)', () => {
    const { meta } = parseFrontmatter('---\n- item1\n- item2\n---\n\nBody');
    expect(meta).toEqual({});
  });

  it('handles Windows line endings', () => {
    const { meta, body } = parseFrontmatter('---\r\ntitle: Test\r\n---\r\n\r\nBody');
    expect(meta.title).toBe('Test');
    expect(body).toContain('Body');
  });

  it('handles quoted strings', () => {
    const { meta } = parseFrontmatter('---\ntitle: "Hello: World"\n---\n\n');
    expect(meta.title).toBe('Hello: World');
  });

  it('handles numbers and booleans', () => {
    const { meta } = parseFrontmatter('---\nyear: 2024\npublished: true\nrating: 4.5\n---\n\n');
    expect(meta.year).toBe(2024);
    expect(meta.published).toBe(true);
    expect(meta.rating).toBe(4.5);
  });

  it('handles null values', () => {
    const { meta } = parseFrontmatter('---\nfinished: null\n---\n\n');
    expect(meta.finished).toBeNull();
  });
});

describe('stringifyFrontmatter', () => {
  it('produces valid YAML frontmatter', () => {
    const result = stringifyFrontmatter({ title: 'Test', tags: ['a', 'b'] }, 'Body content');
    expect(result).toContain('---');
    expect(result).toContain('title: Test');
    expect(result).toContain('Body content');
  });

  it('roundtrips with parseFrontmatter', () => {
    const original = { title: 'Roundtrip', year: 2024, tags: ['test'] };
    const body = '# Hello\n\nWorld';
    const serialized = stringifyFrontmatter(original, body);
    const { meta, body: parsedBody } = parseFrontmatter(serialized);
    expect(meta.title).toBe('Roundtrip');
    expect(meta.year).toBe(2024);
    expect((meta.tags as string[])).toEqual(['test']);
    expect(parsedBody.trim()).toBe(body);
  });

  it('handles null values as "null"', () => {
    const result = stringifyFrontmatter({ finished: null }, 'Body');
    expect(result).toContain('finished: null');
  });

  it('strips leading newlines from body', () => {
    const result = stringifyFrontmatter({}, '\n\n\nBody');
    expect(result).toMatch(/---\n\nBody$/);
  });
});
