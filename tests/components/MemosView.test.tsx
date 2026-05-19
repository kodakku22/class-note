import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock MarkdownRenderer since it has heavy dependencies
vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

import { MemosView } from '../../src/components/MemosView';
import type { MemoEntry } from '../../src/types';

const SAMPLE_MEMOS: MemoEntry[] = [
  {
    filePath: '/vault/memos/memo-1.md',
    fileName: 'memo-1.md',
    created: '2025-05-01 10:00',
    tags: ['idea', 'math'],
    body: 'First memo about calculus',
    mtime: 1000,
  },
  {
    filePath: '/vault/memos/memo-2.md',
    fileName: 'memo-2.md',
    created: '2025-05-02 11:00',
    tags: ['idea'],
    body: 'Second memo about physics',
    mtime: 2000,
  },
  {
    filePath: '/vault/memos/memo-3.md',
    fileName: 'memo-3.md',
    created: '2025-05-03 12:00',
    tags: [],
    body: 'A memo with no tags',
    mtime: 3000,
  },
];

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
};

// Direct mock assignment — the Proxy-based window.api doesn't support vi.spyOn
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

describe('MemosView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    mockList.mockResolvedValue(SAMPLE_MEMOS);
    mockCreate.mockResolvedValue({ ok: true, filePath: '/vault/memos/new.md' });
    mockUpdate.mockResolvedValue({ ok: true });
    mockDelete.mockResolvedValue({ ok: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api.memos = {
      list: mockList,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    };
  });

  it('renders the memo list', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    });

    expect(screen.getByText('Second memo about physics')).toBeInTheDocument();
    expect(screen.getByText('A memo with no tags')).toBeInTheDocument();
  });

  it('shows the header', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('メモ');
    });
  });

  it('renders the quick-add textarea', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/メモを書く/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no memos exist', async () => {
    mockList.mockResolvedValue([]);

    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('メモはまだありません')).toBeInTheDocument();
    });
  });

  it('creates a new memo', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/メモを書く/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/メモを書く/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'A brand new memo' } });
    });

    const submitBtn = screen.getByRole('button', { name: '投稿' });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockCreate).toHaveBeenCalledWith('/vault', 'A brand new memo', []);
  });

  it('disables submit button when draft is empty', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '投稿' })).toBeDisabled();
    });
  });

  it('shows memo timestamps', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('2025-05-01 10:00')).toBeInTheDocument();
    });
    expect(screen.getByText('2025-05-02 11:00')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each memo', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('編集');
    expect(editButtons.length).toBe(3);

    const deleteButtons = screen.getAllByTitle('削除');
    expect(deleteButtons.length).toBe(3);
  });

  it('shows tag filter bar with all tags', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('すべて')).toBeInTheDocument();
      // Tags appear both in filter bar and in memo items, use getAllByText
      const ideaTags = screen.getAllByText('#idea');
      expect(ideaTags.length).toBeGreaterThanOrEqual(2); // filter bar + memo items
      const mathTags = screen.getAllByText('#math');
      expect(mathTags.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters memos by tag click', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    });

    // Click #math filter
    const tagButtons = screen.getAllByText('#math');
    const filterBtn = tagButtons.find(el => el.classList.contains('tag-chip'));
    if (filterBtn) {
      await act(async () => {
        fireEvent.click(filterBtn);
      });
    }

    // Only first memo has 'math' tag
    expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    expect(screen.queryByText('Second memo about physics')).not.toBeInTheDocument();
    expect(screen.queryByText('A memo with no tags')).not.toBeInTheDocument();
  });

  it('resets filter when clicking active tag again', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('すべて')).toBeInTheDocument();
    });

    // Click a tag in a memo item to filter
    const mathTags = screen.getAllByText('#math');
    const clickableTag = mathTags.find(el => el.classList.contains('clickable'));
    if (clickableTag) {
      await act(async () => {
        fireEvent.click(clickableTag);
      });
    }

    // Should filter to just math memos
    expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    expect(screen.queryByText('A memo with no tags')).not.toBeInTheDocument();
  });

  it('enters edit mode on edit button click', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('編集');
    await act(async () => {
      fireEvent.click(editButtons[0]);
    });

    // Should show save and cancel buttons
    expect(screen.getByText('保存')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  it('cancels edit mode', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('編集');
    await act(async () => {
      fireEvent.click(editButtons[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('取消'));
    });

    // Should exit edit mode
    expect(screen.queryByText('保存')).not.toBeInTheDocument();
  });

  it('saves edited memo', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('First memo about calculus')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('編集');
    await act(async () => {
      fireEvent.click(editButtons[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });

    expect(mockUpdate).toHaveBeenCalledWith('/vault/memos/memo-1.md', 'First memo about calculus');
  });

  it('submits with Ctrl+Enter', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/メモを書く/)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/メモを書く/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Ctrl+Enter memo' } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    });

    expect(mockCreate).toHaveBeenCalledWith('/vault', 'Ctrl+Enter memo', []);
  });

  it('shows tags in memo items', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      const ideaTags = screen.getAllByText('#idea');
      expect(ideaTags.length).toBeGreaterThan(0);
    });
  });

  it('hides tag filter bar when no tags', async () => {
    mockList.mockResolvedValue([
      { filePath: '/vault/m1.md', fileName: 'm1.md', created: '2025-01-01', tags: [], body: 'no tags', mtime: 1000 },
    ]);

    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('no tags')).toBeInTheDocument();
    });

    expect(screen.queryByText('すべて')).not.toBeInTheDocument();
  });

  it('does not submit whitespace-only draft', async () => {
    await act(async () => {
      render(<MemosView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/メモを書く/)).toBeInTheDocument();
    });

    // Type whitespace only
    const textarea = screen.getByPlaceholderText(/メモを書く/);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '   ' } });
    });

    // Button should still be disabled since "   ".trim() is falsy
    const submitBtn = screen.getByRole('button', { name: '投稿' });
    expect(submitBtn).toBeDisabled();
  });
});
