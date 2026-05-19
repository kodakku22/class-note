import { useState, useEffect } from 'react';

export type AppTitleBarProps = {
  label: string;
  canUseWorkspaceActions: boolean;
  onShowPalette?: () => void;
  onNewNote?: () => void;
  onShowSettings?: () => void;
};

export function AppTitleBar({
  label,
  canUseWorkspaceActions,
  onShowPalette,
  onNewNote,
  onShowSettings,
}: AppTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.appWindow.isMaximized().then((result) => {
      if (!cancelled) setIsMaximized(result.maximized);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleMaximize = async () => {
    const result = await window.api.appWindow.toggleMaximize();
    if (result.ok) setIsMaximized(result.maximized);
  };

  return (
    <div className="discord-titlebar">
      <div className="discord-titlebar-left">
        <span className="discord-titlebar-logo" aria-hidden>AI</span>
        <span className="discord-titlebar-name">ClassNotes</span>
        <span className="discord-titlebar-divider" aria-hidden />
        <span className="discord-titlebar-context">{label}</span>
      </div>
      <div className="discord-titlebar-actions">
        <button
          type="button"
          className="discord-titlebar-action"
          onClick={onShowPalette}
          disabled={!canUseWorkspaceActions}
          aria-label="検索とコマンド"
          title="検索とコマンド"
        >
          ⌕
        </button>
        <button
          type="button"
          className="discord-titlebar-action"
          onClick={onNewNote}
          disabled={!canUseWorkspaceActions}
          aria-label="新しいノート"
          title="新しいノート"
        >
          ＋
        </button>
        <button
          type="button"
          className="discord-titlebar-action"
          onClick={onShowSettings}
          disabled={!canUseWorkspaceActions}
          aria-label="設定"
          title="設定"
        >
          ⚙
        </button>
      </div>
      <div className="discord-window-controls">
        <button type="button" onClick={() => window.api.appWindow.minimize()} aria-label="最小化">−</button>
        <button type="button" onClick={toggleMaximize} aria-label={isMaximized ? '元に戻す' : '最大化'}>
          {isMaximized ? '❐' : '□'}
        </button>
        <button type="button" className="close" onClick={() => window.api.appWindow.close()} aria-label="閉じる">×</button>
      </div>
    </div>
  );
}
