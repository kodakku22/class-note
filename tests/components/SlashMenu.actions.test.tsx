import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SlashMenu } from '../../src/components/editor/SlashMenu';

/* ------------------------------------------------------------------ */
/* Shared mock-editor factory                                          */
/* ------------------------------------------------------------------ */

function createMockEditor(opts: { text?: string; from?: number } = {}) {
  const { text = '', from = 0 } = opts;
  const callbacks = new Map<string, Set<Function>>();

  const chainObj = {
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
  };

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
    chain: vi.fn().mockReturnValue(chainObj),
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
    _chain: chainObj,
  };
  return editor;
}

/* ------------------------------------------------------------------ */
/* Helper: open the slash menu so keyboard / mouse tests can proceed   */
/* ------------------------------------------------------------------ */
async function openMenu(editor: any) {
  await act(async () => {
    editor._emit('update');
  });
}

describe('SlashMenu — keyboard navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ArrowDown moves selection down', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // Initially selected index is 0 — first item should have 'selected' class
    const firstItem = screen.getByText('見出し 1').closest('.slash-item');
    expect(firstItem?.className).toContain('selected');

    // Press ArrowDown
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    // Now the second item should be selected
    const secondItem = screen.getByText('見出し 2').closest('.slash-item');
    expect(secondItem?.className).toContain('selected');
  });

  it('ArrowUp moves selection up (clamped at 0)', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // Move down first
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    // Now move back up
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });

    const firstItem = screen.getByText('見出し 1').closest('.slash-item');
    expect(firstItem?.className).toContain('selected');
  });

  it('ArrowUp at index 0 stays at 0', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // Press ArrowUp when already at top
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });

    const firstItem = screen.getByText('見出し 1').closest('.slash-item');
    expect(firstItem?.className).toContain('selected');
  });

  it('Enter key selects the currently highlighted item', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // Press Enter — should select first item (h1 → toggleHeading)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Menu should close after selection
    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
    // The chain should have been called (apply runs editor.chain()...)
    expect(editor.chain).toHaveBeenCalled();
  });

  it('Enter after ArrowDown selects the second item', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
    // h2 item calls toggleHeading
    expect(editor._chain.toggleHeading).toHaveBeenCalled();
  });
});

describe('SlashMenu — mouse interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('onMouseEnter changes the selected item', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // Hover over the third item
    const thirdItem = screen.getByText('見出し 3').closest('.slash-item')!;
    await act(async () => {
      fireEvent.mouseEnter(thirdItem);
    });

    expect(thirdItem.className).toContain('selected');
  });

  it('onMouseDown on the menu prevents default (keeps editor focus)', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    const menu = document.querySelector('.slash-menu')!;
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const prevented = !menu.dispatchEvent(event);

    // The React onMouseDown calls e.preventDefault()
    expect(prevented).toBe(true);
  });

  it('clicking an item calls the item apply function', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      fireEvent.click(screen.getByText('コードブロック'));
    });

    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
    expect(editor._chain.toggleCodeBlock).toHaveBeenCalled();
  });
});

describe('SlashMenu — chooseAt branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('chooseAt deletes the trigger text when triggerPos is set', async () => {
    // "/" at position 0, caret at position 1
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // The chain should include setTextSelection and deleteSelection to remove "/query"
    expect(editor._chain.setTextSelection).toHaveBeenCalled();
    expect(editor._chain.deleteSelection).toHaveBeenCalled();
  });

  it('chooseAt with a filtered query uses correct item', async () => {
    // Filter to "code" — only code-related items should show
    const editor = createMockEditor({ text: '/code', from: 5 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // The first filtered item should be the code block
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
    expect(editor._chain.toggleCodeBlock).toHaveBeenCalled();
  });
});

describe('SlashMenu — menu close branch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('closes when text no longer contains "/"', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    expect(document.querySelector('.slash-menu')).toBeInTheDocument();

    // Now simulate the editor text changing so "/" is gone
    editor.state.doc.textBetween.mockReturnValue('hello');

    await act(async () => {
      editor._emit('update');
    });

    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
  });

  it('closes via selectionUpdate event as well', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    render(<SlashMenu editor={editor} />);

    // Open via selectionUpdate instead of update
    await act(async () => {
      editor._emit('selectionUpdate');
    });

    expect(document.querySelector('.slash-menu')).toBeInTheDocument();

    // Change text so "/" is gone, fire selectionUpdate
    editor.state.doc.textBetween.mockReturnValue('no slash');
    await act(async () => {
      editor._emit('selectionUpdate');
    });

    expect(document.querySelector('.slash-menu')).not.toBeInTheDocument();
  });
});

describe('SlashMenu — cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('unregisters editor listeners on unmount', async () => {
    const editor = createMockEditor({ text: '/', from: 1 });
    const { unmount } = render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    // Before unmount, editor.off should not have been called for the compute handlers
    const offCallsBefore = editor.off.mock.calls.length;

    unmount();

    // After unmount, the cleanup function should call editor.off
    expect(editor.off.mock.calls.length).toBeGreaterThan(offCallsBefore);
    // Verify it unregistered 'update' and 'selectionUpdate'
    const offEvents = editor.off.mock.calls.map((c: any[]) => c[0]);
    expect(offEvents).toContain('update');
    expect(offEvents).toContain('selectionUpdate');
  });
});

describe('SlashMenu — individual item applies', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bullet list item calls toggleBulletList', async () => {
    const editor = createMockEditor({ text: '/bullet', from: 7 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.toggleBulletList).toHaveBeenCalled();
  });

  it('ordered list item calls toggleOrderedList', async () => {
    const editor = createMockEditor({ text: '/ordered', from: 8 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.toggleOrderedList).toHaveBeenCalled();
  });

  it('todo item calls toggleTaskList', async () => {
    const editor = createMockEditor({ text: '/todo', from: 5 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.toggleTaskList).toHaveBeenCalled();
  });

  it('quote item calls toggleBlockquote', async () => {
    const editor = createMockEditor({ text: '/quote', from: 6 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.toggleBlockquote).toHaveBeenCalled();
  });

  it('divider item calls setHorizontalRule', async () => {
    const editor = createMockEditor({ text: '/divider', from: 8 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.setHorizontalRule).toHaveBeenCalled();
  });

  it('paragraph/text item calls setParagraph', async () => {
    const editor = createMockEditor({ text: '/text', from: 5 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.setParagraph).toHaveBeenCalled();
  });

  it('math item calls insertContent with math codeBlock', async () => {
    const editor = createMockEditor({ text: '/math', from: 5 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codeBlock', attrs: { language: 'math' } })
    );
  });

  it('mermaid/diagram item calls insertContent with mermaid codeBlock', async () => {
    const editor = createMockEditor({ text: '/diagram', from: 8 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codeBlock', attrs: { language: 'mermaid' } })
    );
  });

  it('wikilink item calls insertContent with [[]]', async () => {
    const editor = createMockEditor({ text: '/link', from: 5 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.insertContent).toHaveBeenCalledWith('[[]]');
  });

  it('embed item calls insertContent with ![[]]', async () => {
    const editor = createMockEditor({ text: '/embed', from: 6 });
    render(<SlashMenu editor={editor} />);
    await openMenu(editor);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(editor._chain.insertContent).toHaveBeenCalledWith('![[]]');
  });
});
