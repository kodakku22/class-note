export type RailUiMode = 'simple' | 'custom' | 'full';

export const SIMPLE_RAIL_VIEW_IDS = ['subjects', 'daily', 'timetable', 'books'] as const;

export const FULL_RAIL_VIEW_IDS = [
  'subjects',
  'daily',
  'timetable',
  'books',
  'papers',
  'memos',
  'wiki',
  'outputs',
  'progress',
  'graph',
] as const;

export type RailViewId = (typeof FULL_RAIL_VIEW_IDS)[number];

const VIEW_ID_SET = new Set<string>(FULL_RAIL_VIEW_IDS);

export function sanitizeRailViewIds(
  ids: readonly string[] | undefined,
  fallback: readonly RailViewId[] = SIMPLE_RAIL_VIEW_IDS
): RailViewId[] {
  const result: RailViewId[] = [];
  for (const id of ids ?? []) {
    if (!VIEW_ID_SET.has(id) || result.includes(id as RailViewId)) continue;
    result.push(id as RailViewId);
  }
  return result.length > 0 ? result : [...fallback];
}

export function sanitizeRailCommandIds(ids: readonly string[] | undefined): string[] {
  const result: string[] = [];
  for (const id of ids ?? []) {
    const normalized = id.trim();
    if (!normalized || result.includes(normalized)) continue;
    result.push(normalized);
  }
  return result;
}

export function resolveRailViewIds(
  mode: RailUiMode,
  customIds: readonly string[] | undefined
): RailViewId[] {
  if (mode === 'simple') return [...SIMPLE_RAIL_VIEW_IDS];
  if (mode === 'full') return [...FULL_RAIL_VIEW_IDS];
  return sanitizeRailViewIds(customIds);
}

export function resolveRailCommandIds(
  mode: RailUiMode,
  customIds: readonly string[] | undefined
): string[] {
  if (mode === 'simple') return [];
  return sanitizeRailCommandIds(customIds);
}
