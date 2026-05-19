// "What kind of note do you want to create?" dialog. Triggered by Ctrl+N
// when a subject is active.
import { useEffect } from 'react';
import { OBJECT_TYPES, type ObjectTypeId } from '../types/objectTypes';

type Props = {
  onPick: (id: ObjectTypeId) => void;
  onClose: () => void;
};

// Subset of types appropriate for "new note" creation. We hide `subject` and
// `daily` because those are created automatically through other flows.
const PICKABLE: ObjectTypeId[] = ['lecture', 'summary', 'review', 'research', 'memo', 'free'];

export function TypeSelector({ onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal type-selector" onClick={(e) => e.stopPropagation()}>
        <h3>新規ノートのタイプを選択</h3>
        <p className="help">タイプごとに異なるテンプレートと Properties が用意されています。</p>
        <div className="type-grid">
          {PICKABLE.map((id) => {
            const t = OBJECT_TYPES.find((o) => o.id === id)!;
            return (
              <button key={id} className="type-card" onClick={() => onPick(id)}>
                <div className="type-card-emoji">{t.emoji}</div>
                <div className="type-card-label">{t.label}</div>
                <div className="type-card-desc">{t.description}</div>
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>キャンセル (Esc)</button>
        </div>
      </div>
    </div>
  );
}
