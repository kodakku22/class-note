import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../../electron/ipc/frontmatter';

describe('parseFrontmatter', () => {
  it('parses a basic frontmatter block', () => {
    const { meta, body } = parseFrontmatter('---\ntitle: Test\nrating: 5\n---\n\nBody text');
    expect(meta.title).toBe('Test');
    expect(meta.rating).toBe(5);
    expect(body.trim()).toBe('Body text');
  });

  it('returns empty meta when frontmatter is absent', () => {
    const { meta, body } = parseFrontmatter('Just a body');
    expect(meta).toEqual({});
    expect(body).toBe('Just a body');
  });

  it('parses array values', () => {
    const { meta } = parseFrontmatter('---\ntags:\n  - foo\n  - bar\n---\n\n');
    expect(meta.tags).toEqual(['foo', 'bar']);
  });

  it('parses inline array syntax', () => {
    const { meta } = parseFrontmatter('---\ntags: [foo, bar]\n---\n');
    expect(meta.tags).toEqual(['foo', 'bar']);
  });

  it('parses booleans and null', () => {
    const { meta } = parseFrontmatter('---\npinned: true\nrating: null\n---\n');
    expect(meta.pinned).toBe(true);
    expect(meta.rating).toBeNull();
  });

  it('handles malformed YAML gracefully', () => {
    // Unbalanced bracket — should not throw, should return empty meta
    const { meta, body } = parseFrontmatter('---\ntags: [foo\n---\nBody');
    expect(meta).toEqual({});
    // The body still keeps the original text after the second ---
    expect(body.trim()).toBe('Body');
  });

  it('handles CRLF line endings', () => {
    const { meta, body } = parseFrontmatter('---\r\ntitle: Test\r\n---\r\n\r\nBody');
    expect(meta.title).toBe('Test');
    expect(body.trim()).toBe('Body');
  });
});

describe('stringifyFrontmatter', () => {
  it('round-trips a simple object', () => {
    const original = { title: 'Hello', rating: 4 };
    const text = stringifyFrontmatter(original, 'Body');
    const { meta, body } = parseFrontmatter(text);
    expect(meta.title).toBe('Hello');
    expect(meta.rating).toBe(4);
    expect(body.trim()).toBe('Body');
  });

  it('round-trips arrays', () => {
    const original = { tags: ['a', 'b', 'c'] };
    const text = stringifyFrontmatter(original, '');
    const { meta } = parseFrontmatter(text);
    expect(meta.tags).toEqual(['a', 'b', 'c']);
  });

  it('preserves complex string values that contain special characters', () => {
    const original = { title: 'Hello: world #1' };
    const text = stringifyFrontmatter(original, '');
    const { meta } = parseFrontmatter(text);
    expect(meta.title).toBe('Hello: world #1');
  });
});
