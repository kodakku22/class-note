// Papers (論文・文献) management view.
//
// Layout: header + filter bar + sortable table-like list.
// Each row shows: title, authors (first author + et al), year, venue, status, tags.
// Right-click → context menu (Open, Reveal, Copy bibkey, Delete).
// Click → opens the paper in the main viewer.
//
// The view is intentionally information-dense for researchers managing
// hundreds of papers. Sort + filter are client-side because the list is
// already cheap (frontmatter only, no body parsing needed).
import { useEffect, useMemo, useState } from 'react';
import type { PaperEntry, PaperStatus } from '../../types';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';
import { useDialog } from '../common/Dialog';
import { PaperFilterBar, type PaperFilters } from './PaperFilterBar';
import { PaperImportDialog } from './PaperImportDialog';
import { log } from '../../utils/logger';

type SortKey = 'mtime' | 'year' | 'title' | 'status' | 'authors';
type LatexStyle = 'neurips' | 'acl' | 'ieee' | 'generic';

type Props = {
  vaultPath: string;
  activeFilePath?: string;
  reloadKey?: number;
  onOpenFile: (filePath: string) => void;
  onChanged?: () => void;
};

const STATUS_LABELS: Record<PaperStatus, { label: string; color: string }> = {
  'to-read': { label: 'to-read', color: '#888' },
  reading: { label: 'reading', color: '#4a9eff' },
  read: { label: 'read', color: '#4caf50' },
  cited: { label: 'cited', color: '#7b5cff' },
  skimmed: { label: 'skimmed', color: '#ff9800' },
};
const LATEX_STYLES: LatexStyle[] = ['generic', 'neurips', 'acl', 'ieee'];

function firstAuthor(authors: string[] | string | undefined): string {
  if (!authors) return '—';
  if (Array.isArray(authors)) {
    if (authors.length === 0) return '—';
    return authors.length > 1 ? `${authors[0]} et al.` : authors[0];
  }
  return String(authors).split(/[,;]/)[0].trim() || '—';
}

export function PapersView({ vaultPath, activeFilePath, reloadKey, onOpenFile, onChanged }: Props) {
  const [items, setItems] = useState<PaperEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PaperFilters>({
    query: '',
    status: 'all',
    tag: 'all',
    yearFrom: null,
    yearTo: null,
  });
  const [sortKey, setSortKey] = useState<SortKey>('mtime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dlg, dialogElement] = useDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importingBibtex, setImportingBibtex] = useState(false);

  const reload = () => {
    setLoading(true);
    window.api.papers
      .list(vaultPath)
      .then((list) => setItems(list))
      .catch((err) => log.error('papers.list failed', { error: String(err) }))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [vaultPath, reloadKey]);

  // Aggregate the unique tags across all papers — used by the filter bar.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) {
      const tags = Array.isArray(p.meta.tags)
        ? p.meta.tags
        : typeof p.meta.tags === 'string'
          ? [p.meta.tags]
          : [];
      for (const t of tags) if (typeof t === 'string') set.add(t);
    }
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return items.filter((p) => {
      if (q) {
        const haystack = [
          p.meta.title ?? p.fileName,
          firstAuthor(p.meta.authors),
          p.meta.venue ?? '',
          p.meta.bibkey ?? '',
          p.bodyPreview,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.status !== 'all' && p.meta.status !== filters.status) return false;
      if (filters.tag !== 'all') {
        const tags = Array.isArray(p.meta.tags)
          ? p.meta.tags
          : typeof p.meta.tags === 'string'
            ? [p.meta.tags]
            : [];
        if (!tags.includes(filters.tag)) return false;
      }
      if (filters.yearFrom !== null && (p.meta.year ?? 0) < filters.yearFrom) return false;
      if (filters.yearTo !== null && (p.meta.year ?? 9999) > filters.yearTo) return false;
      return true;
    });
  }, [items, filters]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'mtime':
          return (a.mtime - b.mtime) * dir;
        case 'year':
          return ((a.meta.year ?? 0) - (b.meta.year ?? 0)) * dir;
        case 'title':
          return (a.meta.title ?? a.fileName).localeCompare(b.meta.title ?? b.fileName) * dir;
        case 'status':
          return (a.meta.status ?? '').localeCompare(b.meta.status ?? '') * dir;
        case 'authors':
          return firstAuthor(a.meta.authors).localeCompare(firstAuthor(b.meta.authors)) * dir;
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'title' || k === 'authors' ? 'asc' : 'desc');
    }
  };

  const headerCell = (k: SortKey, label: string) => (
    <button
      className={`papers-th ${sortKey === k ? 'sorted' : ''}`}
      onClick={() => toggleSort(k)}
      aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {sortKey === k && <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
    </button>
  );

  const buildMenu = (p: PaperEntry, e: React.MouseEvent): ContextMenuItem[] => {
    e.preventDefault();
    return [
      {
        id: 'open',
        emoji: '📂',
        label: '開く',
        onSelect: () => {
          setMenu(null);
          onOpenFile(p.filePath);
        },
      },
      {
        id: 'reveal',
        emoji: '📁',
        label: 'フォルダで表示',
        onSelect: () => {
          setMenu(null);
          window.api.materials.revealInFolder(p.filePath);
        },
      },
      {
        id: 'copyBibkey',
        emoji: '📋',
        label: p.meta.bibkey ? `引用キーをコピー (@${p.meta.bibkey})` : 'パスをコピー',
        onSelect: () => {
          setMenu(null);
          const text = p.meta.bibkey ? `[@${p.meta.bibkey}]` : p.filePath;
          navigator.clipboard.writeText(text).catch(() => {});
        },
      },
      {
        id: 'summarize',
        emoji: '🤖',
        label: 'AI で要約',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.ai.summarizeAndApply(p.filePath);
          if (r.ok) {
            await dlg.alert({
              title: '要約完了',
              message: r.result.oneLiner,
              variant: 'success',
            });
            reload();
            onChanged?.();
          } else {
            await dlg.alert({
              title: '要約に失敗しました',
              message: r.error,
              variant: 'error',
            });
          }
        },
      },
      {
        id: 'learningCoach',
        emoji: '🧠',
        label: '論文向けAI理解支援',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.ai.learningCoachAndSave(p.filePath, 'paper');
          if (r.ok) {
            await dlg.alert({
              title: 'AI理解支援を保存しました',
              message: r.result.diagnosis,
              variant: 'success',
            });
            reload();
            onChanged?.();
          } else {
            await dlg.alert({
              title: 'AI理解支援に失敗しました',
              message: r.error,
              variant: 'error',
            });
          }
        },
      },
      {
        id: 'latex',
        emoji: '📄',
        label: 'LaTeX で書出',
        onSelect: async () => {
          setMenu(null);
          const chosen = await dlg.prompt({
            title: 'LaTeX スタイル',
            message: 'generic / neurips / acl / ieee から選んでください',
            defaultValue: 'generic',
            okLabel: '書出',
          });
          if (!chosen) return;
          const style = chosen.trim().toLowerCase() as LatexStyle;
          if (!LATEX_STYLES.includes(style)) {
            await dlg.alert({
              title: 'スタイルが不正です',
              message: 'generic / neurips / acl / ieee のいずれかを入力してください。',
              variant: 'error',
            });
            return;
          }
          const r = await window.api.latex.exportNote(vaultPath, p.filePath, style);
          if (r.ok) {
            await dlg.alert({
              title: 'LaTeX 書出完了',
              message: `${r.texPath}\n${r.usedPandoc ? 'Pandoc を使用しました。' : '簡易変換で書き出しました。'}`,
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
      },
      {
        id: 'autoTag',
        emoji: '🏷',
        label: 'AI でタグ付け',
        onSelect: async () => {
          setMenu(null);
          const r = await window.api.ai.autoTag(p.filePath);
          if (!r.ok) {
            await dlg.alert({ title: 'タグ提案失敗', message: r.error, variant: 'error' });
            return;
          }
          const accept = await dlg.confirm({
            title: 'タグを適用しますか？',
            message: `提案: ${r.result.tags.join(', ')}\n\n${r.result.reasoning}`,
            okLabel: '適用',
          });
          if (accept) {
            await window.api.ai.applyTags(p.filePath, r.result.tags);
            reload();
          }
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
            title: '削除しますか？',
            message: `${p.meta.title ?? p.fileName} と読書ノートをゴミ箱に移動します。`,
            okLabel: '削除',
            destructive: true,
          });
          if (!ok) return;
          const r = await window.api.papers.delete(p.filePath);
          if (r.ok) reload();
          else await dlg.alert({ title: '削除失敗', message: r.error ?? '', variant: 'error' });
        },
      },
    ];
  };

  const importBibtex = async () => {
    const grant = await window.api.papers.pickBibtexFile();
    if (!grant) return;
    setImportingBibtex(true);
    const r = await window.api.papers.importFromBibtex(vaultPath, grant.token);
    setImportingBibtex(false);
    if (r.ok) {
      reload();
      onChanged?.();
      await dlg.alert({
        title: 'BibTeX を取り込みました',
        message: `${r.imported} 件を追加、${r.skipped} 件をスキップしました。${
          r.errors.length ? `\n\n注意:\n${r.errors.slice(0, 5).join('\n')}` : ''
        }`,
        variant: 'success',
      });
      if (r.filePaths[0]) onOpenFile(r.filePaths[0]);
    } else {
      await dlg.alert({
        title: 'BibTeX 取込失敗',
        message: r.errors.join('\n') || '不明なエラー',
        variant: 'error',
      });
    }
  };

  return (
    <div className="papers-view main-area">
      <div className="papers-header">
        <div>
          <h2 style={{ margin: 0 }}>📑 論文・文献</h2>
          <span className="papers-subtitle">
            {sorted.length}/{items.length} 件 · 著者・年・タグ・ステータスでフィルタ可能
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowImport(true)} title="arXiv / DOI から取込">
          📥 取込
        </button>
        <button
          onClick={importBibtex}
          disabled={importingBibtex}
          title="Zotero / Better BibTeX から出力した .bib を取り込む"
        >
          {importingBibtex ? '⏳ 取込中…' : '📥 BibTeX取込'}
        </button>
        <button
          onClick={async () => {
            setExporting(true);
            const r = await window.api.papers.exportBibtex(vaultPath);
            setExporting(false);
            if (r.ok) {
              await dlg.alert({
                title: 'BibTeX を書出しました',
                message: `${r.count} 件のエントリを ${r.filePath} に保存。\n${
                  r.skipped ? `(${r.skipped} 件は bibkey 不在のためスキップ)` : ''
                }`,
                variant: 'success',
              });
            } else {
              await dlg.alert({
                title: 'BibTeX 書出失敗',
                message: r.error ?? '不明なエラー',
                variant: 'error',
              });
            }
          }}
          disabled={exporting}
          title="frontmatter を集約して refs.bib を生成"
        >
          {exporting ? '⏳ 書出中…' : '📚 BibTeX 書出'}
        </button>
        <button className="primary" onClick={() => setShowCreate(true)}>
          + 論文を追加
        </button>
      </div>

      <PaperFilterBar
        filters={filters}
        onChange={setFilters}
        availableTags={allTags}
      />

      {loading ? (
        <div className="empty-state">読み込み中…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📑</div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>
              {items.length === 0
                ? 'まだ論文がありません'
                : '条件に合う論文がありません'}
            </div>
            {items.length === 0 && (
              <button className="primary" onClick={() => setShowCreate(true)}>
                最初の論文を追加
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="papers-list" role="grid">
          <div className="papers-row papers-header-row" role="row">
            {headerCell('title', 'タイトル')}
            {headerCell('authors', '著者')}
            {headerCell('year', '年')}
            <div className="papers-th">学会/誌</div>
            {headerCell('status', 'ステータス')}
            <div className="papers-th">タグ</div>
          </div>
          {sorted.map((p) => {
            const status = p.meta.status ?? 'to-read';
            const statusInfo = STATUS_LABELS[status as PaperStatus] ?? STATUS_LABELS['to-read'];
            const tags = Array.isArray(p.meta.tags) ? p.meta.tags : [];
            const isActive = activeFilePath === p.filePath;
            return (
              <div
                key={p.filePath}
                className={`papers-row ${isActive ? 'active' : ''}`}
                role="row"
                onClick={() => onOpenFile(p.filePath)}
                onContextMenu={(e) =>
                  setMenu({ x: e.clientX, y: e.clientY, items: buildMenu(p, e) })
                }
              >
                <div className="papers-cell papers-title">
                  {p.meta.title ?? p.fileName}
                  {p.meta.summary && (
                    <div className="papers-summary">{p.meta.summary}</div>
                  )}
                </div>
                <div className="papers-cell">{firstAuthor(p.meta.authors)}</div>
                <div className="papers-cell">{p.meta.year ?? '—'}</div>
                <div className="papers-cell">{p.meta.venue ?? '—'}</div>
                <div className="papers-cell">
                  <span
                    className="papers-status-dot"
                    style={{ background: statusInfo.color }}
                    aria-hidden
                  />
                  <span className="papers-status-label">{statusInfo.label}</span>
                </div>
                <div className="papers-cell papers-tags">
                  {tags.slice(0, 3).map((t) => (
                    <span key={t} className="papers-tag">
                      {t}
                    </span>
                  ))}
                  {tags.length > 3 && <span className="papers-tag">+{tags.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreatePaperDialog
          vaultPath={vaultPath}
          onClose={() => setShowCreate(false)}
          onCreated={(filePath) => {
            setShowCreate(false);
            reload();
            onOpenFile(filePath);
          }}
        />
      )}

      {showImport && (
        <PaperImportDialog
          vaultPath={vaultPath}
          onClose={() => setShowImport(false)}
          onImported={(filePath) => {
            setShowImport(false);
            reload();
            onOpenFile(filePath);
          }}
        />
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

// --------------------------------------------------------------------------
// Inline create dialog. Kept inside the view file because it's intimately
// coupled to the create payload shape.
// --------------------------------------------------------------------------
function CreatePaperDialog({
  vaultPath,
  onClose,
  onCreated,
}: {
  vaultPath: string;
  onClose: () => void;
  onCreated: (filePath: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [venue, setVenue] = useState('');
  const [doi, setDoi] = useState('');
  const [arxiv, setArxiv] = useState('');
  const [bibkey, setBibkey] = useState('');
  const [status, setStatus] = useState<PaperStatus>('to-read');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!title.trim()) {
      setErr('タイトルは必須です');
      return;
    }
    setBusy(true);
    const yearNum = year.trim() ? Number(year) : undefined;
    const r = await window.api.papers.create(vaultPath, {
      title: title.trim(),
      authors: authors
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter(Boolean),
      year: yearNum && Number.isFinite(yearNum) ? yearNum : undefined,
      venue: venue.trim() || undefined,
      doi: doi.trim() || undefined,
      arxiv: arxiv.trim() || undefined,
      bibkey: bibkey.trim() || undefined,
      status,
    });
    setBusy(false);
    if (r.ok && r.filePath) onCreated(r.filePath);
    else setErr(r.error ?? '作成に失敗しました');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>📑 論文を追加</h3>
        <div className="modal-section">
          <label>タイトル *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="modal-section">
          <label>著者 (カンマ区切り)</label>
          <input
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Vaswani, Shazeer, Parmar, ..."
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-section" style={{ flex: 1 }}>
            <label>年</label>
            <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2017" />
          </div>
          <div className="modal-section" style={{ flex: 2 }}>
            <label>学会 / 誌</label>
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="NeurIPS / Nature / arXiv"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="modal-section" style={{ flex: 1 }}>
            <label>DOI</label>
            <input value={doi} onChange={(e) => setDoi(e.target.value)} />
          </div>
          <div className="modal-section" style={{ flex: 1 }}>
            <label>arXiv ID</label>
            <input value={arxiv} onChange={(e) => setArxiv(e.target.value)} placeholder="1706.03762" />
          </div>
        </div>
        <div className="modal-section">
          <label>引用キー (bibkey)</label>
          <input
            value={bibkey}
            onChange={(e) => setBibkey(e.target.value)}
            placeholder="vaswani2017attention"
          />
        </div>
        <div className="modal-section">
          <label>ステータス</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as PaperStatus)}>
            {(Object.keys(STATUS_LABELS) as PaperStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s].label}
              </option>
            ))}
          </select>
        </div>
        {err && <div className="help" style={{ color: 'var(--danger)' }}>⚠️ {err}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? '作成中…' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
