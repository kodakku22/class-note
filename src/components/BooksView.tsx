import { useCallback, useEffect, useState, useRef } from 'react';
import { BookEntry, BookMeta } from '../types';

const STATUS_ICON: Record<NonNullable<BookMeta['status']>, string> = {
  'want-to-read': '📖',
  reading: '📗',
  done: '✅',
};

// HANDOFF: book tiles use synthetic covers tinted with the chart palette.
// Each cover is a 135deg gradient between two chart colors, chosen by a
// stable hash of the title so the same book always renders the same cover
// across reloads. Real cover art is out of scope (no asset pipeline);
// these tinted blocks give every book a recognizable visual handle.
const COVER_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#3D73E8', '#b16cea'], // blue → purple
  ['#d97757', '#f0b429'], // terracotta → yellow
  ['#2fb490', '#3D73E8'], // teal → blue
  ['#b16cea', '#d946ef'], // purple → pink
  ['#f0b429', '#d97757'], // yellow → terracotta
  ['#5865f2', '#2fb490'], // blue → teal
  ['#d946ef', '#5865f2'], // pink → blue
] as const;

function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  const [c1, c2] = COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

function coverInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '?';
  // Use the first non-whitespace, non-symbol character. For Japanese,
  // this picks up kanji / hiragana / katakana naturally.
  const ch = trimmed.charAt(0);
  return /[A-Za-z]/.test(ch) ? ch.toUpperCase() : ch;
}

function StatusDropdown({
  book,
  onChange,
}: {
  book: BookEntry;
  onChange: (s: NonNullable<BookMeta['status']>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = book.meta.status ?? 'want-to-read';
  const palette = STATUS_COLOR[cur];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="status-dropdown" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        className="status-badge"
        style={{ background: palette.bg, color: palette.fg }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {STATUS_ICON[cur]} {STATUS_LABEL[cur]} ▾
      </button>
      {open && (
        <div className="status-menu" role="menu">
          {(['want-to-read', 'reading', 'done'] as const).map((s) => (
            <button
              key={s}
              className={`status-menu-item ${cur === s ? 'current' : ''}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (cur !== s) onChange(s);
              }}
            >
              {STATUS_ICON[s]} {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  vaultPath: string;
  onOpenBook: (filePath: string) => void;
  activeFilePath?: string;
};

type Filter = 'all' | 'reading' | 'want-to-read' | 'done';

const STATUS_LABEL: Record<NonNullable<BookMeta['status']>, string> = {
  'want-to-read': '読みたい',
  reading: '読書中',
  done: '読了',
};

const STATUS_COLOR: Record<NonNullable<BookMeta['status']>, { bg: string; fg: string }> = {
  'want-to-read': { bg: '#fef5d4', fg: '#9a7d0a' },
  reading: { bg: '#e3f2fd', fg: '#0d47a1' },
  done: { bg: '#e8f5e9', fg: '#1b5e20' },
};

export function BooksView({ vaultPath, onOpenBook, activeFilePath }: Props) {
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');

  const reload = useCallback(() => window.api.books.list(vaultPath).then(setBooks), [vaultPath]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = books.filter((b) => filter === 'all' || b.meta.status === filter);

  const counts = {
    all: books.length,
    reading: books.filter((b) => b.meta.status === 'reading').length,
    'want-to-read': books.filter((b) => b.meta.status === 'want-to-read').length,
    done: books.filter((b) => b.meta.status === 'done').length,
  };

  const submit = async () => {
    if (!newTitle.trim()) return;
    await window.api.books.create(vaultPath, newTitle.trim(), newAuthor.trim() || undefined);
    setNewTitle('');
    setNewAuthor('');
    setAdding(false);
    reload();
  };

  const setStatus = async (book: BookEntry, status: NonNullable<BookMeta['status']>) => {
    await window.api.books.updateMeta(book.filePath, { status });
    reload();
  };

  const setRating = async (book: BookEntry, value: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.api.books.updateMeta(book.filePath, {
      rating: book.meta.rating === value ? undefined : value,
    });
    reload();
  };

  const deleteBook = async (book: BookEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`「${book.meta.title}」を削除しますか？\nこの操作は取り消せません。`)) return;
    const r = await window.api.books.delete(book.filePath);
    if (!r.ok) {
      alert(`削除失敗: ${r.error ?? '不明なエラー'}`);
      return;
    }
    reload();
  };

  return (
    <div className="books-view">
      <div className="library-header">
        <h2>📚 読書リスト</h2>
        <div className="filter-tabs">
          {([
            ['all', `すべて (${counts.all})`],
            ['reading', `読書中 (${counts.reading})`],
            ['want-to-read', `読みたい (${counts['want-to-read']})`],
            ['done', `読了 (${counts.done})`],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f as Filter)}
            >
              {label}
            </button>
          ))}
          <button className="primary" onClick={() => setAdding(true)} style={{ marginLeft: 'auto' }}>
            ＋ 本を追加
          </button>
        </div>
      </div>

      <div className="book-grid">
        {filtered.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <div>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📖</div>
              {filter === 'all' ? 'まだ本がありません' : `「${filter}」の本はありません`}
            </div>
          </div>
        )}
        {filtered.map((book) => {
          const isActive = activeFilePath === book.filePath;
          const total = book.meta.totalPages;
          const cur = book.meta.currentPage ?? 0;
          const pct = total ? Math.min(100, Math.max(0, (cur / total) * 100)) : 0;
          return (
            <div
              key={book.filePath}
              className={`book-card${isActive ? ' active' : ''}`}
              onClick={() => onOpenBook(book.filePath)}
            >
              <div
                className="book-cover"
                style={{ background: coverGradient(book.meta.title) }}
                aria-hidden
              >
                {coverInitial(book.meta.title)}
              </div>
              <div className="book-card-header">
                <StatusDropdown book={book} onChange={(s) => setStatus(book, s)} />
                <button
                  className="book-delete-btn"
                  onClick={(e) => deleteBook(book, e)}
                  title="削除"
                  aria-label={`${book.meta.title}を削除`}
                >
                  🗑
                </button>
              </div>
              <div className="book-title">{book.meta.title}</div>
              {book.meta.author && (
                <div className="book-author">{book.meta.author}</div>
              )}
              <div className="book-rating">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className="star"
                    onClick={(e) => setRating(book, i, e)}
                    style={{ color: (book.meta.rating ?? 0) >= i ? '#f1c40f' : 'var(--text-tertiary)' }}
                  >
                    ★
                  </span>
                ))}
              </div>
              {book.bodyPreview && (
                <div className="book-preview">{book.bodyPreview}</div>
              )}
              <div className="book-meta">
                {book.meta.started && <span>📅 {book.meta.started}</span>}
                {book.meta.finished && <span>✓ {book.meta.finished}</span>}
              </div>
              {total ? (
                <div className="book-progress">
                  <div className="book-progress-track" aria-hidden>
                    <div className="book-progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="book-progress-label">
                    {cur} / {total} ページ ({Math.round(pct)}%)
                  </span>
                </div>
              ) : null}
              {book.meta.tags && book.meta.tags.length > 0 && (
                <div className="tag-row">
                  {book.meta.tags.map((t) => (
                    <span key={t} className="tag-chip">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="modal-overlay" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>📖 本を追加</h3>
            <div className="modal-section">
              <label>タイトル</label>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例: 君たちはどう生きるか"
                onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) submit(); }}
              />
            </div>
            <div className="modal-section">
              <label>著者 (任意)</label>
              <input
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                placeholder="例: 吉野源三郎"
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setAdding(false)}>キャンセル</button>
              <button className="primary" onClick={submit} disabled={!newTitle.trim()}>追加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
