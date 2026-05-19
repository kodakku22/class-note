// Notion / Anytype-style "/" command menu for the BlockEditor.
//
// Trigger: typing "/" at the start of a line opens a menu.  Up/Down + Enter
// to choose, Escape to dismiss.  The menu replaces the "/" trigger and any
// query text the user typed after it.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

type Item = {
  id: string;
  label: string;
  hint: string;
  emoji: string;
  /** Mutates the editor when the user selects this item. */
  apply: (editor: Editor) => void;
};

const ITEMS: Item[] = [
  // Headings
  {
    id: 'h1',
    label: '見出し 1',
    hint: '/h1',
    emoji: '𝐇',
    apply: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: '見出し 2',
    hint: '/h2',
    emoji: 'H₂',
    apply: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: '見出し 3',
    hint: '/h3',
    emoji: 'H₃',
    apply: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'paragraph',
    label: 'テキスト',
    hint: '/text',
    emoji: '¶',
    apply: (e) => e.chain().focus().setParagraph().run(),
  },
  // Lists
  {
    id: 'bullet',
    label: '箇条書き',
    hint: '/bullet',
    emoji: '•',
    apply: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: '番号付きリスト',
    hint: '/ordered',
    emoji: '1.',
    apply: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'todo',
    label: 'チェックリスト',
    hint: '/todo',
    emoji: '☐',
    apply: (e) => e.chain().focus().toggleTaskList().run(),
  },
  // Code/Quote
  {
    id: 'code',
    label: 'コードブロック',
    hint: '/code',
    emoji: '</>',
    apply: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'quote',
    label: '引用',
    hint: '/quote',
    emoji: '”',
    apply: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'divider',
    label: '区切り線',
    hint: '/divider',
    emoji: '—',
    apply: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  // ClassNotes-specific (inserts raw Markdown templates)
  {
    id: 'math',
    label: '数式 (KaTeX)',
    hint: '/math',
    emoji: '∑',
    apply: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'math' },
          content: [{ type: 'text', text: '\\frac{a}{b}' }],
        })
        .run(),
  },
  {
    id: 'mermaid',
    label: '図 (Mermaid)',
    hint: '/diagram',
    emoji: '◇',
    apply: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'graph TD\n  A --> B' }],
        })
        .run(),
  },
  {
    id: 'wikilink',
    label: 'ノートリンク',
    hint: '/link',
    emoji: '🔗',
    apply: (e) => e.chain().focus().insertContent('[[]]').run(),
  },
  {
    id: 'embed',
    label: 'ファイル埋め込み',
    hint: '/embed',
    emoji: '📎',
    apply: (e) => e.chain().focus().insertContent('![[]]').run(),
  },
];

type Props = { editor: Editor };

export function SlashMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selected, setSelected] = useState(0);
  const triggerPosRef = useRef<number | null>(null); // ProseMirror position of the "/"

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.id.includes(q) ||
        it.hint.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!editor) return;

    const compute = () => {
      const { state } = editor;
      const { from, $from } = state.selection;
      // Find a "/" before the caret on the current line.
      const before = state.doc.textBetween(
        Math.max(0, from - 100),
        from,
        '\n',
        '\n'
      );
      const match = before.match(/(?:^|\s)\/(\w*)$/);
      if (match) {
        const slashRel = match[0].lastIndexOf('/');
        const slashAbsolute = from - (match[0].length - slashRel);
        // Only open if the slash sits at the start of an empty line OR after a space
        const $slash = state.doc.resolve(slashAbsolute);
        if ($slash.parent.isTextblock) {
          triggerPosRef.current = slashAbsolute;
          setQuery(match[1]);
          setSelected(0);
          // Position menu near the caret
          const coords = editor.view.coordsAtPos(from);
          const editorRect = editor.view.dom.getBoundingClientRect();
          setPosition({
            top: coords.bottom - editorRect.top + 6,
            left: coords.left - editorRect.left,
          });
          setOpen(true);
          return;
        }
      }
      // Otherwise close
      if (open) {
        setOpen(false);
        setQuery('');
        triggerPosRef.current = null;
      }
      // Suppress the "$from is unused" lint without an extra var
      void $from;
    };

    editor.on('update', compute);
    editor.on('selectionUpdate', compute);
    return () => {
      editor.off('update', compute);
      editor.off('selectionUpdate', compute);
    };
  }, [editor, open]);

  // Keyboard handling for menu navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(filtered.length - 1, s + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        chooseAt(selected);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerPosRef.current = null;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, selected]);

  const chooseAt = (idx: number) => {
    const item = filtered[idx];
    if (!item) return;
    const slashPos = triggerPosRef.current;
    const caretPos = editor.state.selection.from;
    if (slashPos != null) {
      // Delete the "/query" trigger before applying the action
      editor.chain().focus().setTextSelection({ from: slashPos, to: caretPos }).deleteSelection().run();
    }
    item.apply(editor);
    setOpen(false);
    setQuery('');
    triggerPosRef.current = null;
  };

  if (!open || !position) return null;

  return (
    <div
      className="slash-menu"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
    >
      {filtered.length === 0 ? (
        <div className="slash-empty">該当なし</div>
      ) : (
        filtered.map((it, i) => (
          <div
            key={it.id}
            className={`slash-item ${i === selected ? 'selected' : ''}`}
            onMouseEnter={() => setSelected(i)}
            onClick={() => chooseAt(i)}
          >
            <span className="slash-icon">{it.emoji}</span>
            <span className="slash-label">{it.label}</span>
            <span className="slash-hint">{it.hint}</span>
          </div>
        ))
      )}
    </div>
  );
}
