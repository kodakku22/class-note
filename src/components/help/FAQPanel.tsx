import { useRef, useState, useMemo } from 'react';
import { FAQ_ENTRIES, FAQ_CATEGORIES, type FAQCategory } from './faqData';
import { useFocusTrap } from '../../utils/focusTrap';

export type FAQPanelProps = {
  onClose: () => void;
};

export function FAQPanel({ onClose }: FAQPanelProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FAQCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  const filtered = useMemo(() => {
    let entries = FAQ_ENTRIES;
    if (activeCategory !== 'all') {
      entries = entries.filter((e) => e.category === activeCategory);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.question.toLowerCase().includes(q) ||
          e.answer.toLowerCase().includes(q) ||
          e.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }
    return entries;
  }, [query, activeCategory]);

  const categories = Object.entries(FAQ_CATEGORIES) as [FAQCategory, string][];

  return (
    <div className="faq-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="faq-panel"
        role="dialog"
        aria-label="FAQ"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="faq-header">
          <h2>FAQ / トラブルシューティング</h2>
          <button
            type="button"
            className="faq-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="faq-search">
          <input
            type="text"
            placeholder="キーワードで検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="FAQ 検索"
            autoFocus
          />
        </div>

        <div className="faq-categories" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            className={activeCategory === 'all' ? 'faq-cat active' : 'faq-cat'}
            onClick={() => setActiveCategory('all')}
          >
            すべて
          </button>
          {categories.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeCategory === id}
              className={activeCategory === id ? 'faq-cat active' : 'faq-cat'}
              onClick={() => setActiveCategory(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="faq-list">
          {filtered.length === 0 ? (
            <div className="faq-empty">該当する項目が見つかりません</div>
          ) : (
            filtered.map((entry) => (
              <div key={entry.id} className="faq-item">
                <button
                  type="button"
                  className="faq-question"
                  aria-expanded={expandedId === entry.id}
                  onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                >
                  <span className="faq-q-icon">
                    {expandedId === entry.id ? '▾' : '▸'}
                  </span>
                  <span>{entry.question}</span>
                </button>
                {expandedId === entry.id && (
                  <div className="faq-answer">{entry.answer}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
