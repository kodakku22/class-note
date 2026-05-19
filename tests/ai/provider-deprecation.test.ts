// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  findModelEntry,
  modelDeprecation,
  modelDeprecationSeverity,
  ALL_MODELS,
  type ModelDeprecation,
} from '../../electron/ai/provider';

describe('provider / model catalogue', () => {
  it('ALL_MODELS aggregates every provider list', () => {
    // 3 OpenAI + 3 Gemini + 3 Anthropic API + 3 Claude login alias = 12
    expect(ALL_MODELS.length).toBe(12);
  });

  it('findModelEntry returns entries by id across providers', () => {
    expect(findModelEntry('gpt-5.5')?.label).toBe('GPT-5.5');
    expect(findModelEntry('claude-sonnet-4-6')?.label).toContain('Sonnet');
    expect(findModelEntry('sonnet')?.label).toBe('Sonnet'); // CLI alias
    expect(findModelEntry('does-not-exist')).toBeUndefined();
  });

  it('modelDeprecation returns null for non-deprecated models', () => {
    expect(modelDeprecation('claude-sonnet-4-6')).toBeNull();
    expect(modelDeprecation('does-not-exist')).toBeNull();
  });
});

describe('provider / modelDeprecationSeverity', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('returns "past" when removeOn is before now', () => {
    const d: ModelDeprecation = { since: '2025-01-01', removeOn: '2026-01-01', note: 'x' };
    expect(modelDeprecationSeverity(d, now)).toBe('past');
  });

  it('returns "imminent" when removeOn is within 30 days', () => {
    const d: ModelDeprecation = { since: '2025-01-01', removeOn: '2026-06-20', note: 'x' };
    expect(modelDeprecationSeverity(d, now)).toBe('imminent');
  });

  it('returns "scheduled" when removeOn is more than 30 days away', () => {
    const d: ModelDeprecation = { since: '2025-01-01', removeOn: '2026-12-01', note: 'x' };
    expect(modelDeprecationSeverity(d, now)).toBe('scheduled');
  });

  it('returns "announced" when removeOn is null (TBD)', () => {
    const d: ModelDeprecation = { since: '2025-01-01', removeOn: null, note: 'x' };
    expect(modelDeprecationSeverity(d, now)).toBe('announced');
  });
});
