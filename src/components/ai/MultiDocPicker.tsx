// MultiDocPicker — modal picker for adding extra documents to the DocAI
// multi-doc Q&A / multi-doc analysis flow.
//
// Lists all .md / .pdf files in the active vault, sortable by recency, with
// a free-text filter and kind filter. Selected files are returned via
// onConfirm as a list of absolute paths.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../../utils/focusTrap';

export type PickerFile = {
  relPath: string;
  absPath: string;
  title: string;
  kind: 'note' | 'pdf';
  mtimeMs: number;
  tags: string[];
};

type Props = {
  vaultPath: string;
  /** Already-selected paths (absolute) — shown pre-checked. */
  initialSelected: string[];
  /** Limit on how many files the user can select. Defaults to 5. */
  maxSelectable?: number;
  /** Optional path to keep selected even if user uncheck-all (i.e. the
   *  document the DocAI panel was originally opened on). */
  primaryFilePath?: string;
  onCancel: () => void;
  onConfirm: (absPaths: string[]) => void;
};

export function MultiDocPicker({
  vaultPath,
  initialSelected,
  maxSelectable = 5,
  primaryFilePath,
  onCancel,
  onConfirm,
}: Props) {
  const [files, setFiles] = useState<PickerFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexNotReady, setIndexNotReady] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'note' | 'pdf'>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [reloadKey, setReloadKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onCancel });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.api.docai
      .listVaultFiles(vaultPath)
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.files) {
          setFiles(r.files);
          setIndexNotReady(Boolean(r.indexNotReady));
        } else {
          setError(r.error ?? 'ファイル一覧の取得に失敗しました');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, reloadKey]);

  const rebuildIndex = async () => {
    setRebuilding(true);
    try {
      await window.api.index.rebuild(vaultPath);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setRebuilding(false);
    }
  };

  // Focus search on mount.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo<PickerFile[]>(() => {
    if (!files) return [];
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (kindFilter !== 'all' && f.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.relPath.toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [files, query, kindFilter]);

  const toggle = (absPath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(absPath)) {
        // Don't allow deselecting the primary file.
        if (absPath === primaryFilePath) return next;
        next.delete(absPath);
      } else {
        if (next.size >= maxSelectable) return next;
        next.add(absPath);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) {
      onCancel();
      return;
    }
    onConfirm(Array.from(selected));
  };

  return (
    <div
      className="docai-picker-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="複数文書を選択"
    >
      <div
        ref={dialogRef}
        className="docai-picker"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <header className="docai-picker-header">
          <span className="docai-picker-title">📎 複数文書を選択</span>
          <button
            type="button"
            className="docai-picker-close"
            onClick={onCancel}
            aria-label="閉じる"
          >
            ✕
          </button>
        </header>

        <div className="docai-picker-controls">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトル・パス・タグで検索…"
            className="docai-picker-search"
            aria-label="ファイル検索"
          />
          <div
            className="docai-picker-kind-filter"
            role="radiogroup"
            aria-label="ファイル種別"
          >
            {(['all', 'note', 'pdf'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kindFilter === k}
                className={`docai-picker-kind${kindFilter === k ? ' active' : ''}`}
                onClick={() => setKindFilter(k)}
              >
                {k === 'all' ? 'すべて' : k === 'note' ? '📝 ノート' : '📕 PDF'}
              </button>
            ))}
          </div>
        </div>

        {(indexNotReady || (files !== null && files.length === 0)) && !loading && !error && (
          <div className="docai-picker-rebuild-banner" role="status">
            <span>📂 Vault インデックスが空です。再構築すると一覧が表示されます。</span>
            <button
              type="button"
              className="docai-picker-rebuild-btn"
              onClick={rebuildIndex}
              disabled={rebuilding}
            >
              {rebuilding ? '再構築中…' : '🔄 Vault を再構築'}
            </button>
          </div>
        )}

        <div className="docai-picker-list" role="listbox" aria-label="ファイル一覧">
          {loading && <div className="docai-picker-empty">読み込み中…</div>}
          {error && (
            <div className="docai-picker-error" role="alert">
              ⚠️ {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="docai-picker-empty">該当するファイルがありません</div>
          )}
          {!loading &&
            !error &&
            filtered.map((f) => {
              const isSelected = selected.has(f.absPath);
              const isPrimary = f.absPath === primaryFilePath;
              const isAtCap = !isSelected && selected.size >= maxSelectable;
              return (
                <button
                  key={f.absPath}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`docai-picker-row${isSelected ? ' selected' : ''}${isAtCap ? ' disabled' : ''}`}
                  onClick={() => toggle(f.absPath)}
                  disabled={isAtCap}
                  data-testid="docai-picker-row"
                >
                  <span className="docai-picker-row-check" aria-hidden>
                    {isSelected ? '☑' : '☐'}
                  </span>
                  <span className="docai-picker-row-icon" aria-hidden>
                    {f.kind === 'pdf' ? '📕' : '📝'}
                  </span>
                  <span className="docai-picker-row-meta">
                    <span className="docai-picker-row-title">
                      {f.title || f.relPath}
                      {isPrimary ? <span className="docai-picker-row-primary"> (現在のファイル)</span> : null}
                    </span>
                    <span className="docai-picker-row-rel">{f.relPath}</span>
                  </span>
                </button>
              );
            })}
        </div>

        <footer className="docai-picker-footer">
          <span className="docai-picker-count" aria-live="polite">
            {selected.size} / {maxSelectable} 選択中
          </span>
          <span className="docai-picker-spacer" />
          <button type="button" className="docai-picker-cancel" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="docai-picker-confirm"
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            決定
          </button>
        </footer>
      </div>
    </div>
  );
}
