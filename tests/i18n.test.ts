// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { setLocale, t, detectSystemLocale } from '../src/i18n/strings';

describe('i18n', () => {
  it('returns Japanese strings by default', () => {
    setLocale('ja');
    expect(t('common.save')).toBe('保存');
  });
  it('switches to English when locale is set', () => {
    setLocale('en');
    expect(t('common.save')).toBe('Save');
    setLocale('ja');
  });
  it('detectSystemLocale returns ja or en', () => {
    const l = detectSystemLocale();
    expect(['ja', 'en']).toContain(l);
  });
});
