// Filter bar for the Papers list. State is fully controlled (lives in
// PapersView) so the user's filter choices persist across navigations
// when we eventually add URL state — for now it resets on remount.
import type { PaperStatus } from '../../types';

export type PaperFilters = {
  query: string;
  /** 'all' | one of PaperStatus */
  status: 'all' | PaperStatus;
  /** 'all' | a specific tag */
  tag: 'all' | string;
  yearFrom: number | null;
  yearTo: number | null;
};

const STATUS_OPTIONS: Array<{ id: 'all' | PaperStatus; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'to-read', label: 'to-read' },
  { id: 'reading', label: 'reading' },
  { id: 'read', label: 'read' },
  { id: 'cited', label: 'cited' },
  { id: 'skimmed', label: 'skimmed' },
];

type Props = {
  filters: PaperFilters;
  onChange: (next: PaperFilters) => void;
  availableTags: string[];
};

export function PaperFilterBar({ filters, onChange, availableTags }: Props) {
  const update = (patch: Partial<PaperFilters>) => onChange({ ...filters, ...patch });
  const numberOrNull = (v: string): number | null => {
    const n = Number(v);
    return v.trim() === '' || !Number.isFinite(n) ? null : n;
  };
  return (
    <div className="papers-filter-bar" role="search">
      <input
        type="search"
        className="papers-filter-search"
        value={filters.query}
        onChange={(e) => update({ query: e.target.value })}
        placeholder="🔍 タイトル / 著者 / venue / bibkey で検索"
        aria-label="論文を検索"
      />
      <select
        value={filters.status}
        onChange={(e) =>
          update({ status: e.target.value as PaperFilters['status'] })
        }
        aria-label="ステータスでフィルタ"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            ステータス: {s.label}
          </option>
        ))}
      </select>
      <select
        value={filters.tag}
        onChange={(e) => update({ tag: e.target.value })}
        aria-label="タグでフィルタ"
        disabled={availableTags.length === 0}
      >
        <option value="all">タグ: すべて</option>
        {availableTags.map((t) => (
          <option key={t} value={t}>
            #{t}
          </option>
        ))}
      </select>
      <div className="papers-year-range" role="group" aria-label="年範囲">
        <input
          type="number"
          inputMode="numeric"
          placeholder="年から"
          value={filters.yearFrom ?? ''}
          onChange={(e) => update({ yearFrom: numberOrNull(e.target.value) })}
          aria-label="開始年"
          style={{ width: 80 }}
        />
        <span>〜</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="年まで"
          value={filters.yearTo ?? ''}
          onChange={(e) => update({ yearTo: numberOrNull(e.target.value) })}
          aria-label="終了年"
          style={{ width: 80 }}
        />
      </div>
      {(filters.query ||
        filters.status !== 'all' ||
        filters.tag !== 'all' ||
        filters.yearFrom !== null ||
        filters.yearTo !== null) && (
        <button
          className="papers-filter-reset"
          onClick={() =>
            onChange({
              query: '',
              status: 'all',
              tag: 'all',
              yearFrom: null,
              yearTo: null,
            })
          }
        >
          ✕ リセット
        </button>
      )}
    </div>
  );
}
