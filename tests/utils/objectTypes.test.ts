import { describe, expect, it } from 'vitest';
import {
  CARD_COLORS,
  DEFAULT_TEMPLATES,
  OBJECT_TYPES,
  getObjectType,
} from '../../src/types/objectTypes';

describe('object type registry', () => {
  it('keeps object type ids unique and resolvable', () => {
    const ids = OBJECT_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getObjectType('experiment')?.label).toBe('実験');
    expect(getObjectType('missing')).toBeNull();
    expect(getObjectType(undefined)).toBeNull();
  });

  it('provides templates for every typed note that declares one', () => {
    for (const type of OBJECT_TYPES) {
      if (!type.templateName) continue;
      expect(DEFAULT_TEMPLATES[type.templateName]).toBeTruthy();
    }
  });

  it('keeps experiment templates useful for reproducibility checks', () => {
    const experiment = DEFAULT_TEMPLATES.experiment;

    expect(experiment).toContain('dataset:');
    expect(experiment).toContain('seed:');
    expect(experiment).toContain('git_sha:');
    expect(experiment).toContain('hardware:');
    expect(experiment).toContain('metrics: []');
  });

  it('exposes stable card color choices for memo/canvas UI', () => {
    const colorIds = CARD_COLORS.map((color) => color.id);
    expect(colorIds).toContain('default');
    expect(colorIds).toContain('indigo');
    expect(new Set(colorIds).size).toBe(colorIds.length);

    const memoColorRelation = getObjectType('memo')?.relations.find((relation) => relation.key === 'color');
    expect(memoColorRelation?.options).toEqual(colorIds);
  });
});
