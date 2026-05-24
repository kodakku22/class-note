import { useState, DragEvent } from 'react';
import { FileEntry } from '../types';
import { colorForSubject, emojiForSubject } from '../utils/colors';
import { ContextMenu, type ContextMenuItem } from './common/ContextMenu';
import { useDialog } from './common/Dialog';
import { CanvasPreviewDialog } from './papers/CanvasPreviewDialog';

type VirtualFile = { kind: 'qa' } | null;
export type SubjectView = 'list' | 'gallery' | 'database' | 'board' | 'graph';

type Props = {
  vaultPath: string;
  subject: string | null;
  files: { notes: FileEntry[]; materials: FileEntry[] };
  activeFile: FileEntry | null;
  virtualFile: VirtualFile;
  onSelect: (f: FileEntry) => void;
  onSelectVirtual: (kind: 'qa' | 'overview') => void;
  onChanged: () => void;
  /** Open the given file in Obsidian (URI scheme). Optional; menu hides if absent. */
  onOpenInObsidian?: (filePath: string) => void;
  /** Trigger rename UI from outside (e.g. floating input). Optional. */
  onRename?: (file: FileEntry) => void;
  view?: SubjectView;
  onChangeView?: (v: SubjectView) => void;
};

function iconFor(kind: FileEntry['kind']): string {
  switch (kind) {
    case 'note': return '📝';
    case 'pdf': return '📕';
    case 'image': return '🖼️';
    case 'office': return '📘';
    default: return '📄';
  }
}

export function FileList({
  vaultPath,
  subject,
  files,
  activeFile,
  virtualFile,
  onSelect,
  onSelectVirtual,
  onChanged,
  onOpenInObsidian,
  onRename,
  view = 'list',
  onChangeView,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dlg, dialogElement] = useDialog();
  const [canvasFor, setCanvasFor] = useState<string | null>(null);

  // Build the right-click menu for a file. The same menu shape works for
  // notes and materials, so we generalize over the kind. Materials don't
  // get "rename" (we leave file renaming to the user's OS for now).
  const buildMenu = (f: FileEntry, e: React.MouseEvent): ContextMenuItem[] => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        emoji: '📂',
        label: '開く',
        onSelect: () => {
          setMenu(null);
          onSelect(f);
        },
      },
    ];
    if (onOpenInObsidian) {
      items.push({
        id: 'obsidian',
        emoji: '🪟',
        label: 'Obsidian で開く',
        onSelect: () => {
          setMenu(null);
          onOpenInObsidian(f.path);
        },
      });
    }
    items.push(
      {
        id: 'reveal',
        emoji: '📁',
        label: 'フォルダで表示',
        onSelect: () => {
          setMenu(null);
          window.api.materials.revealInFolder(f.path);
        },
      },
      {
        id: 'copyPath',
        emoji: '📋',
        label: 'パスをコピー',
        onSelect: () => {
          setMenu(null);
          navigator.clipboard.writeText(f.path).catch(() => {});
        },
      }
    );
    if (f.kind === 'note' && onRename) {
      items.push({
        id: 'rename',
        emoji: '✏️',
        label: '名前を変更',
        onSelect: () => {
          setMenu(null);
          onRename(f);
        },
      });
    }
    if (f.kind === 'note') {
      items.push({
        id: 'duplicate',
        emoji: '⎘',
        label: '複製',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.vault.duplicateNote(f.path);
          if (r.ok) onChanged();
          else
            await dlg.alert({
              title: '複製に失敗しました',
              message: r.error ?? '不明なエラー',
              variant: 'error',
            });
        },
      });
      // AI agents — same menu items show on lectures (科目別ノート) and
      // papers thanks to the cross-cutting agent design (electron/ai/agents.ts).
      items.push({
        id: 'ai-summarize',
        emoji: '🤖',
        label: 'AI で要約',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.ai.summarizeAndApply(f.path);
          if (r.ok) {
            await dlg.alert({
              title: '要約完了',
              message: r.result.oneLiner,
              variant: 'success',
            });
            onChanged();
          } else {
            await dlg.alert({
              title: '要約に失敗しました',
              message: r.error,
              variant: 'error',
            });
          }
        },
      });
      items.push({
        id: 'ai-tag',
        emoji: '🏷',
        label: 'AI でタグ付け',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.ai.autoTag(f.path);
          if (!r.ok) {
            await dlg.alert({
              title: 'タグ提案失敗',
              message: r.error,
              variant: 'error',
            });
            return;
          }
          const apply = await dlg.confirm({
            title: 'タグを適用しますか？',
            message: `${r.result.tags.join(', ')}\n\n${r.result.reasoning}`,
            okLabel: '適用',
          });
          if (apply) {
            await window.api.ai.applyTags(f.path, r.result.tags);
            onChanged();
          }
        },
      });
      items.push({
        id: 'ai-canvas',
        emoji: '🎨',
        label: 'AI で Canvas 生成',
        onSelect: () => {
          setMenu(null);
          setCanvasFor(f.path);
        },
      });
      items.push({
        id: 'latex-export',
        emoji: '📐',
        label: 'LaTeX (NeurIPS) で書出',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.latex.exportNote(vaultPath, f.path, 'neurips');
          if (r.ok) {
            await dlg.alert({
              title: 'LaTeX 書出完了',
              message: `${r.outputDir} に main.tex を保存しました。\n\n${
                r.usedPandoc ? '✓ Pandoc 経由で変換' : '⚠ 簡易フォールバックで変換 (Pandoc を入れるとフル対応)'
              }`,
              variant: 'success',
            });
          } else {
            await dlg.alert({
              title: 'LaTeX 書出失敗',
              message: r.error ?? '不明なエラー',
              variant: 'error',
            });
          }
        },
      });
      items.push({
        id: 'ai-optimize',
        emoji: '🤖',
        label: 'AI で Markdown 整形',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.ai.optimizeMarkdown(f.path);
          if (!r.ok) {
            await dlg.alert({
              title: '整形失敗',
              message: r.error,
              variant: 'error',
            });
            return;
          }
          // Show first 3 changes in confirmation. Apply replaces the body
          // wholesale via writeNote (mtime-protected).
          const summary = r.result.changes.slice(0, 5).join('\n');
          const apply = await dlg.confirm({
            title: '整形を適用しますか？',
            message: `主な変更:\n${summary}\n\n${r.result.changes.length > 5 ? `他 ${r.result.changes.length - 5} 件` : ''}`,
            okLabel: '適用',
            destructive: true,
          });
          if (!apply) return;
          // Read current frontmatter and re-merge optimized body.
          // We use writeNote with no expectedMtime (force overwrite) since
          // the user just confirmed.
          const current = await window.api.vault.readNote(f.path);
          // Preserve frontmatter — optimized usually has it but be defensive.
          const fmMatch = current.match(/^---\n[\s\S]*?\n---\n/);
          const newContent = fmMatch && !r.result.optimized.startsWith('---')
            ? fmMatch[0] + r.result.optimized
            : r.result.optimized;
          await window.api.vault.writeNote(f.path, newContent);
          onChanged();
        },
      });
    }
    items.push({
      id: 'delete',
      emoji: '🗑️',
      label: f.kind === 'note' ? '削除 (ゴミ箱へ)' : '削除',
      shortcut: 'Del',
      danger: true,
      onSelect: async () => {
        setMenu(null);
        const ok = await dlg.confirm({
          title: '削除しますか？',
          message: `${f.name} をゴミ箱 (.trash/) に移動します。後から手動で復元できます。`,
          okLabel: '削除',
          cancelLabel: 'キャンセル',
          destructive: true,
        });
        if (!ok) return;
        const r = await window.api.vault.deleteNote(f.path);
        if (r.ok) onChanged();
        else
          await dlg.alert({
            title: '削除に失敗しました',
            message: r.error ?? '不明なエラー',
            variant: 'error',
          });
      },
    });
    return items;
  };

  const onDragOver = (e: DragEvent) => {
    if (!subject) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!subject) return;
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = (f as File & { path?: string }).path;
      if (p) paths.push(p);
    }
    if (paths.length === 0) return;
    setBusy(true);
    try {
      await window.api.materials.addFiles(vaultPath, subject, paths);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const createTodaysNote = async () => {
    if (!subject) return;
    const { filePath } = await window.api.vault.createTodaysNote(vaultPath, subject);
    onChanged();
    setTimeout(() => {
      const all = [...files.notes, ...files.materials];
      const found = all.find((f) => f.path === filePath);
      if (found) onSelect(found);
    }, 200);
  };

  if (!subject) {
    return (
      <div className="filelist">
        <div className="empty-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>👈</div>
            サイドバーから科目を選んでください
          </div>
        </div>
      </div>
    );
  }

  const overviewActive =
    !virtualFile &&
    activeFile?.name === '_概要.md' &&
    (activeFile.path.includes(`\\${subject}\\`) || activeFile.path.includes(`/${subject}/`));
  const qaActive = virtualFile?.kind === 'qa';
  const c = colorForSubject(subject);
  const emoji = emojiForSubject(subject);

  return (
    <div
      className={`filelist ${dragging ? 'dragging' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="filelist-header" style={{ borderBottom: `2px solid ${c.bg}` }}>
        <div className="subject-name">
          <span className="subject-icon">{emoji}</span>
          <span>{subject}</span>
        </div>
        <div className="subject-meta">
          ノート {files.notes.length} 件 · 資料 {files.materials.length} 件
        </div>
        {onChangeView && (
          <div className="view-tabs">
            <button
              className={view === 'list' ? 'view-tab active' : 'view-tab'}
              onClick={() => onChangeView('list')}
              title="リスト表示"
            >
              📋
            </button>
            <button
              className={view === 'gallery' ? 'view-tab active' : 'view-tab'}
              onClick={() => onChangeView('gallery')}
              title="ギャラリー表示"
            >
              🎴
            </button>
            <button
              className={view === 'board' ? 'view-tab active' : 'view-tab'}
              onClick={() => onChangeView('board')}
              title="Canvas Board"
            >
              🗂️
            </button>
            <button
              className={view === 'database' ? 'view-tab active' : 'view-tab'}
              onClick={() => onChangeView('database')}
              title="Database View"
            >
              📊
            </button>
            <button
              className={view === 'graph' ? 'view-tab active' : 'view-tab'}
              onClick={() => onChangeView('graph')}
              title="グラフ"
            >
              🕸️
            </button>
          </div>
        )}
      </div>
      <div className="filelist-body">
        <div className="section-label">この科目で</div>
        <div
          className={`file-item virtual ${overviewActive ? 'active' : ''}`}
          onClick={() => onSelectVirtual('overview')}
        >
          <span className="icon">📋</span>
          <span className="name">科目概要</span>
        </div>
        <div
          className={`file-item virtual ${qaActive ? 'active' : ''}`}
          onClick={() => onSelectVirtual('qa')}
        >
          <span className="icon">💬</span>
          <span className="name">AIに質問</span>
        </div>
        <div className="file-item virtual" onClick={createTodaysNote}>
          <span className="icon">＋</span>
          <span className="name">今日の授業ノートを作成</span>
        </div>

        <div className="section-label">ノート</div>
        {files.notes.length === 0 && (
          <div style={{ padding: '4px 8px', color: 'var(--text-tertiary)', fontSize: 12 }}>
            まだありません
          </div>
        )}
        {files.notes.map((f) => (
          <div
            key={f.path}
            className={`file-item ${activeFile?.path === f.path && !virtualFile ? 'active' : ''}`}
            onClick={() => onSelect(f)}
            onContextMenu={(e) =>
              setMenu({ x: e.clientX, y: e.clientY, items: buildMenu(f, e) })
            }
          >
            <span className="icon">{iconFor(f.kind)}</span>
            <span className="name">{f.name.replace(/\.md$/, '')}</span>
          </div>
        ))}

        <div className="section-label">資料</div>
        {files.materials.length === 0 && (
          <div style={{ padding: '4px 8px', color: 'var(--text-tertiary)', fontSize: 12 }}>
            まだありません — ドラッグ&ドロップで追加
          </div>
        )}
        {files.materials.map((f) => (
          <div
            key={f.path}
            className={`file-item ${activeFile?.path === f.path && !virtualFile ? 'active' : ''}`}
            onClick={() => onSelect(f)}
            onContextMenu={(e) =>
              setMenu({ x: e.clientX, y: e.clientY, items: buildMenu(f, e) })
            }
            title={f.kind === 'office' ? 'クリックで外部アプリで開く' : ''}
          >
            <span className="icon">{iconFor(f.kind)}</span>
            <span className="name">{f.name}</span>
            {f.kind === 'office' && <span className="external-icon">↗</span>}
          </div>
        ))}

        <div className="dropzone-hint">
          {busy ? '追加中...' : '📎 ファイルをここにドロップ'}
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      {canvasFor && (
        <CanvasPreviewDialog
          filePath={canvasFor}
          onClose={() => setCanvasFor(null)}
        />
      )}
      {dialogElement}
    </div>
  );
}
