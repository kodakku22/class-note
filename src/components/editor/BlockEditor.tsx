// TipTap-based Block Editor with Markdown round-trip.
//
// Design notes:
// - We use `tiptap-markdown` for the Markdown <-> ProseMirror conversion so
//   that we keep the on-disk format compatible with Obsidian / plain editors.
// - Math (KaTeX) and Mermaid blocks are NOT yet inline-rendered inside the
//   editor; they are stored as fenced code blocks (`$$...$$` for math, ` ```mermaid` for diagrams)
//   and fully rendered in PREVIEW mode (MarkdownRenderer). This keeps the
//   editor lightweight and matches Anytype's "edit raw, render preview" model.
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef } from 'react';
import { SlashMenu } from './SlashMenu';
import { registerActiveInserter } from '../../state/activeEditor';

type Props = {
  content: string;          // Markdown source
  onChange: (md: string) => void;
  placeholder?: string;
};

export function BlockEditor({ content, onChange, placeholder }: Props) {
  const lastEmittedRef = useRef<string>(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: placeholder ?? '入力するか / でブロックを挿入...',
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      // Pull markdown out of TipTap; only emit when it actually changed.
      const md = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? '';
      if (md !== lastEmittedRef.current) {
        lastEmittedRef.current = md;
        onChange(md);
      }
    },
  });

  // External content changes (e.g. file watcher reload) should sync into the
  // editor without nuking the cursor every keystroke.
  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? '';
    if (content !== current) {
      lastEmittedRef.current = content;
      editor.commands.setContent(content, { emitUpdate: false });
    }
     
  }, [content, editor]);

  // Register this editor as the global "active inserter" while it has focus,
  // so the CitationPicker (and other Phase 3 features) can drop text at the
  // current caret position rather than going through the clipboard.
  useEffect(() => {
    if (!editor) return;
    let unregister: (() => void) | null = null;
    const onFocus = () => {
      unregister?.();
      unregister = registerActiveInserter((text) => {
        try {
          editor.chain().focus().insertContent(text).run();
          return true;
        } catch {
          return false;
        }
      });
    };
    const onBlur = () => {
      unregister?.();
      unregister = null;
    };
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    if (editor.isFocused) onFocus();
    return () => {
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
      unregister?.();
    };
  }, [editor]);

  if (!editor) return <div className="block-editor-loading">読み込み中…</div>;

  return (
    <div className="block-editor">
      <SlashMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
