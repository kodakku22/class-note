import { useCallback, useMemo, useState, useEffect } from 'react';
import type { ViewMode } from '../state/appReducer';
import type { RailRenderedItem } from '../components/layout/IconRail';
import type { RailViewOption } from '../components/layout/RailCustomizeDialog';
import {
  FULL_RAIL_VIEW_IDS,
  SIMPLE_RAIL_VIEW_IDS,
  resolveRailCommandIds,
  resolveRailViewIds,
  sanitizeRailCommandIds,
  sanitizeRailViewIds,
  type RailUiMode,
  type RailViewId,
} from '../navigation/rail';

export type RailConfigOptions = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};

export type RailConfigResult = {
  uiMode: RailUiMode;
  railItems: RailViewId[];
  railCommandIds: string[];
  railViewItems: RailRenderedItem[];
  railViewOptions: RailViewOption[];
  resolvedRailCommandIds: string[];
  handleChangeRailMode: (mode: RailUiMode) => void;
  handleAddRailView: (id: RailViewId) => void;
  handleAddRailCommand: (id: string) => void;
  handleResetRailSimple: () => void;
  handleSetRailFull: () => void;
  handleReorderRailViews: (ids: string[]) => void;
  handleReorderRailCommands: (ids: string[]) => void;
};

/**
 * Manages icon-rail configuration: view tabs, command shortcuts,
 * UI mode (simple/custom/full), persistence, and reordering.
 */
export function useRailConfig({
  viewMode,
  setViewMode,
}: RailConfigOptions): RailConfigResult {
  const [uiMode, setUiMode] = useState<RailUiMode>('simple');
  const [railItems, setRailItems] = useState<RailViewId[]>([...SIMPLE_RAIL_VIEW_IDS]);
  const [railCommandIds, setRailCommandIds] = useState<string[]>([]);

  // Load persisted rail settings on mount
  useEffect(() => {
    let cancelled = false;
    window.api.settings.get().then((s) => {
      if (cancelled) return;
      setUiMode(s.uiMode ?? 'simple');
      setRailItems(sanitizeRailViewIds(s.railItems));
      setRailCommandIds(sanitizeRailCommandIds(s.railCommandIds));
    });
    return () => { cancelled = true; };
  }, []);

  const saveRailSettings = useCallback(
    async (partial: {
      uiMode?: RailUiMode;
      railItems?: RailViewId[];
      railCommandIds?: string[];
    }) => {
      if (partial.uiMode) setUiMode(partial.uiMode);
      if (partial.railItems) setRailItems(partial.railItems);
      if (partial.railCommandIds) setRailCommandIds(partial.railCommandIds);
      await window.api.settings.set(partial);
    },
    []
  );

  const handleChangeRailMode = useCallback(
    (mode: RailUiMode) => {
      void saveRailSettings({ uiMode: mode });
    },
    [saveRailSettings]
  );

  const handleAddRailView = useCallback(
    (id: RailViewId) => {
      const next = sanitizeRailViewIds([...railItems, id]);
      void saveRailSettings({ uiMode: 'custom', railItems: next });
    },
    [railItems, saveRailSettings]
  );

  const handleAddRailCommand = useCallback(
    (id: string) => {
      const next = sanitizeRailCommandIds([...railCommandIds, id]);
      void saveRailSettings({ uiMode: 'custom', railCommandIds: next });
    },
    [railCommandIds, saveRailSettings]
  );

  const handleResetRailSimple = useCallback(() => {
    void saveRailSettings({
      uiMode: 'simple',
      railItems: [...SIMPLE_RAIL_VIEW_IDS],
      railCommandIds: [],
    });
  }, [saveRailSettings]);

  const handleSetRailFull = useCallback(() => {
    void saveRailSettings({
      uiMode: 'full',
      railItems: [...FULL_RAIL_VIEW_IDS],
    });
  }, [saveRailSettings]);

  const handleReorderRailViews = useCallback(
    (ids: string[]) => {
      const next = sanitizeRailViewIds(ids, railItems);
      void saveRailSettings({ uiMode: 'custom', railItems: next });
    },
    [railItems, saveRailSettings]
  );

  const handleReorderRailCommands = useCallback(
    (ids: string[]) => {
      const next = sanitizeRailCommandIds(ids);
      void saveRailSettings({ uiMode: 'custom', railCommandIds: next });
    },
    [saveRailSettings]
  );

  const goToView = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
    },
    [setViewMode]
  );

  const railViewDefinitions = useMemo<Record<RailViewId, RailViewOption & {
    tooltip: string;
    active: boolean;
    run: () => void;
  }>>(
    () => ({
      subjects: {
        id: 'subjects',
        label: '科目',
        icon: '🏠',
        description: '科目ごとのノート',
        tooltip: '科目 (Ctrl+1)',
        active: viewMode === 'subject',
        run: () => goToView('subject'),
      },
      daily: {
        id: 'daily',
        label: '今日',
        icon: '📅',
        description: '今日のノート',
        tooltip: '今日 (Ctrl+2)',
        active: viewMode === 'daily',
        run: () => goToView('daily'),
      },
      timetable: {
        id: 'timetable',
        label: '時間割',
        icon: '🗓️',
        description: '授業の時間割',
        tooltip: '時間割 (Ctrl+3)',
        active: viewMode === 'timetable',
        run: () => goToView('timetable'),
      },
      books: {
        id: 'books',
        label: '読書',
        icon: '📖',
        description: '本と読書ノート',
        tooltip: '読書 (Ctrl+4)',
        active: viewMode === 'books' || viewMode === 'books-detail',
        run: () => goToView('books'),
      },
      papers: {
        id: 'papers',
        label: '論文・文献',
        icon: '📑',
        description: '論文管理と引用',
        tooltip: '論文・文献 (Ctrl+8)',
        active: viewMode === 'papers',
        run: () => goToView('papers'),
      },
      memos: {
        id: 'memos',
        label: 'メモ',
        icon: '🗒️',
        description: '短いメモ',
        tooltip: 'メモ (Ctrl+5)',
        active: viewMode === 'memos',
        run: () => goToView('memos'),
      },
      wiki: {
        id: 'wiki',
        label: 'Wiki',
        icon: '🧠',
        description: '整理されたSecond Brainページ',
        tooltip: 'Wiki (Ctrl+6)',
        active: viewMode === 'wiki',
        run: () => goToView('wiki'),
      },
      outputs: {
        id: 'outputs',
        label: 'Outputs',
        icon: '📤',
        description: '生成成果物',
        tooltip: 'Outputs (Ctrl+7)',
        active: viewMode === 'outputs',
        run: () => goToView('outputs'),
      },
      progress: {
        id: 'progress',
        label: '研究進捗',
        icon: '📈',
        description: '研究ダッシュボード',
        tooltip: '研究進捗 (Ctrl+9)',
        active: viewMode === 'progress',
        run: () => goToView('progress'),
      },
      graph: {
        id: 'graph',
        label: 'グラフ',
        icon: '🕸️',
        description: 'ノート間リンクの可視化',
        tooltip: 'グラフ',
        active: viewMode === 'graph',
        run: () => goToView('graph'),
      },
    }),
    [goToView, viewMode]
  );

  const railViewOptions = useMemo<RailViewOption[]>(
    () => FULL_RAIL_VIEW_IDS.map((id) => railViewDefinitions[id]),
    [railViewDefinitions]
  );

  const railViewItems = useMemo<RailRenderedItem[]>(
    () =>
      resolveRailViewIds(uiMode, railItems).map((id) => {
        const view = railViewDefinitions[id];
        return {
          id,
          label: view.label,
          icon: view.icon,
          tooltip: view.tooltip,
          active: view.active,
          onClick: view.run,
        };
      }),
    [railItems, railViewDefinitions, uiMode]
  );

  const resolvedRailCommandIds = useMemo(
    () => resolveRailCommandIds(uiMode, railCommandIds),
    [railCommandIds, uiMode]
  );

  return {
    uiMode,
    railItems,
    railCommandIds,
    railViewItems,
    railViewOptions,
    resolvedRailCommandIds,
    handleChangeRailMode,
    handleAddRailView,
    handleAddRailCommand,
    handleResetRailSimple,
    handleSetRailFull,
    handleReorderRailViews,
    handleReorderRailCommands,
  };
}
