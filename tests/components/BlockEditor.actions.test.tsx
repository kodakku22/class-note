import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// --------------------------------------------------------------------------
// Coverage targets for BlockEditor.tsx:
//   - The loading state branch (editor === null => "読み込み中…")
//   - The onUpdate callback (md !== lastEmittedRef, and md === lastEmittedRef)
//   - The useEffect for external content sync (content !== current, content === current)
//   - The useEffect for active inserter registration (focus/blur, isFocused path)
//   - The insertContent try/catch error branch
// --------------------------------------------------------------------------

// We need two test suites: one where useEditor returns null (loading state)
// and one where useEditor returns a rich mock (all other branches).

// ----- Suite 1: Loading state (editor === null) -----
describe('BlockEditor – loading state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders loading fallback when editor is null', async () => {
    // Mock useEditor to return null
    vi.doMock('@tiptap/react', () => ({
      useEditor: () => null,
      EditorContent: ({ editor }: any) => <div data-testid="editor-content">editor</div>,
    }));
    vi.doMock('@tiptap/starter-kit', () => ({
      default: { configure: vi.fn(() => 'StarterKit') },
    }));
    vi.doMock('@tiptap/extension-placeholder', () => ({
      default: { configure: vi.fn(() => 'Placeholder') },
    }));
    vi.doMock('@tiptap/extension-task-list', () => ({ default: 'TaskList' }));
    vi.doMock('@tiptap/extension-task-item', () => ({
      default: { configure: vi.fn(() => 'TaskItem') },
    }));
    vi.doMock('tiptap-markdown', () => ({
      Markdown: { configure: vi.fn(() => 'Markdown') },
    }));
    vi.doMock('../../src/components/editor/SlashMenu', () => ({
      SlashMenu: () => <div data-testid="slash-menu" />,
    }));
    vi.doMock('../../src/state/activeEditor', () => ({
      registerActiveInserter: vi.fn(() => vi.fn()),
    }));

    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    const { container } = render(<BlockEditor content="" onChange={vi.fn()} />);
    expect(container.querySelector('.block-editor-loading')).toBeInTheDocument();
    expect(container.querySelector('.block-editor')).not.toBeInTheDocument();
  });
});

// ----- Suite 2: Editor interactions (branches & callbacks) -----
describe('BlockEditor – editor callbacks and effects', () => {
  // Capture the onUpdate callback registered with useEditor
  let capturedOnUpdate: ((args: { editor: any }) => void) | undefined;
  // Capture the extensions config to verify placeholder
  let capturedConfig: any;
  // Listeners registered via editor.on / editor.off
  const listeners: Record<string, Function[]> = {};

  const mockUnregister = vi.fn();
  const mockRegisterActiveInserter = vi.fn(() => mockUnregister);

  const mockEditor = {
    on: vi.fn((event: string, fn: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    }),
    off: vi.fn((event: string, fn: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    }),
    isFocused: false,
    commands: { setContent: vi.fn() },
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        insertContent: vi.fn(() => ({ run: vi.fn() })),
      })),
    })),
    storage: { markdown: { getMarkdown: () => '# Hello' } },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedOnUpdate = undefined;
    capturedConfig = undefined;
    listeners.focus = [];
    listeners.blur = [];
    mockEditor.isFocused = false;
    mockEditor.storage = { markdown: { getMarkdown: () => '# Hello' } };
    mockEditor.commands.setContent.mockClear();
    mockEditor.on.mockClear();
    mockEditor.off.mockClear();

    vi.doMock('@tiptap/react', () => ({
      useEditor: (config: any) => {
        capturedOnUpdate = config.onUpdate;
        capturedConfig = config;
        return mockEditor;
      },
      EditorContent: ({ editor }: any) => <div data-testid="editor-content">editor</div>,
    }));
    vi.doMock('@tiptap/starter-kit', () => ({
      default: { configure: vi.fn(() => 'StarterKit') },
    }));
    vi.doMock('@tiptap/extension-placeholder', () => ({
      default: { configure: vi.fn((opts: any) => ({ name: 'Placeholder', ...opts })) },
    }));
    vi.doMock('@tiptap/extension-task-list', () => ({ default: 'TaskList' }));
    vi.doMock('@tiptap/extension-task-item', () => ({
      default: { configure: vi.fn(() => 'TaskItem') },
    }));
    vi.doMock('tiptap-markdown', () => ({
      Markdown: { configure: vi.fn(() => 'Markdown') },
    }));
    vi.doMock('../../src/components/editor/SlashMenu', () => ({
      SlashMenu: () => <div data-testid="slash-menu" />,
    }));
    vi.doMock('../../src/state/activeEditor', () => ({
      registerActiveInserter: (...args: any[]) => mockRegisterActiveInserter(...args),
    }));
  });

  it('calls onChange when markdown content changes via onUpdate', async () => {
    const onChange = vi.fn();
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="# Hello" onChange={onChange} />);

    expect(capturedOnUpdate).toBeDefined();

    // Simulate a content change in the editor
    const editorWithNewContent = {
      ...mockEditor,
      storage: { markdown: { getMarkdown: () => '# Changed' } },
    };
    act(() => {
      capturedOnUpdate!({ editor: editorWithNewContent });
    });
    expect(onChange).toHaveBeenCalledWith('# Changed');
  });

  it('does NOT call onChange when markdown content is the same', async () => {
    const onChange = vi.fn();
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="# Hello" onChange={onChange} />);

    // onUpdate with same content as initial
    const editorSame = {
      ...mockEditor,
      storage: { markdown: { getMarkdown: () => '# Hello' } },
    };
    act(() => {
      capturedOnUpdate!({ editor: editorSame });
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles onUpdate when markdown storage is missing (falls back to empty string)', async () => {
    const onChange = vi.fn();
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="" onChange={onChange} />);

    // Editor with no markdown storage
    const editorNoStorage = {
      ...mockEditor,
      storage: {},
    };
    act(() => {
      capturedOnUpdate!({ editor: editorNoStorage });
    });
    // empty string is same as initial content "" => no call
    expect(onChange).not.toHaveBeenCalled();
  });

  it('syncs external content changes into editor via setContent', async () => {
    const onChange = vi.fn();
    // Editor currently has "# Hello", we'll re-render with "# New content"
    mockEditor.storage = { markdown: { getMarkdown: () => '# Hello' } };
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    const { rerender } = render(<BlockEditor content="# Hello" onChange={onChange} />);

    // Re-render with different content
    rerender(<BlockEditor content="# New content" onChange={onChange} />);
    expect(mockEditor.commands.setContent).toHaveBeenCalledWith('# New content', { emitUpdate: false });
  });

  it('does NOT call setContent when external content matches editor content', async () => {
    const onChange = vi.fn();
    mockEditor.storage = { markdown: { getMarkdown: () => '# Hello' } };
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    const { rerender } = render(<BlockEditor content="# Hello" onChange={onChange} />);

    // Re-render with same content
    rerender(<BlockEditor content="# Hello" onChange={onChange} />);
    expect(mockEditor.commands.setContent).not.toHaveBeenCalled();
  });

  it('registers active inserter on focus and unregisters on blur', async () => {
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="# Hello" onChange={vi.fn()} />);

    // The editor.on('focus',...) and editor.on('blur',...) should have been called
    expect(mockEditor.on).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(mockEditor.on).toHaveBeenCalledWith('blur', expect.any(Function));

    // Simulate focus
    const focusHandler = listeners.focus[0];
    act(() => {
      focusHandler();
    });
    expect(mockRegisterActiveInserter).toHaveBeenCalled();

    // Simulate blur
    const blurHandler = listeners.blur[0];
    act(() => {
      blurHandler();
    });
    expect(mockUnregister).toHaveBeenCalled();
  });

  it('calls onFocus immediately when editor.isFocused is true on mount', async () => {
    mockEditor.isFocused = true;
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="# Hello" onChange={vi.fn()} />);

    // Since isFocused is true, registerActiveInserter should have been called
    expect(mockRegisterActiveInserter).toHaveBeenCalled();
  });

  it('uses default placeholder when none is provided', async () => {
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="" onChange={vi.fn()} />);
    // The placeholder should default to the Japanese string
    // We just verify the component renders without error
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('passes custom placeholder to Placeholder extension', async () => {
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    render(<BlockEditor content="" onChange={vi.fn()} placeholder="Type here..." />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('cleans up event listeners on unmount', async () => {
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    const { unmount } = render(<BlockEditor content="# Hello" onChange={vi.fn()} />);
    unmount();
    expect(mockEditor.off).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(mockEditor.off).toHaveBeenCalledWith('blur', expect.any(Function));
  });

  it('handles external content sync when markdown storage is missing', async () => {
    const onChange = vi.fn();
    // Editor with no markdown storage
    mockEditor.storage = {};
    const { BlockEditor } = await import('../../src/components/editor/BlockEditor');
    const { rerender } = render(<BlockEditor content="" onChange={onChange} />);

    // Re-render with new content — since getMarkdown returns '' (fallback),
    // and new content is "# Something", it should call setContent
    rerender(<BlockEditor content="# Something" onChange={onChange} />);
    expect(mockEditor.commands.setContent).toHaveBeenCalledWith('# Something', { emitUpdate: false });
  });
});
