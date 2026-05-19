import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiSettingsPanel,
  DEFAULT_AI_CONFIG,
  aiStatusText,
  aiStatusTone,
  authModeLabel,
  providerDisplayName,
  providerThemeClass,
  selectedModel,
  type AiConfig,
  type AiTestState,
} from '../ai/AiSettingsPanel';
import type { PaletteCommand } from '../CommandPalette';
import type { AiProvider, ProviderAuthStatus } from '../../types';

export type RailRenderedItem = {
  id: string;
  label: string;
  icon: string;
  tooltip: string;
  active?: boolean;
  onClick: () => void;
};

type Props = {
  viewItems: RailRenderedItem[];
  commandIds: string[];
  commands: PaletteCommand[];
  onCustomize: () => void;
  onShowPalette: () => void;
  onShowSettings: () => void;
  onReorderViews: (ids: string[]) => void;
  onReorderCommands: (ids: string[]) => void;
};

type DragState = { kind: 'view' | 'command'; id: string } | null;
type ProviderKey = Exclude<AiProvider, 'none'>;
type TooltipState = { text: string; top: number; left: number } | null;

function reorder(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids;
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function IconRail({
  viewItems,
  commandIds,
  commands,
  onCustomize,
  onShowPalette,
  onShowSettings,
  onReorderViews,
  onReorderCommands,
}: Props) {
  const railRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<DragState>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [authStatuses, setAuthStatuses] = useState<Partial<Record<ProviderKey, ProviderAuthStatus>>>({});
  const [testState, setTestState] = useState<AiTestState>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const commandItems: RailRenderedItem[] = commandIds
    .map((id) => commands.find((command) => command.id === id && command.railEligible !== false))
    .filter((command): command is PaletteCommand => Boolean(command))
    .map((command) => ({
      id: command.id,
      label: command.title,
      icon: command.icon ?? '⌘',
      tooltip: command.title,
      onClick: () => {
        const label = command.railConfirmLabel ?? command.title;
        if (!window.confirm(`「${label}」を実行しますか？`)) return;
        void command.run();
      },
    }));

  const allItems = [...viewItems, ...commandItems];
  const activeItem = allItems.find((item) => item.active);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && aiOpen) {
      e.preventDefault();
      setAiOpen(false);
      return;
    }
    const buttons = Array.from(
      railRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
    );
    const current = document.activeElement as HTMLElement | null;
    const idx = current ? buttons.indexOf(current as HTMLButtonElement) : -1;
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % buttons.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[next].focus();
  };

  const tabIndexFor = (active: boolean) => (active ? 0 : -1);

  const showTooltip = useCallback((text: string, target: HTMLElement) => {
    if (!text || aiOpen) return;
    const buttonRect = target.getBoundingClientRect();
    const railRect = railRef.current?.getBoundingClientRect();
    const estimatedTooltipHalfHeight = 16;
    const margin = 10;
    const top = Math.min(
      window.innerHeight - estimatedTooltipHalfHeight - margin,
      Math.max(estimatedTooltipHalfHeight + margin, buttonRect.top + buttonRect.height / 2)
    );
    const left = (railRect?.right ?? buttonRect.right) + 10;
    setTooltip({ text, top, left });
  }, [aiOpen]);

  const hideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  const refreshAiState = useCallback(async () => {
    const config = await window.api.settings.getAiConfig();
    setAiConfig({
      provider: config.provider,
      authMode: config.authMode,
      model: config.model,
      models: { ...DEFAULT_AI_CONFIG.models, ...config.models },
    });
    const statusResult = await window.api.settings.getProviderAuthStatus();
    if (statusResult.ok) setAuthStatuses(statusResult.providers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshAiState()
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshAiState]);

  useEffect(() => {
    if (!aiOpen) return undefined;
    hideTooltip();
    void refreshAiState().catch(() => {});
    const onPointerDown = (event: MouseEvent) => {
      if (!railRef.current?.contains(event.target as Node)) {
        setAiOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [aiOpen, hideTooltip, refreshAiState]);

  const onAiChanged = useCallback((config: AiConfig) => {
    setAiConfig(config);
  }, []);

  const onAuthStatusChanged = useCallback((statuses: Partial<Record<ProviderKey, ProviderAuthStatus>>) => {
    setAuthStatuses(statuses);
  }, []);

  const activeProvider = aiConfig.provider === 'none' ? null : aiConfig.provider;
  const currentStatus = activeProvider ? authStatuses[activeProvider] : null;
  const currentTone = aiStatusTone(aiConfig, currentStatus, testState);
  const currentStatusText = aiStatusText(aiConfig, currentStatus, testState);
  const currentModel = selectedModel(aiConfig) || aiConfig.model;
  const buttonLabel =
    aiConfig.provider === 'none'
      ? 'AIプロバイダーを選択: Off, AI無効'
      : `AIプロバイダーを選択: ${providerDisplayName(aiConfig.provider)}, ${authModeLabel(
          aiConfig.authMode
        )}, ${currentModel}, ${currentStatusText}`;

  const handleDrop = (kind: 'view' | 'command', targetId: string) => {
    if (!dragging || dragging.kind !== kind) return;
    if (kind === 'view') {
      onReorderViews(reorder(viewItems.map((item) => item.id), dragging.id, targetId));
    } else {
      onReorderCommands(reorder(commandItems.map((item) => item.id), dragging.id, targetId));
    }
    setDragging(null);
    setDropTarget(null);
  };

  const renderItem = (kind: 'view' | 'command', item: RailRenderedItem) => {
    const isDragging = dragging?.kind === kind && dragging.id === item.id;
    const isDropTarget = dropTarget?.kind === kind && dropTarget.id === item.id;
    return (
      <button
        key={`${kind}-${item.id}`}
        className={[
          'icon-rail-btn',
          item.active ? 'active' : '',
          isDragging ? 'dragging' : '',
          isDropTarget ? 'drop-target' : '',
        ].filter(Boolean).join(' ')}
        onClick={item.onClick}
        onMouseEnter={(e) => showTooltip(item.tooltip, e.currentTarget)}
        onMouseLeave={hideTooltip}
        onFocus={(e) => showTooltip(item.tooltip, e.currentTarget)}
        onBlur={hideTooltip}
        aria-label={item.label}
        aria-current={item.active ? 'page' : undefined}
        tabIndex={tabIndexFor(Boolean(item.active))}
        draggable
        onDragStart={(e) => {
          hideTooltip();
          setDragging({ kind, id: item.id });
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `${kind}:${item.id}`);
        }}
        onDragOver={(e) => {
          if (dragging?.kind !== kind) return;
          e.preventDefault();
          setDropTarget({ kind, id: item.id });
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(kind, item.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropTarget(null);
        }}
      >
        <span aria-hidden="true">{item.icon}</span>
      </button>
    );
  };

  return (
    <nav
      className="icon-rail"
      aria-label="メインナビゲーション"
      ref={railRef}
      onKeyDown={onKeyDown}
      onScroll={hideTooltip}
    >
      <div className="icon-rail-top">
        <div className="icon-rail-ai">
          <button
            className={[
              'icon-rail-ai-trigger',
              providerThemeClass(aiConfig.provider),
              `tone-${currentTone}`,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setAiOpen((open) => !open)}
            onMouseEnter={(e) =>
              showTooltip(
                `現在のAI: ${providerDisplayName(aiConfig.provider)} · ${currentStatusText}`,
                e.currentTarget
              )
            }
            onMouseLeave={hideTooltip}
            onFocus={(e) =>
              showTooltip(
                `現在のAI: ${providerDisplayName(aiConfig.provider)} · ${currentStatusText}`,
                e.currentTarget
              )
            }
            onBlur={hideTooltip}
            aria-label={buttonLabel}
            aria-expanded={aiOpen}
            data-provider={aiConfig.provider}
            type="button"
          >
            <span className="icon-rail-ai-label">{providerDisplayName(aiConfig.provider)}</span>
            <span
              className="icon-rail-ai-status-dot"
              data-status={currentTone}
              aria-hidden="true"
            />
          </button>
          {aiOpen && (
            <div className="icon-rail-ai-popover" role="dialog" aria-label="AIプロバイダー設定">
              <AiSettingsPanel
                compact
                onChanged={onAiChanged}
                onStatusChanged={onAuthStatusChanged}
                onTestStateChanged={setTestState}
              />
            </div>
          )}
        </div>
      </div>

      <div className="icon-rail-scroll" onScroll={hideTooltip}>
        {viewItems.map((item) => renderItem('view', item))}

        <button
          className="icon-rail-btn icon-rail-add"
          onClick={onCustomize}
          onMouseEnter={(e) => showTooltip('追加・表示モード', e.currentTarget)}
          onMouseLeave={hideTooltip}
          onFocus={(e) => showTooltip('追加・表示モード', e.currentTarget)}
          onBlur={hideTooltip}
          aria-label="左アイコンを追加・編集"
          tabIndex={activeItem ? -1 : 0}
        >
          <span aria-hidden="true">＋</span>
        </button>

        {commandItems.length > 0 && (
          <>
            <div className="icon-rail-divider" aria-hidden />
            {commandItems.map((item) => renderItem('command', item))}
          </>
        )}
      </div>

      <div className="icon-rail-bottom">
        <div className="icon-rail-divider" aria-hidden />
        <button
          className="icon-rail-btn"
          onClick={onShowPalette}
          onMouseEnter={(e) => showTooltip('検索 (Ctrl+P)', e.currentTarget)}
          onMouseLeave={hideTooltip}
          onFocus={(e) => showTooltip('検索 (Ctrl+P)', e.currentTarget)}
          onBlur={hideTooltip}
          aria-label="コマンドパレットを開く"
          tabIndex={-1}
        >
          <span aria-hidden="true">🔍</span>
        </button>

        <button
          className="icon-rail-btn"
          onClick={onShowSettings}
          onMouseEnter={(e) => showTooltip('設定', e.currentTarget)}
          onMouseLeave={hideTooltip}
          onFocus={(e) => showTooltip('設定', e.currentTarget)}
          onBlur={hideTooltip}
          aria-label="設定を開く"
          tabIndex={-1}
        >
          <span aria-hidden="true">⚙️</span>
        </button>
      </div>

      {tooltip && (
        <div
          className="icon-rail-tooltip"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          {tooltip.text}
        </div>
      )}
    </nav>
  );
}
