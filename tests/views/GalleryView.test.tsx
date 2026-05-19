import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock child components
vi.mock('../../src/components/cards/NoteCard', () => ({
  NoteCard: ({ fileName, onOpen }: { fileName: string; onOpen: () => void }) => (
    <div data-testid="note-card" onClick={onOpen}>{fileName.replace(/\.md$/, '')}</div>
  ),
}));
vi.mock('../../src/components/cards/MaterialCard', () => ({
  MaterialCard: ({ fileName, onOpen }: { fileName: string; onOpen: () => void }) => (
    <div data-testid="material-card" onClick={onOpen}>{fileName}</div>
  ),
}));

import { GalleryView } from '../../src/views/GalleryView';

type EnrichedFile = {
  name: string;
  path: string;
  kind: 'note' | 'pdf' | 'image' | 'office' | 'other';
  ext: string;
  mtime: number;
  meta?: Record<string, unknown>;
  preview?: string;
};

const SAMPLE_NOTES: EnrichedFile[] = [
  { name: 'Calc.md', path: '/vault/Math/notes/Calc.md', kind: 'note', ext: '.md', mtime: 3000, meta: { type: 'lecture' }, preview: 'calculus' },
  { name: 'Summary.md', path: '/vault/Math/notes/Summary.md', kind: 'note', ext: '.md', mtime: 2000, meta: { type: 'summary' }, preview: 'summary' },
  { name: 'Free.md', path: '/vault/Math/notes/Free.md', kind: 'note', ext: '.md', mtime: 1000, preview: 'free note' },
];

const SAMPLE_MATERIALS: EnrichedFile[] = [
  { name: 'diagram.png', path: '/vault/Math/materials/diagram.png', kind: 'image', ext: '.png', mtime: 1500 },
];

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  subject: 'Math',
  reloadKey: 0,
  onOpenFile: vi.fn(),
  onChanged: vi.fn(),
};

describe('GalleryView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      listFilesEnriched: vi.fn().mockResolvedValue({ notes: SAMPLE_NOTES, materials: SAMPLE_MATERIALS }),
      readNote: vi.fn().mockResolvedValue('---\ncolor: blue\n---\ncontent'),
      writeNote: vi.fn().mockResolvedValue({ ok: true }),
      renameNote: vi.fn().mockResolvedValue({ ok: true }),
    };
    DEFAULT_PROPS.onOpenFile = vi.fn();
    DEFAULT_PROPS.onChanged = vi.fn();
  });

  it('renders gallery header with subject name', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Math')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', async () => {
    (window as any).api.vault.listFilesEnriched = vi.fn().mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('shows note cards after loading', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calc')).toBeInTheDocument();
    });
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('shows material cards after loading', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument();
    });
  });

  it('calls onOpenFile when clicking note card', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calc')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calc'));
    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalledWith('/vault/Math/notes/Calc.md', 'note');
  });

  it('calls onOpenFile when clicking material card', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('diagram.png')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('diagram.png'));
    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalledWith('/vault/Math/materials/diagram.png', 'image');
  });

  it('shows empty state when no notes and no materials', async () => {
    (window as any).api.vault.listFilesEnriched = vi.fn().mockResolvedValue({ notes: [], materials: [] });

    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/この科目にはまだノートがありません/)).toBeInTheDocument();
    });
  });

  it('filters notes by type', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calc')).toBeInTheDocument();
    });

    // Select filter for "summary" type
    const filterSelect = screen.getAllByRole('combobox')[0]; // first select is filter
    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: 'summary' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.queryByText('Calc')).not.toBeInTheDocument();
    });
  });

  it('filters notes with "free" type (no type)', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calc')).toBeInTheDocument();
    });

    const filterSelect = screen.getAllByRole('combobox')[0];
    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: 'free' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.queryByText('Calc')).not.toBeInTheDocument();
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });
  });

  it('changes sort order', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calc')).toBeInTheDocument();
    });

    // Default is mtime-desc, switch to title-asc
    const sortSelect = screen.getAllByRole('combobox')[1];
    await act(async () => {
      fireEvent.change(sortSelect, { target: { value: 'title-asc' } });
    });

    // Notes should now be sorted by name
    const cards = screen.getAllByTestId('note-card');
    expect(cards[0].textContent).toBe('Calc');
    expect(cards[1].textContent).toBe('Free');
    expect(cards[2].textContent).toBe('Summary');
  });

  it('sorts by mtime ascending', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calc')).toBeInTheDocument();
    });

    const sortSelect = screen.getAllByRole('combobox')[1];
    await act(async () => {
      fireEvent.change(sortSelect, { target: { value: 'mtime-asc' } });
    });

    const cards = screen.getAllByTestId('note-card');
    // mtime order: Free(1000), Summary(2000), Calc(3000)
    expect(cards[0].textContent).toBe('Free');
    expect(cards[1].textContent).toBe('Summary');
    expect(cards[2].textContent).toBe('Calc');
  });

  it('shows note and material counts', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/ノート 3/)).toBeInTheDocument();
      expect(screen.getByText(/資料 1/)).toBeInTheDocument();
    });
  });

  it('reloads data when reloadKey changes', async () => {
    const { rerender } = await act(async () =>
      render(<GalleryView {...DEFAULT_PROPS} reloadKey={1} />)
    );

    await waitFor(() => {
      expect((window as any).api.vault.listFilesEnriched).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender(<GalleryView {...DEFAULT_PROPS} reloadKey={2} />);
    });

    await waitFor(() => {
      expect((window as any).api.vault.listFilesEnriched).toHaveBeenCalledTimes(2);
    });
  });

  it('shows section labels', async () => {
    await act(async () => {
      render(<GalleryView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('ノート')).toBeInTheDocument();
      expect(screen.getByText('資料')).toBeInTheDocument();
    });
  });
});
