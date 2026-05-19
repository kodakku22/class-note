import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock Dialog
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    {
      alert: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
      prompt: vi.fn().mockResolvedValue('generic'),
    },
    null,
  ],
}));

// Mock PaperFilterBar
vi.mock('../../src/components/papers/PaperFilterBar', () => ({
  PaperFilterBar: ({ filters, onChange, availableTags }: any) => (
    <div data-testid="filter-bar">
      <input
        data-testid="query-input"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
      />
    </div>
  ),
}));

// Mock PaperImportDialog
vi.mock('../../src/components/papers/PaperImportDialog', () => ({
  PaperImportDialog: ({ onClose }: any) => (
    <div data-testid="import-dialog"><button onClick={onClose}>close</button></div>
  ),
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { PapersView } from '../../src/components/papers/PapersView';
import type { PaperEntry } from '../../src/types';

const SAMPLE_PAPERS: PaperEntry[] = [
  {
    filePath: '/vault/_papers/attention.md',
    fileName: 'attention.md',
    mtime: 1000,
    meta: {
      title: 'Attention Is All You Need',
      authors: ['Vaswani', 'Shazeer'],
      year: 2017,
      venue: 'NeurIPS',
      status: 'read',
      tags: ['transformer', 'nlp'],
      bibkey: 'vaswani2017',
    },
    bodyPreview: 'A preview of the paper...',
  },
  {
    filePath: '/vault/_papers/bert.md',
    fileName: 'bert.md',
    mtime: 2000,
    meta: {
      title: 'BERT: Pre-training',
      authors: ['Devlin', 'Chang'],
      year: 2019,
      venue: 'NAACL',
      status: 'to-read',
      tags: ['nlp'],
      bibkey: 'devlin2019',
    },
    bodyPreview: 'BERT preview...',
  },
  {
    filePath: '/vault/_papers/gpt3.md',
    fileName: 'gpt3.md',
    mtime: 3000,
    meta: {
      title: 'Language Models are Few-Shot Learners',
      authors: 'Brown et al.',
      year: 2020,
      venue: 'NeurIPS',
      status: 'reading',
      tags: ['llm'],
    },
    bodyPreview: 'GPT-3 preview...',
  },
];

describe('PapersView', () => {
  const onOpenFile = vi.fn();
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onOpenFile.mockClear();
    onChanged.mockClear();
    (window as any).api = {
      papers: {
        list: vi.fn().mockResolvedValue(SAMPLE_PAPERS),
        delete: vi.fn().mockResolvedValue({ ok: true }),
        create: vi.fn().mockResolvedValue({ ok: true, filePath: '/vault/_papers/new.md' }),
        pickBibtexFile: vi.fn().mockResolvedValue(null),
        importFromBibtex: vi.fn().mockResolvedValue({ ok: true, imported: 1, skipped: 0, errors: [], filePaths: [] }),
        exportBibtex: vi.fn().mockResolvedValue({ ok: true, count: 3, filePath: '/vault/refs.bib', skipped: 0 }),
      },
      materials: {
        revealInFolder: vi.fn(),
      },
      ai: {
        summarizeAndApply: vi.fn().mockResolvedValue({ ok: true, result: { oneLiner: 'Sum' } }),
        autoTag: vi.fn().mockResolvedValue({ ok: true, result: { tags: ['ml'], reasoning: 'R' } }),
        applyTags: vi.fn().mockResolvedValue({ ok: true }),
        learningCoachAndSave: vi.fn().mockResolvedValue({ ok: true, result: { diagnosis: 'D' } }),
      },
      latex: {
        exportNote: vi.fn().mockResolvedValue({ ok: true, texPath: '/out/main.tex', usedPandoc: true }),
      },
    };
  });

  it('renders header', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    expect(screen.getByText(/論文・文献/)).toBeInTheDocument();
  });

  it('shows paper count', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText(/3\/3 件/)).toBeInTheDocument();
    });
  });

  it('renders paper titles', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
      expect(screen.getByText('BERT: Pre-training')).toBeInTheDocument();
    });
  });

  it('shows first author', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Vaswani et al.')).toBeInTheDocument();
    });
  });

  it('shows years', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('2017')).toBeInTheDocument();
      expect(screen.getByText('2019')).toBeInTheDocument();
    });
  });

  it('shows venues', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      const venues = screen.getAllByText('NeurIPS');
      expect(venues.length).toBeGreaterThan(0);
    });
  });

  it('shows status labels', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('read')).toBeInTheDocument();
      expect(screen.getByText('to-read')).toBeInTheDocument();
      expect(screen.getByText('reading')).toBeInTheDocument();
    });
  });

  it('shows tags', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('transformer')).toBeInTheDocument();
      expect(screen.getByText('llm')).toBeInTheDocument();
    });
  });

  it('opens file on row click', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Attention Is All You Need'));
    });
    expect(onOpenFile).toHaveBeenCalledWith('/vault/_papers/attention.md');
  });

  it('shows sortable column headers', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('タイトル')).toBeInTheDocument();
      expect(screen.getByText('著者')).toBeInTheDocument();
      expect(screen.getByText('年')).toBeInTheDocument();
      expect(screen.getByText('ステータス')).toBeInTheDocument();
    });
  });

  it('shows import and export buttons', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    expect(screen.getByText(/📥 取込/)).toBeInTheDocument();
    expect(screen.getByText(/BibTeX 書出/)).toBeInTheDocument();
    expect(screen.getByText('+ 論文を追加')).toBeInTheDocument();
  });

  it('shows empty state when no papers', async () => {
    (window as any).api.papers.list = vi.fn().mockResolvedValue([]);
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('まだ論文がありません')).toBeInTheDocument();
    });
  });

  it('shows filter bar', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    (window as any).api.papers.list = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('shows context menu on right-click', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('Attention Is All You Need'));
    });
    expect(screen.getByText('開く')).toBeInTheDocument();
    expect(screen.getByText(/削除/)).toBeInTheDocument();
  });

  it('sorts by title when clicking column header', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('タイトル')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('タイトル'));
    });
    const rows = document.querySelectorAll('.papers-row:not(.papers-header-row)');
    expect(rows.length).toBe(3);
  });

  it('handles string authors (not array)', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Brown et al.')).toBeInTheDocument();
    });
  });

  it('shows "最初の論文を追加" button on empty state', async () => {
    (window as any).api.papers.list = vi.fn().mockResolvedValue([]);
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('最初の論文を追加')).toBeInTheDocument();
    });
  });

  it('opens import dialog on import button click', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/📥 取込/));
    });
    expect(screen.getByTestId('import-dialog')).toBeInTheDocument();
  });

  it('opens create dialog on add button click', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('+ 論文を追加'));
    });
    expect(screen.getByText('📑 論文を追加')).toBeInTheDocument();
  });

  it('shows sort arrow after clicking a column header', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('タイトル')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('年'));
    });
    const arrows = document.querySelectorAll('.sort-arrow');
    expect(arrows.length).toBe(1);
  });

  it('highlights active paper row', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} activeFilePath="/vault/_papers/attention.md" />);
    });
    await waitFor(() => {
      const activeRows = document.querySelectorAll('.papers-row.active');
      expect(activeRows.length).toBe(1);
    });
  });

  it('shows grid role', async () => {
    await act(async () => {
      render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });
  });
});
