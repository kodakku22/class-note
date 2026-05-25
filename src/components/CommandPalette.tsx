import { useEffect, useMemo, useRef, useState } from 'react';
import { LinkTarget, SearchHit } from '../types';

export type PaletteCommand = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  /** Display-only hint for the global keyboard shortcut that maps to
   *  this command. The actual key handler still lives in
   *  src/hooks/useKeyboardShortcuts.ts — this field is purely the
   *  visible `.cn-kbd` chip on the palette row. Format examples:
   *  "Ctrl+P", "Ctrl+Shift+L", "Ctrl+9". Windows-form is written;
   *  macOS users mentally substitute Cmd. */
  keybinding?: string;
  keywords?: string[];
  railEligible?: boolean;
  railConfirmLabel?: string;
  run: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  vaultPath: string;
  commands?: PaletteCommand[];
  onClose: () => void;
  onSelectTarget: (target: LinkTarget) => void;
  onSelectHit: (hit: SearchHit) => void;
};

const CATEGORY_ICON: Record<string, string> = {
  'subject-note': '📝',
  'subject-overview': '📋',
  book: '📚',
  memo: '💭',
};
const CATEGORY_LABEL: Record<string, string> = {
  'subject-note': 'ノート',
  'subject-overview': '概要',
  book: '本',
  memo: 'メモ',
};
const MATCH_TYPE_ICON: Record<string, string> = {
  filename: '📄',
  body: '🔍',
  tag: '🏷️',
  frontmatter: '⚙️',
};
const MATCH_TYPE_LABEL: Record<string, string> = {
  filename: 'ファイル名',
  body: '本文一致',
  tag: 'タグ',
  frontmatter: 'メタデータ',
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight occurrences of `keyword` (case-insensitive) inside `text`.
// Splits the string into <mark> highlighted spans and plain spans.
function highlightText(text: string, keyword: string): React.ReactNode[] {
  if (!keyword) return [text];
  const re = new RegExp(escapeRegex(keyword), 'gi');
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push(<mark key={key++} className="palette-highlight">{m[0]}</mark>);
    lastIdx = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

export function CommandPalette({
  open,
  vaultPath,
  commands = [],
  onClose,
  onSelectTarget,
  onSelectHit,
}: Props) {
  const [targets, setTargets] = useState<LinkTarget[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    setHits([]);
    window.api.links.listTargets(vaultPath).then(setTargets);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, vaultPath]);

  // Full-text search debounced
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q || q.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      window.api.search.query(vaultPath, q).then(setHits);
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, vaultPath, query]);

  const filteredTargets = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return targets.slice(0, 30);
    return targets
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.subject && t.subject.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [targets, query]);

  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim();
    const base = commands;
    if (!q) return base.slice(0, 12);
    return base
      .filter((cmd) =>
        [cmd.title, cmd.subtitle ?? '', ...(cmd.keywords ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20);
  }, [commands, query]);

  // Combine: filtered targets first, then full-text body hits not already in targets.
  const items = useMemo(() => {
    const targetPaths = new Set(filteredTargets.map((t) => t.filePath));
    const bodyHits = hits.filter((h) => !targetPaths.has(h.filePath)).slice(0, 30);
    return [
      ...filteredCommands.map((c) => ({ kind: 'command' as const, value: c })),
      ...filteredTargets.map((t) => ({ kind: 'target' as const, value: t })),
      ...bodyHits.map((h) => ({ kind: 'hit' as const, value: h })),
    ];
  }, [filteredCommands, filteredTargets, hits]);

  if (!open) return null;

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    if (item.kind === 'command') {
      void item.value.run();
    } else if (item.kind === 'target') onSelectTarget(item.value);
    else onSelectHit(item.value);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected);
    }
  };

  const onChangeQuery = (v: string) => {
    setQuery(v);
    setSelected(0);
  };

  // For highlighting: strip leading "#" if tag-search mode
  const highlightQuery = query.trim().startsWith('#')
    ? query.trim().slice(1).trim()
    : query.trim();

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="コマンド / ノート / 本 / メモ を検索...  (#tag でタグ検索)"
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-results">
          {items.length === 0 && (
            <div className="palette-empty">
              {query.trim()
                ? '一致するノートがありません'
                : 'ノート名/タイトルで絞り込み, 2文字以上で本文・タグ・メタデータも検索 (#tag でタグ専用)'}
            </div>
          )}
          {items.map((item, i) => {
            if (item.kind === 'command') {
              const c = item.value;
              return (
                <div
                  key={`c-${c.id}`}
                  className={`palette-item ${i === selected ? 'selected' : ''}`}
                  onClick={() => choose(i)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="palette-icon">{c.icon ?? '⌘'}</span>
                  <span className="palette-name">
                    {highlightText(c.title, highlightQuery)}
                    {c.subtitle && (
                      <span className="palette-snippet">
                        {' '}· {highlightText(c.subtitle, highlightQuery)}
                      </span>
                    )}
                  </span>
                  <span className="palette-meta">
                    {c.keybinding && (
                      <span className="cn-kbd" aria-label={`shortcut ${c.keybinding}`}>
                        {c.keybinding}
                      </span>
                    )}
                    <span className="palette-cat">コマンド</span>
                  </span>
                </div>
              );
            }
            if (item.kind === 'target') {
              const t = item.value;
              return (
                <div
                  key={`t-${t.filePath}`}
                  className={`palette-item ${i === selected ? 'selected' : ''}`}
                  onClick={() => choose(i)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="palette-icon">
                    {CATEGORY_ICON[t.category] ?? '📄'}
                  </span>
                  <span className="palette-name">
                    {highlightText(t.name, highlightQuery)}
                  </span>
                  <span className="palette-meta">
                    {t.subject && <span>{t.subject}</span>}
                    <span className="palette-cat">{CATEGORY_LABEL[t.category]}</span>
                  </span>
                </div>
              );
            }
            const h = item.value;
            const mt = h.matchType ?? 'body';
            return (
              <div
                key={`h-${h.filePath}`}
                className={`palette-item ${i === selected ? 'selected' : ''}`}
                onClick={() => choose(i)}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="palette-icon">{MATCH_TYPE_ICON[mt] ?? '🔍'}</span>
                <span className="palette-name">
                  {highlightText(h.fileName.replace(/\.md$/, ''), highlightQuery)}
                  <span className="palette-snippet">
                    {' '}· {highlightText(h.snippet, highlightQuery)}
                  </span>
                </span>
                <span className="palette-meta">
                  {h.subject && <span>{h.subject}</span>}
                  <span className="palette-cat">{MATCH_TYPE_LABEL[mt] ?? '本文一致'}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span>↑↓ 移動</span>
          <span>Enter 開く</span>
          <span>Esc 閉じる</span>
          <span>コマンド実行</span>
          <span>#tag タグ検索</span>
        </div>
      </div>
    </div>
  );
}
