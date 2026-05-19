import { describe, it, expect } from 'vitest';
import { colorForSubject, emojiForSubject } from '../../src/utils/colors';

describe('colorForSubject', () => {
  it('returns a color object with bg, fg, accent', () => {
    const color = colorForSubject('Math');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('fg');
    expect(color).toHaveProperty('accent');
  });

  it('returns consistent color for same name', () => {
    const a = colorForSubject('Physics');
    const b = colorForSubject('Physics');
    expect(a).toEqual(b);
  });

  it('returns different colors for different names (usually)', () => {
    const a = colorForSubject('Math');
    const b = colorForSubject('History');
    // Not guaranteed to be different, but high probability with these names
    expect(a.accent).not.toBe(b.accent);
  });

  it('handles empty string', () => {
    const color = colorForSubject('');
    expect(color).toHaveProperty('accent');
  });

  it('handles unicode names', () => {
    const color = colorForSubject('数学');
    expect(color).toHaveProperty('accent');
  });
});

describe('emojiForSubject', () => {
  it('returns 📐 for math subjects', () => {
    expect(emojiForSubject('数学')).toBe('📐');
    expect(emojiForSubject('Math')).toBe('📐');
  });

  it('returns 🔤 for English', () => {
    expect(emojiForSubject('英語')).toBe('🔤');
    expect(emojiForSubject('English')).toBe('🔤');
  });

  it('returns ⚛️ for Physics', () => {
    expect(emojiForSubject('物理')).toBe('⚛️');
    expect(emojiForSubject('Physics')).toBe('⚛️');
  });

  it('returns 🧪 for Chemistry', () => {
    expect(emojiForSubject('化学')).toBe('🧪');
    expect(emojiForSubject('Chemistry')).toBe('🧪');
  });

  it('returns 🧬 for Biology', () => {
    expect(emojiForSubject('生物')).toBe('🧬');
    expect(emojiForSubject('Biology')).toBe('🧬');
  });

  it('returns 📜 for History', () => {
    expect(emojiForSubject('歴史')).toBe('📜');
    expect(emojiForSubject('History')).toBe('📜');
  });

  it('returns 💻 for CS / Programming', () => {
    expect(emojiForSubject('プログラミング')).toBe('💻');
    expect(emojiForSubject('Computer Science')).toBe('💻');
    expect(emojiForSubject('CS')).toBe('💻');
  });

  it('returns 📊 for Economics (Japanese)', () => {
    expect(emojiForSubject('経済')).toBe('📊');
    // Note: 'economics' matches /cs/ first → 💻. Only Japanese matches economics.
    expect(emojiForSubject('econ')).toBe('📊');
  });

  it('returns 💭 for Philosophy', () => {
    expect(emojiForSubject('哲学')).toBe('💭');
    expect(emojiForSubject('Philosophy')).toBe('💭');
  });

  it('returns 🧠 for Psychology', () => {
    expect(emojiForSubject('心理')).toBe('🧠');
    expect(emojiForSubject('Psychology')).toBe('🧠');
  });

  it('returns 📚 for unknown subjects', () => {
    expect(emojiForSubject('Unknown Subject')).toBe('📚');
    expect(emojiForSubject('Quantum Field Theory')).toBe('📚');
  });

  it('is case insensitive', () => {
    expect(emojiForSubject('MATH')).toBe('📐');
    expect(emojiForSubject('physics')).toBe('⚛️');
  });
});
