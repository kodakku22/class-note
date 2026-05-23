import { describe, it, expect } from 'vitest';
import { preprocessNotes, parseEmbedSrc } from '../../src/components/Wikilink';

describe('preprocessNotes', () => {
  it('converts wikilinks to markdown links', () => {
    const result = preprocessNotes('See [[calculus]] for more.');
    expect(result).toContain('[calculus](wikilink:calculus)');
  });

  it('converts wikilinks with display text', () => {
    const result = preprocessNotes('See [[calculus|Calc Notes]] here.');
    expect(result).toContain('[Calc Notes](wikilink:calculus)');
  });

  it('converts embeds to markdown images', () => {
    const result = preprocessNotes('![[photo.jpg]]');
    expect(result).toContain('![photo.jpg](embed:photo.jpg)');
  });

  it('converts embeds with size option', () => {
    const result = preprocessNotes('![[diagram.png|400]]');
    expect(result).toContain('embed:diagram.png');
    expect(result).toContain('400');
  });

  it('converts hashtags to tag links', () => {
    const result = preprocessNotes('A note #math about stuff');
    expect(result).toContain('[#math](tag:math)');
  });

  it('handles multiple wikilinks in one line', () => {
    const result = preprocessNotes('See [[a]] and [[b]]');
    expect(result).toContain('wikilink:a');
    expect(result).toContain('wikilink:b');
  });

  it('handles embed before wikilink in same text', () => {
    const result = preprocessNotes('![[img.png]] see [[note]]');
    expect(result).toContain('embed:img.png');
    expect(result).toContain('wikilink:note');
  });

  it('encodes special characters in wikilink names', () => {
    const result = preprocessNotes('[[数学 入門]]');
    expect(result).toContain('wikilink:');
    expect(result).toContain(encodeURIComponent('数学 入門'));
  });
});

describe('parseEmbedSrc', () => {
  it('parses simple embed src', () => {
    const result = parseEmbedSrc('embed:photo.jpg');
    expect(result).toEqual({ name: 'photo.jpg' });
  });

  it('parses embed with width', () => {
    const result = parseEmbedSrc('embed:photo.jpg|400');
    expect(result).toEqual({ name: 'photo.jpg', width: 400 });
  });

  it('handles encoded names', () => {
    const encoded = encodeURIComponent('my image.png');
    const result = parseEmbedSrc(`embed:${encoded}`);
    expect(result.name).toBe('my image.png');
  });

  it('handles invalid width (NaN)', () => {
    const result = parseEmbedSrc('embed:photo.jpg|abc');
    expect(result).toEqual({ name: 'photo.jpg', width: undefined });
  });

  it('handles negative width', () => {
    const result = parseEmbedSrc('embed:photo.jpg|-100');
    expect(result).toEqual({ name: 'photo.jpg', width: undefined });
  });
});
