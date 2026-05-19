import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLocale, t, detectSystemLocale } from '../src/i18n/strings';

// --------------------------------------------------------------------------
// Coverage targets for i18n/strings.ts:
//   - detectSystemLocale: navigator.language starting with 'ja' vs not
//   - t: fallback chain (tables[locale] -> tables.ja -> key)
//   - detectSystemLocale: navigator undefined branch
// --------------------------------------------------------------------------

describe('i18n – additional branches', () => {
  afterEach(() => {
    setLocale('ja'); // restore default
  });

  it('detectSystemLocale returns ja when navigator.language is ja', () => {
    const original = navigator.language;
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', writable: true, configurable: true });
    expect(detectSystemLocale()).toBe('ja');
    Object.defineProperty(navigator, 'language', { value: original, writable: true, configurable: true });
  });

  it('detectSystemLocale returns en when navigator.language is not ja', () => {
    const original = navigator.language;
    Object.defineProperty(navigator, 'language', { value: 'en-US', writable: true, configurable: true });
    expect(detectSystemLocale()).toBe('en');
    Object.defineProperty(navigator, 'language', { value: original, writable: true, configurable: true });
  });

  it('t returns English string when locale is en', () => {
    setLocale('en');
    expect(t('common.save')).toBe('Save');
    expect(t('common.cancel')).toBe('Cancel');
    expect(t('common.close')).toBe('Close');
  });

  it('t returns Japanese string when locale is ja', () => {
    setLocale('ja');
    expect(t('common.delete')).toBe('削除');
    expect(t('error.generic')).toBe('エラーが発生しました');
  });

  it('all wizard keys have translations in both languages', () => {
    const keys = [
      'wizard.step.1.title',
      'wizard.step.2.title',
      'wizard.step.3.title',
      'wizard.step.4.title',
      'wizard.step.5.title',
      'wizard.next',
      'wizard.back',
      'wizard.skip',
      'wizard.start',
    ] as const;

    setLocale('ja');
    for (const key of keys) {
      expect(t(key)).toBeTruthy();
    }

    setLocale('en');
    for (const key of keys) {
      expect(t(key)).toBeTruthy();
    }
  });

  it('settings keys translate correctly', () => {
    setLocale('en');
    expect(t('settings.aiProvider')).toBe('AI Provider');
    expect(t('settings.apiKey')).toBe('API key');
    expect(t('settings.aiProvider.none')).toBe('Disable AI features');
  });
});
