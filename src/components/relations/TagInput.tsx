// Compact tag input used inside the Relations panel.
import { KeyboardEvent, useState } from 'react';

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

export function TagInput({ tags, onChange }: Props) {
  const [draft, setDraft] = useState('');

  const addCurrent = () => {
    const t = draft.trim().replace(/^#/, '');
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCurrent();
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="tag-input">
      {tags.map((t) => (
        <span key={t} className="tag-chip">
          #{t}
          <button
            type="button"
            className="tag-remove"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`${t} を削除`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        className="tag-input-field"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={addCurrent}
        placeholder={tags.length ? '' : 'タグを追加'}
      />
    </div>
  );
}
