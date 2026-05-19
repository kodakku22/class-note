// Anytype-inspired Relations panel: shows the note's frontmatter as
// labelled, editable properties down the right side of the viewer.
import { useMemo } from 'react';
import { OBJECT_TYPES, getObjectType, type RelationDef } from '../../types/objectTypes';
import { TagInput } from './TagInput';

type Props = {
  meta: Record<string, unknown>;
  onChange: (meta: Record<string, unknown>) => void;
};

function detectType(meta: Record<string, unknown>): string {
  const t = meta['type'];
  if (typeof t === 'string') return t;
  return 'free';
}

function asString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

export function RelationsPanel({ meta, onChange }: Props) {
  const typeId = detectType(meta);
  const def = getObjectType(typeId) ?? getObjectType('free')!;

  const update = (key: string, value: unknown) => {
    const next = { ...meta };
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  // Always include `type` selector at the top
  const others = useMemo(() => def.relations.filter((r) => r.key !== 'type'), [def]);

  return (
    <aside className="relations-panel" aria-label="プロパティパネル">
      <div className="relations-header">
        <span className="relations-title">PROPERTIES</span>
      </div>

      <div className="relation-row">
        <label className="relation-label">
          <span className="relation-emoji">📦</span>
          <span>Type</span>
        </label>
        <select
          className="relation-input"
          value={typeId}
          onChange={(e) => update('type', e.target.value || undefined)}
        >
          {OBJECT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.label}
            </option>
          ))}
        </select>
      </div>

      {others.map((r) => (
        <RelationRow
          key={r.key}
          def={r}
          value={meta[r.key]}
          onChange={(v) => update(r.key, v)}
        />
      ))}
    </aside>
  );
}

function RelationRow({
  def,
  value,
  onChange,
}: {
  def: RelationDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="relation-label">
      {def.emoji && <span className="relation-emoji">{def.emoji}</span>}
      <span>{def.label}</span>
    </label>
  );

  if (def.kind === 'tags') {
    return (
      <div className="relation-row">
        {label}
        <TagInput
          tags={asTags(value)}
          onChange={(tags) => onChange(tags.length ? tags : undefined)}
        />
      </div>
    );
  }

  if (def.kind === 'date') {
    return (
      <div className="relation-row">
        {label}
        <input
          className="relation-input"
          type="date"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </div>
    );
  }

  if (def.kind === 'rating') {
    const num = Number(value) || 0;
    return (
      <div className="relation-row">
        {label}
        <div className="relation-rating">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              className={i <= num ? 'star filled' : 'star'}
              onClick={() => onChange(i === num ? undefined : i)}
              aria-label={`${i} 星`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (def.kind === 'number') {
    return (
      <div className="relation-row">
        {label}
        <input
          className="relation-input"
          type="number"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </div>
    );
  }

  if (def.kind === 'select' || def.kind === 'status') {
    return (
      <div className="relation-row">
        {label}
        <select
          className="relation-input"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (def.kind === 'longtext') {
    return (
      <div className="relation-row">
        {label}
        <textarea
          className="relation-input relation-textarea"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
          rows={3}
        />
      </div>
    );
  }

  // Default text
  return (
    <div className="relation-row">
      {label}
      <input
        className="relation-input"
        type="text"
        value={asString(value)}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}
