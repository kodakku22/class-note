// Citation picker — Pandoc-style `[@bibkey]` inline citation insertion.
//
// Triggered globally via Ctrl+Shift+@. Shows a searchable list of papers
// in the vault that have a bibkey, returns the selected key as a string
// the caller can insert at the cursor position.
//
// Why a dedicated picker instead of CommandPalette: the command palette is
// already crowded with files, links, and tags. Citation insertion has a
// distinct mental model ("I'm in writing mode, I need a reference") and
// benefits from a focused UI that emphasizes year, authors, and title.
import { useEffect, useMemo, useRef, useState } from 'react';

type Item = {
  bibkey: string;
  title: string;
  authors: string;
  year: number | null;
};

type Props = {
  vaultPath: string;
  onClose: () => void;
  /** Called with the formatted citation string, e.g. "[@vaswani2017attention]". */
  onInsert: (citation: string) => void;
};

export function CitationPicker({ vaultPath, onClose, onInsert }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.papers.listForCitation(vaultPath).then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items
      .filter((i) => {
        const hay = `${i.bibkey} ${i.title} ${i.authors} ${i.year ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [items, query]);

  const commit = (item: Item) => {
    onInsert(`[@${item.bibkey}]`);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[activeIdx];
      if (it) commit(it);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal citation-picker"
        role="dialog"
        aria-modal="true"
        aria-label="引用挿入"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{ minWidth: 560, padding: 0 }}
      >
        <input
          ref={inputRef}
          className="citation-picker-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          placeholder="🔍 タイトル / 著者 / bibkey / 年で検索..."
          aria-label="引用検索"
        />

        <div className="citation-picker-results" role="listbox">
          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
              <div>bibkey 付きの論文がまだありません</div>
              <div className="help" style={{ fontSize: 11 }}>
                論文・文献ビュー (Ctrl+8) から取込・作成して bibkey を設定してください
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>該当なし</div>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.bibkey}
                role="option"
                aria-selected={i === activeIdx}
                className={`citation-picker-item ${i === activeIdx ? 'active' : ''}`}
                onClick={() => commit(it)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <div className="citation-picker-item-row1">
                  <span className="citation-picker-bibkey">@{it.bibkey}</span>
                  {it.year && <span className="citation-picker-year">{it.year}</span>}
                </div>
                <div className="citation-picker-title">{it.title}</div>
                {it.authors && (
                  <div className="citation-picker-authors">{it.authors}</div>
                )}
              </button>
            ))
          )}
        </div>

        <div className="citation-picker-footer">
          <span>↑↓ 選択 · Enter 挿入 · Esc 閉じる</span>
          {filtered.length > 0 && (
            <span>
              選択中: <code>[@{filtered[activeIdx]?.bibkey}]</code>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
