import { useMemo, useState } from 'react';
import type { PaletteCommand } from '../CommandPalette';
import type { RailUiMode, RailViewId } from '../../navigation/rail';

export type RailViewOption = {
  id: RailViewId;
  label: string;
  icon: string;
  description: string;
};

type Props = {
  uiMode: RailUiMode;
  railItems: RailViewId[];
  railCommandIds: string[];
  viewOptions: RailViewOption[];
  commands: PaletteCommand[];
  onChangeMode: (mode: RailUiMode) => void;
  onAddView: (id: RailViewId) => void;
  onAddCommand: (id: string) => void;
  onResetSimple: () => void;
  onSetFull: () => void;
  onClose: () => void;
};

type Tab = 'mode' | 'views' | 'commands';

const MODE_OPTIONS: Array<{ id: RailUiMode; label: string; description: string }> = [
  { id: 'simple', label: 'シンプル', description: '最初に使う基本機能だけ。' },
  { id: 'custom', label: 'カスタム', description: '必要な機能だけ追加します。' },
  { id: 'full', label: '全機能', description: 'すべての主要機能を表示します。' },
];

export function RailCustomizeDialog({
  uiMode,
  railItems,
  railCommandIds,
  viewOptions,
  commands,
  onChangeMode,
  onAddView,
  onAddCommand,
  onResetSimple,
  onSetFull,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('mode');
  const [query, setQuery] = useState('');
  const visibleViewIds = new Set(railItems);
  const visibleCommandIds = new Set(railCommandIds);

  const commandOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands
      .filter((command) => command.railEligible !== false)
      .filter((command) => {
        if (!q) return true;
        return [command.title, command.subtitle ?? '', ...(command.keywords ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
  }, [commands, query]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rail-customize-modal" onClick={(e) => e.stopPropagation()}>
        <h3>左アイコンを編集</h3>

        <div className="rail-customize-tabs" role="tablist" aria-label="左アイコン編集">
          <button className={tab === 'mode' ? 'active' : ''} onClick={() => setTab('mode')}>
            表示モード
          </button>
          <button className={tab === 'views' ? 'active' : ''} onClick={() => setTab('views')}>
            ビューを追加
          </button>
          <button className={tab === 'commands' ? 'active' : ''} onClick={() => setTab('commands')}>
            コマンドを追加
          </button>
        </div>

        {tab === 'mode' && (
          <div className="rail-customize-section">
            <div className="rail-mode-grid">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`rail-mode-option ${uiMode === mode.id ? 'active' : ''}`}
                  onClick={() => onChangeMode(mode.id)}
                >
                  <span>{mode.label}</span>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>
            <div className="rail-customize-actions">
              <button type="button" onClick={onResetSimple}>シンプルに戻す</button>
              <button type="button" onClick={onSetFull}>全機能を表示</button>
            </div>
          </div>
        )}

        {tab === 'views' && (
          <div className="rail-customize-section">
            <div className="rail-option-list">
              {viewOptions.map((option) => {
                const added = visibleViewIds.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="rail-option-row"
                    onClick={() => onAddView(option.id)}
                    disabled={added}
                  >
                    <span className="rail-option-icon" aria-hidden>{option.icon}</span>
                    <span className="rail-option-copy">
                      <strong>{option.label}</strong>
                      <small>{added ? '追加済み' : option.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'commands' && (
          <div className="rail-customize-section">
            <input
              className="rail-command-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="追加したいコマンドを検索..."
            />
            <div className="rail-option-list rail-command-list">
              {commandOptions.map((command) => {
                const added = visibleCommandIds.has(command.id);
                return (
                  <button
                    key={command.id}
                    type="button"
                    className="rail-option-row"
                    onClick={() => onAddCommand(command.id)}
                    disabled={added}
                  >
                    <span className="rail-option-icon" aria-hidden>{command.icon ?? '⌘'}</span>
                    <span className="rail-option-copy">
                      <strong>{command.title}</strong>
                      <small>{added ? '追加済み' : command.subtitle ?? 'コマンド'}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
