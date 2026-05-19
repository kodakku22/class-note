// DatabaseView — Obsidian Skill #3 (Bases) equivalent.
//
// Treats a folder of Markdown files as a database. Each note's frontmatter
// supplies the column values. Users can:
//  - Pick which folder to view
//  - Choose which frontmatter fields to show as columns
//  - Filter by status / tag / type / arbitrary frontmatter field
//  - Sort by any column
//  - Click to open, right-click for actions
//
// This generalizes PapersView's UX to any folder. PapersView is essentially
// a specialization of this with hard-coded columns; DatabaseView is the
// generic version that works on any subject's notes/, Books/, Papers/, Web/, …
import { useEffect, useMemo, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from './common/ContextMenu';
import { useDialog } from './common/Dialog';
import { log } from '../utils/logger';

type Row = {
  filePath: string;
  fileName: string;
  meta: Record<string, unknown>;
  preview: string;
  mtime: number;
};

type Props = {
  vaultPath: string;
  /** Subject name to scope to. If omitted, uses the entire Vault root. */
  subject?: string | null;
  /** Optional override: which subdirectory under the subject to scan. */
  subdir?: string;
  /** Comma list of frontmatter keys to show as columns. */
  columns?: string[];
  reloadKey?: number;
  onOpenFile: (filePath: string) => void;
};

const DEFAULT_COLUMNS = ['type', 'status', 'tags', 'rating'];

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DatabaseView({
  vaultPath,
  subject,
  subdir,
  columns: initialColumns,
  reloadKey,
  onOpenFile,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<string[]>(initialColumns ?? DEFAULT_COLUMNS);
  const [filterField, setFilterField] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');
  const [sortKey, setSortKey] = useState<string>('mtime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dlg, dialogElement] = useDialog();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (!subject) {
          // Vault-wide scan: list all subjects and aggregate their notes/.
          const subjects = await window.api.vault.listSubjects(vaultPath);
          const all: Row[] = [];
          for (const s of subjects) {
            const enriched = await window.api.vault.listFilesEnriched(vaultPath, s);
            for (const n of enriched.notes) {
              all.push({
                filePath: n.path,
                fileName: n.name,
                meta: (n.meta ?? {}) as Record<string, unknown>,
                preview: n.preview ?? '',
                mtime: n.mtime,
              });
            }
          }
          if (!cancelled) setRows(all);
        } else {
          const enriched = await window.api.vault.listFilesEnriched(vaultPath, subject);
          if (cancelled) return;
          const list = subdir === 'materials' ? enriched.materials : enriched.notes;
          setRows(
            list.map((n) => ({
              filePath: n.path,
              fileName: n.name,
              meta: (n.meta ?? {}) as Record<string, unknown>,
              preview: n.preview ?? '',
              mtime: n.mtime,
            }))
          );
        }
      } catch (err) {
        log.error('DatabaseView load failed', { error: String(err) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPath, subject, subdir, reloadKey]);

  // Auto-discover columns: union of all frontmatter keys, capped at 8.
  // This is what Obsidian Bases does by default — the user can refine.
  const discoveredColumns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.meta)) set.add(k);
    }
    return [...set].slice(0, 12);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!filterField || !filterValue) return rows;
    const fv = filterValue.toLowerCase();
    return rows.filter((r) => {
      const cell = formatCell(r.meta[filterField]);
      return cell.toLowerCase().includes(fv);
    });
  }, [rows, filterField, filterValue]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'mtime') return (a.mtime - b.mtime) * dir;
      if (sortKey === 'fileName') return a.fileName.localeCompare(b.fileName) * dir;
      return formatCell(a.meta[sortKey]).localeCompare(formatCell(b.meta[sortKey])) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const buildMenu = (r: Row, e: React.MouseEvent): ContextMenuItem[] => {
    e.preventDefault();
    return [
      {
        id: 'open',
        emoji: '📂',
        label: '開く',
        onSelect: () => {
          setMenu(null);
          onOpenFile(r.filePath);
        },
      },
      {
        id: 'reveal',
        emoji: '📁',
        label: 'フォルダで表示',
        onSelect: () => {
          setMenu(null);
          window.api.materials.revealInFolder(r.filePath);
        },
      },
      {
        id: 'summarize',
        emoji: '🤖',
        label: 'AI で要約',
        onSelect: async () => {
          setMenu(null);
          const result = await window.api.ai.summarizeAndApply(r.filePath);
          if (result.ok) {
            await dlg.alert({
              title: '要約完了',
              message: result.result.oneLiner,
              variant: 'success',
            });
          } else {
            await dlg.alert({
              title: '要約失敗',
              message: result.error,
              variant: 'error',
            });
          }
        },
      },
    ];
  };

  return (
    <div className="database-view">
      <div className="database-toolbar">
        <strong>📊 Database</strong>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          {sorted.length}/{rows.length} 件
        </span>
        <span style={{ flex: 1 }} />
        <select
          value={filterField}
          onChange={(e) => setFilterField(e.target.value)}
          aria-label="フィルタフィールド"
        >
          <option value="">フィルタ無し</option>
          {discoveredColumns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {filterField && (
          <input
            type="search"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={`${filterField} で絞り込み`}
            aria-label="フィルタ値"
          />
        )}
        <details className="database-columns" style={{ position: 'relative' }}>
          <summary>列を選択</summary>
          <div className="database-columns-popover">
            {discoveredColumns.map((c) => (
              <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={columns.includes(c)}
                  onChange={(e) => {
                    if (e.target.checked) setColumns([...columns, c]);
                    else setColumns(columns.filter((x) => x !== c));
                  }}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </details>
      </div>

      {loading ? (
        <div className="empty-state">読み込み中…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">該当ノートがありません</div>
      ) : (
        <div className="database-grid" role="grid">
          <div className="database-row database-header" role="row">
            <button className="database-cell" onClick={() => toggleSort('fileName')}>
              名前 {sortKey === 'fileName' && (sortDir === 'asc' ? '▲' : '▼')}
            </button>
            {columns.map((c) => (
              <button
                key={c}
                className="database-cell"
                onClick={() => toggleSort(c)}
                aria-sort={sortKey === c ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {c} {sortKey === c && (sortDir === 'asc' ? '▲' : '▼')}
              </button>
            ))}
            <button className="database-cell" onClick={() => toggleSort('mtime')}>
              更新 {sortKey === 'mtime' && (sortDir === 'asc' ? '▲' : '▼')}
            </button>
          </div>
          {sorted.map((r) => (
            <div
              key={r.filePath}
              className="database-row"
              role="row"
              onClick={() => onOpenFile(r.filePath)}
              onContextMenu={(e) =>
                setMenu({ x: e.clientX, y: e.clientY, items: buildMenu(r, e) })
              }
            >
              <div className="database-cell">{r.fileName.replace(/\.md$/, '')}</div>
              {columns.map((c) => (
                <div key={c} className="database-cell">
                  {formatCell(r.meta[c])}
                </div>
              ))}
              <div className="database-cell">
                {new Date(r.mtime).toLocaleDateString('ja-JP')}
              </div>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      {dialogElement}
    </div>
  );
}
