import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock heavy child components
vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));
vi.mock('../../src/components/NoteViewer', () => ({
  NoteViewer: () => <div data-testid="note-viewer" />,
}));
vi.mock('../../src/components/LearningAgentPanel', () => ({
  LearningAgentPanel: () => <div data-testid="learning-agent-panel" />,
}));

import { BookViewer } from '../../src/components/BookViewer';

const BOOK_CONTENT = '---\ntitle: Test Book\n---\n# Chapter 1\nSome content here';
const READING_NOTES = '## 2025-06-01\n\nFirst note\n\n## 2025-06-02\n\nSecond note';

const DEFAULT_PROPS = {
  filePath: '/vault/books/TestBook.md',
  vaultPath: '/vault',
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
};

describe('BookViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      readNote: vi.fn().mockResolvedValue(BOOK_CONTENT),
      writeNote: vi.fn().mockResolvedValue({ ok: true }),
    };
    (window as any).api.books = {
      getReadingNote: vi.fn().mockResolvedValue({ content: READING_NOTES }),
      appendReadingNote: vi.fn().mockResolvedValue({ ok: true }),
    };
  });

  it('renders tab buttons', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/概要・感想/)).toBeInTheDocument();
    });
    expect(screen.getByText(/読書ノート/)).toBeInTheDocument();
    expect(screen.getByText(/編集/)).toBeInTheDocument();
  });

  it('shows overview tab by default', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      const renderer = screen.getByTestId('markdown-renderer');
      expect(renderer).toHaveTextContent('Chapter 1');
    });
  });

  it('loads book content on mount', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect((window as any).api.vault.readNote).toHaveBeenCalledWith('/vault/books/TestBook.md');
    });
    expect((window as any).api.books.getReadingNote).toHaveBeenCalledWith('/vault/books/TestBook.md');
  });

  it('switches to reading-notes tab', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/概要・感想/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/読書ノート/));
    });

    // Should show the reading notes markdown
    const renderers = screen.getAllByTestId('markdown-renderer');
    const readingRenderer = renderers.find(r => r.textContent?.includes('First note'));
    expect(readingRenderer).toBeTruthy();
  });

  it('shows empty state when no reading notes', async () => {
    (window as any).api.books.getReadingNote = vi.fn().mockResolvedValue({ content: '' });

    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/概要・感想/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/読書ノート/));
    });

    expect(screen.getByText('読みながら気づいたことを書いておこう')).toBeInTheDocument();
  });

  it('switches to edit tab', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/編集/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/編集/));
    });

    expect(screen.getByTestId('note-viewer')).toBeInTheDocument();
  });

  it('appends reading note on button click', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/概要・感想/)).toBeInTheDocument();
    });

    // Switch to reading notes tab
    await act(async () => {
      fireEvent.click(screen.getByText(/読書ノート/));
    });

    // Type in textarea
    const textarea = screen.getByPlaceholderText(/読みながら気づいたことをメモ/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New reading note' } });
    });

    // Click append button
    await act(async () => {
      fireEvent.click(screen.getByText('追記'));
    });

    await waitFor(() => {
      expect((window as any).api.books.appendReadingNote).toHaveBeenCalledWith(
        '/vault/books/TestBook.md',
        'New reading note'
      );
    });
  });

  it('does not append empty note', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/読書ノート/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/読書ノート/));
    });

    // Button should be disabled when textarea is empty
    const appendBtn = screen.getByText('追記');
    expect(appendBtn).toBeDisabled();
  });

  it('shows error on failed append', async () => {
    (window as any).api.books.appendReadingNote = vi.fn().mockResolvedValue({ ok: false, error: 'disk full' });

    // Mock window.alert
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/読書ノート/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/読書ノート/));
    });

    const textarea = screen.getByPlaceholderText(/読みながら気づいたことをメモ/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test note' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('追記'));
    });

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('disk full'));
    });

    alertMock.mockRestore();
  });

  it('renders LearningAgentPanel', async () => {
    await act(async () => {
      render(<BookViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('learning-agent-panel')).toBeInTheDocument();
    });
  });
});
