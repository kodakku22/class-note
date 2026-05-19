import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BooksView } from '../../src/components/BooksView';
import type { BookEntry } from '../../src/types';

const SAMPLE_BOOKS: BookEntry[] = [
  {
    filePath: '/vault/books/book-a.md',
    fileName: 'book-a.md',
    meta: {
      title: 'Book Alpha',
      author: 'Author A',
      status: 'reading',
      rating: 4,
      tags: ['fiction'],
    },
    bodyPreview: 'A great story...',
    mtime: 1000,
  },
  {
    filePath: '/vault/books/book-b.md',
    fileName: 'book-b.md',
    meta: {
      title: 'Book Beta',
      author: 'Author B',
      status: 'done',
      rating: 5,
      started: '2025-01-01',
      finished: '2025-02-01',
      tags: ['nonfiction'],
    },
    bodyPreview: 'Very informative.',
    mtime: 2000,
  },
  {
    filePath: '/vault/books/book-c.md',
    fileName: 'book-c.md',
    meta: {
      title: 'Book Gamma',
      status: 'want-to-read',
    },
    bodyPreview: '',
    mtime: 3000,
  },
];

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  onOpenBook: vi.fn(),
};

function installMocks(books: BookEntry[] = SAMPLE_BOOKS) {
  const listMock = vi.fn().mockResolvedValue(books);
  const createMock = vi.fn().mockResolvedValue({ ok: true, filePath: '/vault/books/new.md' });
  const updateMetaMock = vi.fn().mockResolvedValue({ ok: true });
  const deleteMock = vi.fn().mockResolvedValue({ ok: true });

  const origApi = window.api;

  const apiOverrides: Record<string, unknown> = {
    books: {
      list: listMock,
      create: createMock,
      updateMeta: updateMetaMock,
      delete: deleteMock,
    },
  };

  (window as Record<string, unknown>).api = new Proxy(origApi, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in apiOverrides) {
        return apiOverrides[prop];
      }
      return (target as Record<string | symbol, unknown>)[prop];
    },
  });

  return { listMock, createMock, updateMetaMock, deleteMock, origApi };
}

describe('BooksView', () => {
  let mocks: ReturnType<typeof installMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = installMocks();
  });

  afterEach(() => {
    (window as Record<string, unknown>).api = mocks.origApi;
  });

  it('renders the book list', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('Book Beta')).toBeInTheDocument();
    expect(screen.getByText('Book Gamma')).toBeInTheDocument();
  });

  it('shows the header', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('読書リスト');
    });
  });

  it('shows author names when available', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Author A')).toBeInTheDocument();
    });
    expect(screen.getByText('Author B')).toBeInTheDocument();
  });

  it('displays filter tabs with counts', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /すべて \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /読書中 \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /読みたい \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /読了 \(1\)/ })).toBeInTheDocument();
  });

  it('filters by status', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /読書中 \(1\)/ }));
    });

    expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Book Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('Book Gamma')).not.toBeInTheDocument();
  });

  it('shows empty state when no books exist', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks([]);

    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('まだ本がありません')).toBeInTheDocument();
    });
  });

  it('shows the add book button', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });
  });

  it('opens the add book modal', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    expect(screen.getByPlaceholderText(/君たちはどう生きるか/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/吉野源三郎/)).toBeInTheDocument();
  });

  it('creates a new book via the modal', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/君たちはどう生きるか/), {
        target: { value: 'New Book Title' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
    });

    expect(mocks.createMock).toHaveBeenCalledWith('/vault', 'New Book Title', undefined);
  });

  it('calls onOpenBook when clicking a book card', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Book Alpha'));
    });

    expect(DEFAULT_PROPS.onOpenBook).toHaveBeenCalledWith('/vault/books/book-a.md');
  });

  it('shows tags on book cards', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('#fiction')).toBeInTheDocument();
    });
    expect(screen.getByText('#nonfiction')).toBeInTheDocument();
  });

  it('shows body preview', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('A great story...')).toBeInTheDocument();
    });
  });

  it('creates book with author', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/君たちはどう生きるか/), {
        target: { value: 'Test Book' },
      });
      fireEvent.change(screen.getByPlaceholderText(/吉野源三郎/), {
        target: { value: 'Test Author' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
    });

    expect(mocks.createMock).toHaveBeenCalledWith('/vault', 'Test Book', 'Test Author');
  });

  it('cancels the add book modal', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    expect(screen.getByPlaceholderText(/君たちはどう生きるか/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    });

    expect(screen.queryByPlaceholderText(/君たちはどう生きるか/)).not.toBeInTheDocument();
  });

  it('submits via Enter key in title input', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    const titleInput = screen.getByPlaceholderText(/君たちはどう生きるか/);

    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Enter Book' } });
    });

    await act(async () => {
      fireEvent.keyDown(titleInput, { key: 'Enter' });
    });

    expect(mocks.createMock).toHaveBeenCalledWith('/vault', 'Enter Book', undefined);
  });

  it('does not submit empty title', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    // The add button should be disabled when title is empty
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
  });

  it('shows rating stars', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    // Each book card has 5 stars
    const stars = screen.getAllByText('★');
    expect(stars.length).toBeGreaterThanOrEqual(5);
  });

  it('clicks a star to update rating', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    // Find all stars — each book has 5
    const stars = screen.getAllByText('★');
    // Click the first star (belongs to first book)
    await act(async () => {
      fireEvent.click(stars[0]);
    });

    expect(mocks.updateMetaMock).toHaveBeenCalled();
  });

  it('deletes a book after confirmation', async () => {
    // Mock window.confirm to return true
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('削除');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(mocks.deleteMock).toHaveBeenCalledWith('/vault/books/book-a.md');
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('削除');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(mocks.deleteMock).not.toHaveBeenCalled();
  });

  it('shows delete failure alert', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    mocks.deleteMock.mockResolvedValue({ ok: false, error: 'File locked' });

    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('削除');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('File locked'));
    });
  });

  it('shows progress bar for books with totalPages', async () => {
    const booksWithProgress: BookEntry[] = [
      {
        filePath: '/vault/books/progress-book.md',
        fileName: 'progress-book.md',
        meta: {
          title: 'Progress Book',
          status: 'reading',
          totalPages: 200,
          currentPage: 100,
        },
        bodyPreview: '',
        mtime: 1000,
      },
    ];

    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks(booksWithProgress);

    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/100 \/ 200 ページ/)).toBeInTheDocument();
      expect(screen.getByText(/50%/)).toBeInTheDocument();
    });
  });

  it('shows started and finished dates', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/2025-01-01/)).toBeInTheDocument();
      expect(screen.getByText(/2025-02-01/)).toBeInTheDocument();
    });
  });

  it('shows filtered empty state with filter label', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    // Filter to done
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /読了 \(1\)/ }));
    });

    // Now filter to reading from done-filtered view won't show empty
    // Filter to want-to-read, which has one book
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /読みたい \(1\)/ }));
    });

    expect(screen.getByText('Book Gamma')).toBeInTheDocument();
  });

  it('opens status dropdown', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    // Find status badges with aria-haspopup
    const statusBadges = screen.getAllByRole('button', { name: /▾/ });
    expect(statusBadges.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(statusBadges[0]);
    });

    // Should show menu items
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBe(3);
  });

  it('changes book status via dropdown', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    // Open the status dropdown of the first book (reading)
    const statusBadges = screen.getAllByRole('button', { name: /▾/ });
    await act(async () => {
      fireEvent.click(statusBadges[0]);
    });

    // Click "読了" to change status
    const menuItems = screen.getAllByRole('menuitem');
    const doneItem = menuItems.find((item) => item.textContent?.includes('読了'));
    expect(doneItem).toBeDefined();

    await act(async () => {
      fireEvent.click(doneItem!);
    });

    expect(mocks.updateMetaMock).toHaveBeenCalledWith('/vault/books/book-a.md', { status: 'done' });
  });

  it('highlights active book card', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} activeFilePath="/vault/books/book-a.md" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Book Alpha')).toBeInTheDocument();
    });

    // The active book card should have the 'active' class
    const alphaCard = screen.getByText('Book Alpha').closest('.book-card');
    expect(alphaCard?.className).toContain('active');
  });

  it('closes modal when clicking overlay', async () => {
    await act(async () => {
      render(<BooksView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /本を追加/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /本を追加/ }));
    });

    expect(screen.getByPlaceholderText(/君たちはどう生きるか/)).toBeInTheDocument();

    // Click the overlay (the modal-overlay div)
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).toBeTruthy();

    await act(async () => {
      fireEvent.click(overlay!);
    });

    expect(screen.queryByPlaceholderText(/君たちはどう生きるか/)).not.toBeInTheDocument();
  });
});
