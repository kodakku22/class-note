import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  ClipboardEvent,
  DragEvent,
} from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { BacklinksPanel } from './BacklinksPanel';
import { BlockEditor } from './editor/BlockEditor';
import { RelationsPanel } from './relations/RelationsPanel';
import { parseFrontmatter, stringifyFrontmatter, type Frontmatter } from '../utils/frontmatter';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useDialog } from './common/Dialog';
import { basename } from '../utils/paths';
import { log } from '../utils/logger';

type Mode = 'preview' | 'edit';

type Props = {
  filePath: string;
  vaultPath: string;
  onJumpToWikilink: (name: string) => void;
  onJumpToFile: (filePath: string) => void;
  resolveWikilink?: (name: string) => string | null;
  onRename?: (oldPath: string, newName: string) => void;
};

export function NoteViewer({
  filePath,
  vaultPath,
  onJumpToWikilink,
  onJumpToFile,
  resolveWikilink,
  onRename,
}: Props) {
  // Full source = frontmatter + body, persisted as Markdown.
  // Wrapped in an undo/redo stack so Ctrl+Z works inside the note.
  const { current: source, set: setSource, undo, redo, reset: resetHistory } = useUndoRedo<string>('');
  const [mode, setMode] = useState<Mode>('preview');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [attachIndex, setAttachIndex] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState(false);
  const [showRelations, setShowRelations] = useState(true);
  const [exporting, setExporting] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const draftTimer = useRef<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // mtime cache for optimistic concurrency. Captured on initial load and
  // refreshed on each successful save. Sent back with every writeNote call.
  const knownMtime = useRef<number>(0);
  const [dlg, dialogElement] = useDialog();
  // The TipTap editor sees only the body (no frontmatter), so we split them.
  const { meta, body } = useMemo(() => parseFrontmatter(source), [source]);

  const noteName = basename(filePath).replace(/\.md$/, '');

  // localStorage key for crash-recovery drafts. Scoped per filePath so multiple
  // notes can have pending drafts without collision.
  const draftKey = `classnotes:draft:${filePath}`;

  useEffect(() => {
    let cancelled = false;
    window.api.vault.readNoteWithMtime(filePath).then(({ content, mtime }) => {
      if (cancelled) return;
      knownMtime.current = mtime;

      // Crash-recovery: if a draft exists for this path AND it differs from
      // what's on disk, prompt to restore.
      const draftRaw = localStorage.getItem(draftKey);
      if (draftRaw) {
        try {
          const draft = JSON.parse(draftRaw) as { content: string; savedAt: number };
          if (draft.content !== content) {
            dlg
              .confirm({
                title: '未保存の編集が見つかりました',
                message: `${new Date(draft.savedAt).toLocaleString()} の自動保存ドラフトを復元しますか？`,
                okLabel: '復元する',
                cancelLabel: '破棄する',
              })
              .then((restore) => {
                if (restore) {
                  resetHistory(draft.content);
                  setDirty(true);
                } else {
                  resetHistory(content);
                  setDirty(false);
                  localStorage.removeItem(draftKey);
                }
              });
            return;
          }
        } catch {
          // malformed draft, ignore
        }
        localStorage.removeItem(draftKey);
      }
      resetHistory(content);
      setDirty(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, resetHistory]);

  const refreshIndex = useCallback(() => {
    window.api.attachments.index(vaultPath, filePath).then(setAttachIndex);
  }, [vaultPath, filePath]);

  useEffect(() => {
    refreshIndex();
  }, [refreshIndex]);

  const persist = useCallback(
    async (text: string) => {
      setSaving(true);
      const r = await window.api.vault.writeNote(filePath, text, knownMtime.current);
      setSaving(false);
      if (r.ok) {
        if (typeof r.currentMtime === 'number') knownMtime.current = r.currentMtime;
        setDirty(false);
        setSavedAt(Date.now());
        // On successful save, the draft is no longer needed.
        localStorage.removeItem(draftKey);
      } else if (r.conflict) {
        // External edit detected. Let the user choose: reload (lose local) or
        // overwrite (lose external). A 3rd option (manual merge) opens the
        // current disk content alongside the local version.
        log.warn('writeNote conflict detected', { filePath });
        const choice = await dlg.confirm({
          title: '外部からの編集を検出しました',
          message:
            '別のアプリ (Obsidian など) がこのノートを変更しました。\n' +
            'OK で上書き保存（外部の編集を破棄）、キャンセルで再読込します。',
          okLabel: '上書きする',
          cancelLabel: '再読込する',
          destructive: true,
        });
        if (choice) {
          // Force-overwrite: clear the expected mtime.
          const force = await window.api.vault.writeNote(filePath, text);
          if (force.ok && typeof force.currentMtime === 'number') {
            knownMtime.current = force.currentMtime;
          }
          setDirty(false);
          setSavedAt(Date.now());
          localStorage.removeItem(draftKey);
        } else {
          // Reload from disk; discard local edits.
          if (typeof r.currentContent === 'string') {
            resetHistory(r.currentContent);
            knownMtime.current = r.currentMtime ?? knownMtime.current;
            setDirty(false);
            localStorage.removeItem(draftKey);
          }
        }
      } else {
        log.error('writeNote failed (no conflict, not ok)', { filePath });
      }
    },
    [filePath, draftKey, dlg, resetHistory]
  );

  const scheduleSave = (text: string) => {
    setSource(text);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(text), 800);

    // Also write a localStorage draft every 5 s so a renderer crash doesn't
    // lose work. Cleared on successful persist.
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ content: text, savedAt: Date.now() })
        );
      } catch {
        // localStorage full; best-effort
      }
    }, 5000);
  };

  // Persist whenever undo/redo moves the source pointer
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (dirty) persist(source);
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Ctrl+Z / Ctrl+Shift+Z (Cmd on macOS) for the note source
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        // Don't fight TipTap or the textarea — only intercept when target isn't editable
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        undo();
        setDirty(true);
      } else if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        redo();
        setDirty(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const exportPdf = async () => {
    if (mode !== 'preview') {
      alert('PDF エクスポートはプレビュー表示で実行してください');
      return;
    }
    setExporting(true);
    try {
      const r = await window.api.exporter.toPdf(filePath);
      if (!r.ok && r.error && r.error !== 'cancelled') {
        alert(`PDF エクスポート失敗: ${r.error}`);
      }
    } finally {
      setExporting(false);
    }
  };

  // Body changed via BlockEditor or raw textarea
  const onBodyChange = (newBody: string) => {
    const next = stringifyFrontmatter(meta, newBody);
    scheduleSave(next);
  };

  // Frontmatter changed via RelationsPanel
  const onMetaChange = (newMeta: Frontmatter) => {
    const next = stringifyFrontmatter(newMeta, body);
    scheduleSave(next);
  };

  // ---- Attachments / paste / drop --------------------------------------

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const ta = taRef.current;
      // If we're in BlockEditor mode, append to the body rather than no-oping.
      if (!ta) {
        const newBody = body + (body.endsWith('\n') ? '' : '\n') + snippet + '\n';
        onBodyChange(newBody);
        return;
      }
      const cur = source;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = cur.slice(0, start);
      const after = cur.slice(end);
      const needsLeading = before && !/\s$/.test(before) ? '\n' : '';
      const needsTrailing = after && !/^\s/.test(after) ? '\n' : '';
      const next = before + needsLeading + snippet + needsTrailing + after;
      const cursorAfter = (before + needsLeading + snippet + needsTrailing).length;
      scheduleSave(next);
      setTimeout(() => {
        if (taRef.current) {
          taRef.current.focus();
          taRef.current.setSelectionRange(cursorAfter, cursorAfter);
        }
      }, 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, body, meta]
  );

  const handlePick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const result = await window.api.attachments.pick(filePath);
      if (result.ok && result.added.length > 0) {
        const snippet = result.added.map((n) => `![[${n}]]`).join('\n');
        insertAtCursor(snippet);
        refreshIndex();
      }
    } finally {
      setPicking(false);
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItem = items.find((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;
    const ext =
      imgItem.type === 'image/jpeg'
        ? '.jpg'
        : imgItem.type === 'image/gif'
          ? '.gif'
          : imgItem.type === 'image/webp'
            ? '.webp'
            : '.png';
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
    const result = await window.api.attachments.saveImage(filePath, dataUrl, ext);
    if (result.ok && result.name) {
      insertAtCursor(`![[${result.name}]]`);
      refreshIndex();
    }
  };

  const handleDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = (f as File & { path?: string }).path;
      if (p) paths.push(p);
    }
    if (paths.length === 0) return;
    e.preventDefault();
    const result = await window.api.attachments.dropFiles(filePath, paths);
    if (result.ok && result.added.length > 0) {
      const snippet = result.added.map((n) => `![[${n}]]`).join('\n');
      insertAtCursor(snippet);
      refreshIndex();
    }
  };

  const [editorKind, setEditorKind] = useState<'block' | 'raw'>('block');

  return (
    <div className="note-viewer">
      <div className="note-tabs">
        <button
          className={`note-tab ${mode === 'preview' ? 'active' : ''}`}
          onClick={() => setMode('preview')}
        >
          👁️ プレビュー
        </button>
        <button
          className={`note-tab ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => setMode('edit')}
        >
          ✏️ 編集
        </button>
        {mode === 'edit' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              className={`note-tab ${editorKind === 'block' ? 'active' : ''}`}
              onClick={() => setEditorKind('block')}
              title="Block Editor (Anytype 風)"
            >
              ⚿ Block
            </button>
            <button
              className={`note-tab ${editorKind === 'raw' ? 'active' : ''}`}
              onClick={() => setEditorKind('raw')}
              title="生 Markdown"
            >
              MD
            </button>
          </div>
        )}
        <button
          className="note-tab"
          onClick={() => setShowRelations((s) => !s)}
          style={{ marginLeft: mode === 'edit' ? 0 : 'auto' }}
          title="Properties パネル"
        >
          {showRelations ? '◧' : '◨'} Properties
        </button>
      </div>

      <div className="note-content note-with-relations">
        <div className="note-main">
          {mode === 'preview' ? (
            <>
              <div className="note-title-bar">
                <span className="note-title-name">{noteName}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="subtle"
                    title="PDF にエクスポート"
                    onClick={exportPdf}
                    disabled={exporting}
                  >
                    {exporting ? '⏳' : '🖨️ PDF'}
                  </button>
                  {onRename && (
                    <button
                      className="subtle"
                      title="ノートをリネーム (リンクも自動更新)"
                      onClick={() => {
                        const v = prompt('新しい名前 (.md なし)', noteName);
                        if (v && v.trim() && v.trim() !== noteName) onRename(filePath, v.trim());
                      }}
                    >
                      ✏️ リネーム
                    </button>
                  )}
                </div>
              </div>
              <div className="markdown">
                <MarkdownRenderer
                  content={body}
                  attachIndex={attachIndex}
                  onJumpToWikilink={onJumpToWikilink}
                  onJumpToFile={onJumpToFile}
                  resolveWikilink={resolveWikilink}
                />
              </div>
              <BacklinksPanel
                vaultPath={vaultPath}
                noteName={noteName}
                onJumpToFile={onJumpToFile}
              />
            </>
          ) : (
            <div className="note-editor">
              <div className="note-toolbar">
                <button
                  className="toolbar-btn"
                  onClick={handlePick}
                  disabled={picking}
                  title="画像 / PDF を選んで挿入"
                >
                  📎 画像/PDFを挿入
                </button>
                <span className="toolbar-hint">
                  {editorKind === 'block'
                    ? '/ でブロック挿入 · 画像はペースト/ドロップで'
                    : 'クリップボードからペースト / ドラッグ&ドロップでも挿入できます'}
                </span>
              </div>
              {editorKind === 'block' ? (
                <BlockEditor content={body} onChange={onBodyChange} />
              ) : (
                <textarea
                  ref={taRef}
                  value={source}
                  onChange={(e) => scheduleSave(e.target.value)}
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  spellCheck={false}
                />
              )}
            </div>
          )}
        </div>

        {showRelations && (
          <div className="note-relations">
            <RelationsPanel meta={meta} onChange={onMetaChange} />
          </div>
        )}
      </div>

      <div className="note-save-bar">
        {saving
          ? '保存中...'
          : dirty
            ? '未保存'
            : savedAt
              ? `保存しました (${new Date(savedAt).toLocaleTimeString()})`
              : '[[名前]] でリンク · ![[ファイル]] で画像/PDF埋め込み · #タグ で分類 · $...$ で数式 · ```mermaid で図'}
      </div>
      {dialogElement}
    </div>
  );
}
