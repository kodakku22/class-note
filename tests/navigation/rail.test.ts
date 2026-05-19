// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FULL_RAIL_VIEW_IDS,
  SIMPLE_RAIL_VIEW_IDS,
  resolveRailCommandIds,
  resolveRailViewIds,
  sanitizeRailCommandIds,
  sanitizeRailViewIds,
} from '../../src/navigation/rail';

describe('rail navigation helpers', () => {
  it('uses simple defaults for simple mode', () => {
    expect(resolveRailViewIds('simple', ['papers'])).toEqual([...SIMPLE_RAIL_VIEW_IDS]);
    expect(resolveRailCommandIds('simple', ['new-note'])).toEqual([]);
  });

  it('uses all views for full mode and keeps custom commands', () => {
    expect(resolveRailViewIds('full', ['books'])).toEqual([...FULL_RAIL_VIEW_IDS]);
    expect(resolveRailCommandIds('full', ['new-note'])).toEqual(['new-note']);
  });

  it('sanitizes unknown and duplicate view ids', () => {
    expect(sanitizeRailViewIds(['books', 'unknown', 'books', 'wiki'])).toEqual(['books', 'wiki']);
  });

  it('sanitizes command ids without dropping valid unknown commands prematurely', () => {
    expect(sanitizeRailCommandIds([' new-note ', '', 'new-note', 'compile-wiki'])).toEqual([
      'new-note',
      'compile-wiki',
    ]);
  });
});
