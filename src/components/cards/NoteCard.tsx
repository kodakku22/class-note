// Milanote-style note card with hover toolbar, color label and tag footer.
import { useState } from 'react';
import { OBJECT_TYPES, type CardColor } from '../../types/objectTypes';
import { colorForSubject } from '../../utils/colors';

type Props = {
  filePath: string;
  fileName: string;
  meta?: Record<string, unknown>;
  preview?: string;
  mtime: number;
  subject?: string;
  active?: boolean;
  onOpen: () => void;
  onChangeColor?: (color: CardColor) => void;
  onRename?: () => void;
  onDelete?: () => void;
};

const COLOR_BG: Record<CardColor, string> = {
  default: 'var(--bg-card, var(--bg-secondary))',
  red: 'var(--card-red, #FFEBEB)',
  orange: 'var(--card-orange, #FFF3E0)',
  yellow: 'var(--card-yellow, #FFFDE7)',
  green: 'var(--card-green, #E8F5E9)',
  teal: 'var(--card-teal, #E0F7FA)',
  blue: 'var(--card-blue, #E3F2FD)',
  purple: 'var(--card-purple, #F3E5F5)',
  pink: 'var(--card-pink, #FCE4EC)',
  gray: 'var(--card-gray, #F5F5F5)',
  brown: 'var(--card-brown, #EFEBE9)',
  indigo: 'var(--card-indigo, #E8EAF6)',
};

function formatDate(mtime: number): string {
  const d = new Date(mtime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function NoteCard({
  fileName,
  meta = {},
  preview = '',
  mtime,
  subject,
  active,
  onOpen,
  onChangeColor,
  onRename,
  onDelete,
}: Props) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const color = (meta.color as CardColor) || 'default';
  const type = meta.type as string | undefined;
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
  const title = (meta.title as string) || fileName.replace(/\.md$/, '');
  const typeDef = OBJECT_TYPES.find((t) => t.id === type);
  const subjectAccent = subject ? colorForSubject(subject).accent : undefined;

  return (
    <div
      className={`note-card ${active ? 'active' : ''}`}
      style={{ background: COLOR_BG[color] ?? COLOR_BG.default }}
      onClick={onOpen}
    >
      <div className="note-card-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          title="色を変更"
          onClick={() => setShowColorMenu((s) => !s)}
        >
          🎨
        </button>
        {onRename && (
          <button title="名前変更" onClick={onRename}>
            ✏️
          </button>
        )}
        {onDelete && (
          <button title="削除" onClick={onDelete} className="danger">
            🗑️
          </button>
        )}
      </div>

      {showColorMenu && (
        <div className="color-picker" onClick={(e) => e.stopPropagation()}>
          {(Object.keys(COLOR_BG) as CardColor[]).map((c) => (
            <button
              key={c}
              className={`color-swatch ${color === c ? 'active' : ''}`}
              style={{ background: COLOR_BG[c] }}
              onClick={() => {
                onChangeColor?.(c);
                setShowColorMenu(false);
              }}
              title={c}
              aria-label={`色: ${c}`}
            />
          ))}
        </div>
      )}

      {subjectAccent && (
        <span className="note-card-accent" style={{ background: subjectAccent }} />
      )}

      <div className="note-card-head">
        <span className="note-card-icon">{typeDef?.emoji ?? '📄'}</span>
        <span className="note-card-title">{title}</span>
      </div>

      {preview && <div className="note-card-preview">{preview}</div>}

      <div className="note-card-foot">
        <span className="note-card-date">{formatDate(mtime)}</span>
        {tags.length > 0 && (
          <div className="note-card-tags">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="note-card-tag">
                #{t}
              </span>
            ))}
            {tags.length > 3 && <span className="note-card-tag-more">+{tags.length - 3}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
