// Slim sidebar paired with the IconRail. Shows: search trigger, subjects,
// Favorites (pinned), Recent, and Vault footer.
import { useState } from 'react';
import { colorForSubject, emojiForSubject } from '../utils/colors';
import { LearningProgress } from './insights/LearningProgress';
import { ContextMenu, type ContextMenuItem } from './common/ContextMenu';
import { useDialog } from './common/Dialog';
import { parseFrontmatter, stringifyFrontmatter } from '../utils/frontmatter';

export type RecentEntry = {
  filePath: string;
  fileName: string;
  subject?: string;
};

export type FavoriteEntry = {
  filePath: string;
  fileName: string;
  subject?: string;
};

type Props = {
  vaultPath: string;
  subjects: string[];
  activeSubject: string | null;
  viewMode:
    | 'subject'
    | 'timetable'
    | 'books'
    | 'books-detail'
    | 'memos'
    | 'daily'
    | 'graph'
    | 'wiki'
    | 'outputs'
    | 'papers'
    | 'progress'
    | 'plugin';
  recents: RecentEntry[];
  favorites: FavoriteEntry[];
  onSelectSubject: (s: string) => void;
  onShowSettings: () => void;
  onShowPalette: () => void;
  onOpenObsidian: () => void;
  onSubjectsChanged: () => void;
  onResetVault: () => void;
  onOpenFile: (filePath: string) => void;
  /** Remove an entry from the renderer-managed recents list. */
  onRemoveRecent?: (filePath: string) => void;
};

export function Sidebar({
  vaultPath,
  subjects,
  activeSubject,
  viewMode,
  recents,
  favorites,
  onSelectSubject,
  onShowSettings,
  onShowPalette,
  onOpenObsidian,
  onSubjectsChanged,
  onResetVault,
  onOpenFile,
  onRemoveRecent,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Single shared context menu state for subjects, favorites, recents.
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dlg, dialogElement] = useDialog();

  // Build the menu for a subject. We surface rename, delete, copy-path and
  // reveal-in-folder; the subject directory is the working unit so revealing
  // it gives the user a way to back up before destructive operations.
  const subjectMenu = (subject: string): ContextMenuItem[] => [
    {
      id: 'rename',
      emoji: '✏️',
      label: '名前を変更',
      onSelect: async () => {
        setMenu(null);
        const v = await dlg.prompt({
          title: '科目の名前を変更',
          defaultValue: subject,
          okLabel: '変更',
        });
        if (!v || v.trim() === subject) return;
        const r = await window.api.vault.renameSubject(vaultPath, subject, v.trim());
        if (!r.ok) {
          await dlg.alert({ title: 'リネーム失敗', message: r.error ?? '', variant: 'error' });
        }
        onSubjectsChanged();
      },
    },
    {
      id: 'reveal',
      emoji: '📁',
      label: 'フォルダで表示',
      onSelect: () => {
        setMenu(null);
        const dirPath = `${vaultPath}/${subject}`.replace(/\\/g, '/');
        window.api.materials.revealInFolder(dirPath);
      },
    },
    {
      id: 'delete',
      emoji: '🗑️',
      label: '削除 (ゴミ箱へ)',
      danger: true,
      onSelect: async () => {
        setMenu(null);
        const ok = await dlg.confirm({
          title: '科目を削除しますか？',
          message: `「${subject}」を .trash/ フォルダに移動します。後から手動で復元できます。`,
          okLabel: '削除',
          destructive: true,
        });
        if (!ok) return;
        const r = await window.api.vault.deleteSubject(vaultPath, subject);
        if (!r.ok) {
          await dlg.alert({ title: '削除失敗', message: r.error ?? '', variant: 'error' });
        }
        onSubjectsChanged();
      },
    },
  ];

  // Menu for favorite (pinned) note items. "Pin 解除" rewrites frontmatter.
  const favoriteMenu = (entry: FavoriteEntry): ContextMenuItem[] => [
    {
      id: 'open',
      emoji: '📂',
      label: '開く',
      onSelect: () => {
        setMenu(null);
        onOpenFile(entry.filePath);
      },
    },
    {
      id: 'reveal',
      emoji: '📁',
      label: 'フォルダで表示',
      onSelect: () => {
        setMenu(null);
        window.api.materials.revealInFolder(entry.filePath);
      },
    },
    {
      id: 'copyPath',
      emoji: '📋',
      label: 'パスをコピー',
      onSelect: () => {
        setMenu(null);
        navigator.clipboard.writeText(entry.filePath).catch(() => {});
      },
    },
    {
      id: 'unpin',
      emoji: '❌',
      label: 'Pin を解除',
      onSelect: async () => {
        setMenu(null);
        try {
          const raw = await window.api.vault.readNote(entry.filePath);
          const { meta, body } = parseFrontmatter(raw);
          const newMeta = { ...meta };
          delete newMeta.pinned;
          const next = stringifyFrontmatter(newMeta, body);
          await window.api.vault.writeNote(entry.filePath, next);
          onSubjectsChanged();
        } catch {
          // ignore
        }
      },
    },
  ];

  // Menu for recent note items.
  const recentMenu = (entry: RecentEntry): ContextMenuItem[] => [
    {
      id: 'open',
      emoji: '📂',
      label: '開く',
      onSelect: () => {
        setMenu(null);
        onOpenFile(entry.filePath);
      },
    },
    {
      id: 'reveal',
      emoji: '📁',
      label: 'フォルダで表示',
      onSelect: () => {
        setMenu(null);
        window.api.materials.revealInFolder(entry.filePath);
      },
    },
    {
      id: 'copyPath',
      emoji: '📋',
      label: 'パスをコピー',
      onSelect: () => {
        setMenu(null);
        navigator.clipboard.writeText(entry.filePath).catch(() => {});
      },
    },
    {
      id: 'remove',
      emoji: '🗑️',
      label: '履歴から外す',
      danger: true,
      onSelect: () => {
        setMenu(null);
        onRemoveRecent?.(entry.filePath);
      },
    },
  ];

  const submit = async () => {
    setError(null);
    const result = await window.api.vault.createSubject(vaultPath, newName);
    if (!result.ok) {
      setError(result.error ?? '作成に失敗しました');
      return;
    }
    const created = newName.trim();
    setNewName('');
    setShowAdd(false);
    onSubjectsChanged();
    onSelectSubject(created);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="palette-trigger" onClick={onShowPalette} title="Ctrl+P / Ctrl+K">
          <span className="palette-trigger-icon">🔍</span>
          <span className="palette-trigger-label">チャンネル / ノート検索</span>
          <span className="palette-trigger-kbd">Ctrl+P</span>
        </button>
      </div>

      <div className="sidebar-list">
        <LearningProgress vaultPath={vaultPath} />
        {favorites.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Favorites</div>
            {favorites.map((f) => (
              <div
                key={f.filePath}
                className="favorite-item"
                onClick={() => onOpenFile(f.filePath)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, items: favoriteMenu(f) });
                }}
                title={f.filePath}
              >
                <span className="icon">⭐</span>
                <span className="name">{f.fileName.replace(/\.md$/, '')}</span>
              </div>
            ))}
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-section-label">Channels</div>
          {subjects.length === 0 && (
            <div style={{ padding: '8px 14px', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.5 }}>
              まだ科目がありません。<br />下の「+」から作りましょう。
            </div>
          )}
          {subjects.map((s) => {
            const c = colorForSubject(s);
            const emoji = emojiForSubject(s);
            return (
              <div
                key={s}
                className={`sidebar-item ${activeSubject === s && (viewMode === 'subject') ? 'active' : ''}`}
                onClick={() => onSelectSubject(s)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, items: subjectMenu(s) });
                }}
              >
                <span className="color-dot" style={{ background: c.accent }} />
                <span className="icon">{emoji}</span>
                <span className="name">{s}</span>
              </div>
            );
          })}
        </div>

        {recents.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Recent</div>
            {recents.slice(0, 10).map((r) => (
              <div
                key={r.filePath}
                className="recent-item"
                onClick={() => onOpenFile(r.filePath)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, items: recentMenu(r) });
                }}
                title={r.filePath}
              >
                <span className="icon">📄</span>
                <span className="name">{r.fileName.replace(/\.md$/, '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="add-btn" onClick={() => setShowAdd(true)}>
          <span style={{ width: 18, textAlign: 'center' }}>＋</span>
          <span>科目を追加</span>
        </button>
        <button className="add-btn" onClick={onOpenObsidian} title="グラフビュー / プラグイン等は Obsidian で">
          <span style={{ width: 18, textAlign: 'center' }}>🕸</span>
          <span>Obsidian で開く</span>
        </button>
        <div className="footer-actions">
          <button onClick={onShowSettings}>⚙️ 設定</button>
          <button onClick={onResetVault}>📂 Vault</button>
        </div>
        <div className="vault-path" title={vaultPath}>
          {vaultPath}
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>科目を追加</h3>
            <div className="modal-section">
              <label>科目名</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: 数学, 英語, 物理..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
              />
              {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAdd(false)}>キャンセル</button>
              <button className="primary" onClick={submit} disabled={!newName.trim()}>
                作成
              </button>
            </div>
          </div>
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
      {dialogElement}
    </aside>
  );
}
