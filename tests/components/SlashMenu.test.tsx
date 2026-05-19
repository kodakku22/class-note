import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SlashMenu } from '../../src/components/editor/SlashMenu';

// Create a mock TipTap editor
function createMockEditor(opts: { text?: string; from?: number } = {}) {
  const { text = '', from = 0 } = opts;
  const callbacks = new Map<string, Set<Function>>();
  const editor: any = {
    state: {
      selection: { from, $from: { parent: { isTextblock: true } } },
      doc: {
        textBetween: vi.fn().mockReturnValue(text),
        resolve: vi.fn().mockReturnValue({ parent: { isTextblock: true } }),
      },
    },
    view: {
      coordsAtPos: vi.fn().mockReturnValue({ top: 100, bottom: 120, left: 50, right: 100 }),
      dom: { getBoundingClientRect: vi.fn().mockReturnValue({ top: 0, left: 0 }) },
    },
    chain: vi.fn().mockReturnValue({
      focus: vi.fn().mockReturnThis(),
      setTextSelection: vi.fn().mockReturnThis(),
      deleteSelection: vi.fn().mockReturnThis(),
      toggleHeading: vi.fn().mockReturnThis(),
      setParagraph: vi.fn().mockReturnThis(),
      toggleBulletList: vi.fn().mockReturnThis(),
      toggleOrderedList: vi.fn().mockReturnThis(),
      toggleTaskList: vi.fn().mockReturnThis(),
      toggleCodeBlock: vi.fn().mockReturnThis(),
      toggleBlockquote: vi.fn().mockReturnThis(),
      setHorizontalRule: vi.fn().mockReturnThis(),
      insertContent: vi.fn().mockReturnThis(),
      run: vi.fn(),
    }),
    on: vi.fn((event: string, cb: Function) => {
      if (!callbacks.has(event)) callbacks.set(event, new Set());
      callbacks.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: Function) => {
      callbacks.get(event)?.delete(cb);
    }),
    _emit: (event: string) => {
      callbacks.get(event)?.forEach((cb) => cb());
    },
    _callbacks: callbacks,
  };
  return editor;
}

describe('SlashMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders null when not triggered', () => {
    const editor = createMockEditor();
    const { container } = render(<SlashMenu editor={editor} />);
    expect(container.innerHTML).toBe('');
  });

  it('opens when "/" is typed', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    // Trigger the update callback
    await act(async () => {
      editor._emit('update');
    });

    expect(document.querySelector('.slash-menu')).toBeInTheDocument();
  });

  it('shows all menu items when no filter query', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('見出し 1')).toBeInTheDocument();
    expect(screen.getByText('見出し 2')).toBeInTheDocument();
    expect(screen.getByText('箇条書き')).toBeInTheDocument();
    expect(screen.getByText('コードブロック')).toBeInTheDocument();
    expect(screen.getByText('引用')).toBeInTheDocument();
  });

  it('filters items by query', async () => {
    const editor = createMockEditor({ text: '/h1', from: 3 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('見出し 1')).toBeInTheDocument();
  });

  it('shows hints for menu items', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('/h1')).toBeInTheDocument();
    expect(screen.getByText('/code')).toBeInTheDocument();
  });

  it('shows emoji icons', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('•')).toBeInTheDocument();
    expect(screen.getByText('☐')).toBeInTheDocument();
  });

  it('registers update and selectionUpdate callbacks', () => {
    const editor = createMockEditor();
    render(<SlashMenu editor={editor} />);

    const registeredEvents = Array.from(editor._callbacks.keys());
    expect(registeredEvents).toContain('update');
    expect(registeredEvents).toContain('selectionUpdate');
  });

  it('shows "該当なし" when filter produces no results', async () => {
    const editor = createMockEditor({ text: '/xxxxxxxxx', from: 10 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('該当なし')).toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(document.querySelector('.slash-menu')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
  });

  it('selects item on click', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('箇条書き'));
    });

    // Menu should close
    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
  });

  it('shows math and mermaid items', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('数式 (KaTeX)')).toBeInTheDocument();
    expect(screen.getByText('図 (Mermaid)')).toBeInTheDocument();
  });

  it('shows wikilink and embed items', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });

    render(<SlashMenu editor={editor} />);

    await act(async () => {
      editor._emit('update');
    });

    expect(screen.getByText('ノートリンク')).toBeInTheDocument();
    expect(screen.getByText('ファイル埋め込み')).toBeInTheDocument();
  });
});
