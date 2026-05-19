import { describe, it, expect } from 'vitest';
import { SettingsSchema, TimetableSchema, NoteFrontmatterSchema } from '../../electron/ipc/schemas';

describe('SettingsSchema', () => {
  it('applies defaults for an empty object', () => {
    const s = SettingsSchema.parse({});
    expect(s.model).toBe('opus');
    expect(s.effort).toBe('xhigh');
    expect(s.theme).toBe('light');
    expect(s.recentVaults).toEqual([]);
    expect(s.uiMode).toBe('simple');
    expect(s.railItems).toEqual(['subjects', 'daily', 'timetable', 'books']);
    expect(s.railCommandIds).toEqual([]);
    expect(s.aiProvider).toBe('claude');
    expect(s.aiAuthMode).toBe('login');
    expect(s.aiModels.openai).toBe('gpt-5.5');
  });

  it('rejects unknown theme value', () => {
    expect(() => SettingsSchema.parse({ theme: 'rainbow' })).toThrow();
  });

  it('preserves provided model and effort', () => {
    const s = SettingsSchema.parse({ model: 'sonnet', effort: 'high' });
    expect(s.model).toBe('sonnet');
    expect(s.effort).toBe('high');
  });

  it('safely recovers when given garbage', () => {
    const r = SettingsSchema.safeParse({ recentVaults: 'not-an-array' });
    expect(r.success).toBe(false);
  });

  it('validates rail customization settings', () => {
    const s = SettingsSchema.parse({
      uiMode: 'custom',
      railItems: ['books', 'papers'],
      railCommandIds: ['new-note'],
    });
    expect(s.uiMode).toBe('custom');
    expect(s.railItems).toEqual(['books', 'papers']);
    expect(s.railCommandIds).toEqual(['new-note']);
    expect(() => SettingsSchema.parse({ uiMode: 'dense' })).toThrow();
    expect(() => SettingsSchema.parse({ railItems: 'books' })).toThrow();
    expect(() => SettingsSchema.parse({ railCommandIds: 'new-note' })).toThrow();
  });

  it('migrates legacy Claude provider settings to the global AI selector shape', () => {
    const cli = SettingsSchema.parse({ aiProvider: 'claude-cli', model: 'opus' });
    expect(cli.aiProvider).toBe('claude');
    expect(cli.aiAuthMode).toBe('login');
    expect(cli.aiModels.claudeLogin).toBe('opus');

    const api = SettingsSchema.parse({
      aiProvider: 'anthropic-api',
      aiApiModel: 'claude-opus-4-7',
    });
    expect(api.aiProvider).toBe('claude');
    expect(api.aiAuthMode).toBe('api-key');
    expect(api.aiModels.claudeApi).toBe('claude-opus-4-7');
  });
});

describe('TimetableSchema', () => {
  it('applies sensible defaults', () => {
    const t = TimetableSchema.parse({});
    expect(t.days).toEqual(['月', '火', '水', '木', '金']);
    expect(t.periods).toBe(6);
    expect(t.cells).toEqual({});
  });

  it('rejects negative periods', () => {
    expect(() => TimetableSchema.parse({ periods: -1 })).toThrow();
  });

  it('accepts a normal cells map', () => {
    const t = TimetableSchema.parse({ cells: { '0-0': '数学', '1-2': '物理' } });
    expect(t.cells['0-0']).toBe('数学');
  });
});

describe('NoteFrontmatterSchema', () => {
  it('parses tags as array', () => {
    const fm = NoteFrontmatterSchema.parse({ tags: ['math', 'physics'] });
    expect(fm.tags).toEqual(['math', 'physics']);
  });

  it('parses tags as single string', () => {
    const fm = NoteFrontmatterSchema.parse({ tags: 'math' });
    expect(fm.tags).toBe('math');
  });

  it('passes through unknown keys', () => {
    const fm = NoteFrontmatterSchema.parse({ title: 't', custom: 'value' });
    expect((fm as { custom?: unknown }).custom).toBe('value');
  });

  it('validates known type enum', () => {
    expect(() => NoteFrontmatterSchema.parse({ type: 'lecture' })).not.toThrow();
    expect(() => NoteFrontmatterSchema.parse({ type: 'unknown-type' })).toThrow();
  });
});
