import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: any) => <div data-testid="markdown-renderer">{content}</div>,
}));
vi.mock('../../src/components/NoteViewer', () => ({
  NoteViewer: () => <div data-testid="note-viewer" />,
}));
vi.mock('../../src/components/LearningAgentPanel', () => ({
  LearningAgentPanel: ({ label }: any) => <button data-testid="learning-agent">{label}</button>,
}));

import { PaperViewer } from '../../src/components/papers/PaperViewer';

const SAMPLE_NOTE = `---
title: Attention Is All You Need
authors: [Vaswani]
year: 2017
---
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.`;

const DEFAULT_PROPS = {
  filePath: '/vault/papers/attention.md',
  vaultPath: '/vault',
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
};

describe('PaperViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    DEFAULT_PROPS.onJumpToWikilink = vi.fn();
    DEFAULT_PROPS.onJumpToFile = vi.fn();
    (window as any).api.vault = {
      readNote: vi.fn().mockResolvedValue(SAMPLE_NOTE),
    };
    (window as any).api.papers = {
      getReadingNote: vi.fn().mockResolvedValue({ content: '## Reading notes\nGood paper.' }),
      appendReadingNote: vi.fn().mockResolvedValue({ ok: true }),
    };
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders tab buttons', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    expect(screen.getByText('概要・引用価値')).toBeInTheDocument();
    expect(screen.getByText('読書ノート')).toBeInTheDocument();
    expect(screen.getByText('編集')).toBeInTheDocument();
  });

  it('shows overview tab by default with markdown content', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      const renderer = screen.getByTestId('markdown-renderer');
      expect(renderer.textContent).toContain('The dominant sequence transduction');
    });
  });

  it('switches to reading-notes tab', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('読書ノート'));
    });

    expect(screen.getByPlaceholderText(/読んで分かった/)).toBeInTheDocument();
  });

  it('shows reading notes content', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('読書ノート'));
    });

    await waitFor(() => {
      const renderers = screen.getAllByTestId('markdown-renderer');
      const readingRenderer = renderers.find(r => r.textContent?.includes('Good paper'));
      expect(readingRenderer).toBeTruthy();
    });
  });

  it('shows empty state when no reading notes', async () => {
    (window as any).api.papers.getReadingNote = vi.fn().mockResolvedValue({ content: '' });

    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('読書ノート'));
    });

    expect(screen.getByText(/研究メモを残して/)).toBeInTheDocument();
  });

  it('switches to edit tab', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('編集'));
    });

    expect(screen.getByTestId('note-viewer')).toBeInTheDocument();
  });

  it('shows LearningAgentPanel with paper label', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    expect(screen.getByText('論文AI')).toBeInTheDocument();
  });

  it('appends reading note', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('読書ノート'));
    });

    const textarea = screen.getByPlaceholderText(/読んで分かった/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New insight' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('追記'));
    });

    expect((window as any).api.papers.appendReadingNote).toHaveBeenCalledWith(
      '/vault/papers/attention.md',
      'New insight'
    );
  });

  it('shows error alert on failed append', async () => {
    (window as any).api.papers.appendReadingNote = vi.fn().mockResolvedValue({ ok: false, error: 'write failed' });

    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('読書ノート'));
    });

    const textarea = screen.getByPlaceholderText(/読んで分かった/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('追記'));
    });

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('write failed'));
  });

  it('disables append button when textarea is empty', async () => {
    await act(async () => {
      render(<PaperViewer {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('読書ノート'));
    });

    const appendBtn = screen.getByText('追記');
    expect(appendBtn).toBeDisabled();
  });
});
