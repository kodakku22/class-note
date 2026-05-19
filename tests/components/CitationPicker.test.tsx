import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CitationPicker } from '../../src/components/papers/CitationPicker';

const SAMPLE_ITEMS = [
  { bibkey: 'vaswani2017attention', title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017 },
  { bibkey: 'devlin2019bert', title: 'BERT: Pre-training', authors: 'Devlin et al.', year: 2019 },
  { bibkey: 'brown2020gpt3', title: 'Language Models are Few-Shot Learners', authors: 'Brown et al.', year: 2020 },
];

describe('CitationPicker', () => {
  const onClose = vi.fn();
  const onInsert = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockClear();
    onInsert.mockClear();
    (window as any).api.papers = {
      listForCitation: vi.fn().mockResolvedValue(SAMPLE_ITEMS),
    };
  });

  it('renders search input', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    expect(screen.getByPlaceholderText(/タイトル.*著者.*bibkey/)).toBeInTheDocument();
  });

  it('loads and shows citation items', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
      expect(screen.getByText('BERT: Pre-training')).toBeInTheDocument();
    });
  });

  it('shows bibkeys with @ prefix', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('@vaswani2017attention')).toBeInTheDocument();
    });
  });

  it('shows years', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('2017')).toBeInTheDocument();
      expect(screen.getByText('2019')).toBeInTheDocument();
    });
  });

  it('shows authors', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Vaswani et al.')).toBeInTheDocument();
    });
  });

  it('filters items by query', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/タイトル.*著者.*bibkey/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bert' } });
    });

    expect(screen.getByText('BERT: Pre-training')).toBeInTheDocument();
    expect(screen.queryByText('Attention Is All You Need')).not.toBeInTheDocument();
  });

  it('shows empty state when no items match', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/タイトル.*著者.*bibkey/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyznonexistent' } });
    });

    expect(screen.getByText('該当なし')).toBeInTheDocument();
  });

  it('shows empty state when no papers exist', async () => {
    (window as any).api.papers.listForCitation = vi.fn().mockResolvedValue([]);

    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/bibkey 付きの論文がまだありません/)).toBeInTheDocument();
    });
  });

  it('inserts citation on click', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Attention Is All You Need'));
    });

    expect(onInsert).toHaveBeenCalledWith('[@vaswani2017attention]');
    expect(onClose).toHaveBeenCalled();
  });

  it('inserts citation on Enter', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Enter' });
    });

    expect(onInsert).toHaveBeenCalledWith('[@vaswani2017attention]');
  });

  it('navigates with ArrowDown', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    });

    // The second item should now be active (aria-selected="true")
    const activeOption = document.querySelector('[aria-selected="true"]');
    expect(activeOption).toBeInTheDocument();
    expect(activeOption?.textContent).toContain('devlin2019bert');
  });

  it('navigates with ArrowUp', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');

    // Move down first then up
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    });

    // Should be back at the first item
    const footer = document.querySelector('.citation-picker-footer');
    expect(footer?.textContent).toContain('vaswani2017attention');
  });

  it('closes on Escape', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    const { container } = await act(async () => {
      return render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    const overlay = container.querySelector('.modal-overlay');
    if (overlay) {
      await act(async () => {
        fireEvent.click(overlay);
      });
    }

    expect(onClose).toHaveBeenCalled();
  });

  it('shows footer hints', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/↑↓ 選択/)).toBeInTheDocument();
    });
  });

  it('resets active index when query changes', async () => {
    await act(async () => {
      render(<CitationPicker vaultPath="/vault" onClose={onClose} onInsert={onInsert} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    // Move down
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    });

    // Type query to reset index
    const input = screen.getByPlaceholderText(/タイトル.*著者.*bibkey/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
    });

    // Active index should reset to 0
    const firstOption = document.querySelector('[aria-selected="true"]');
    expect(firstOption).toBeInTheDocument();
  });
});
