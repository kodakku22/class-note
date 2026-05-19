// @vitest-environment node
// Cover the fallback chain in t() and navigator branches in detectSystemLocale.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setLocale, t, detectSystemLocale } from '../src/i18n/strings';

describe('i18n – additional branch coverage', () => {
  afterEach(() => {
    setLocale('ja');
  });

  it('t falls back through the nullish chain for a completely unknown key', () => {
    setLocale('en');
    // Cast to bypass TypeScript to test the fallback chain:
    // tables[currentLocale][key] ?? tables.ja[key] ?? key
    const result = t('nonexistent.key.that.does.not.exist' as any);
    // Since key doesn't exist in en or ja, should return the key itself
    expect(result).toBe('nonexistent.key.that.does.not.exist');
  });

  it('t returns value from current locale table', () => {
    setLocale('ja');
    expect(t('common.save')).toBe('保存');
    setLocale('en');
    expect(t('common.save')).toBe('Save');
  });

  it('detectSystemLocale handles navigator.language being undefined', () => {
    // Save and remove navigator.language
    const desc = Object.getOwnPropertyDescriptor(navigator, 'language');
    Object.defineProperty(navigator, 'language', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // With navigator.language undefined, optional chaining (?.) returns undefined
    // So it should fall through to return 'en'
    expect(detectSystemLocale()).toBe('en');

    // Restore
    if (desc) {
      Object.defineProperty(navigator, 'language', desc);
    } else {
      Object.defineProperty(navigator, 'language', {
        value: 'en-US',
        writable: true,
        configurable: true,
      });
    }
  });

  it('detectSystemLocale returns ja for ja-JP language', () => {
    const desc = Object.getOwnPropertyDescriptor(navigator, 'language');
    Object.defineProperty(navigator, 'language', {
      value: 'ja-JP',
      writable: true,
      configurable: true,
    });

    expect(detectSystemLocale()).toBe('ja');

    if (desc) {
      Object.defineProperty(navigator, 'language', desc);
    } else {
      Object.defineProperty(navigator, 'language', {
        value: 'en-US',
        writable: true,
        configurable: true,
      });
    }
  });

  it('detectSystemLocale returns en for non-ja language', () => {
    const desc = Object.getOwnPropertyDescriptor(navigator, 'language');
    Object.defineProperty(navigator, 'language', {
      value: 'fr-FR',
      writable: true,
      configurable: true,
    });

    expect(detectSystemLocale()).toBe('en');

    if (desc) {
      Object.defineProperty(navigator, 'language', desc);
    } else {
      Object.defineProperty(navigator, 'language', {
        value: 'en-US',
        writable: true,
        configurable: true,
      });
    }
  });
});
