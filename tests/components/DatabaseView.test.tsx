import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock ContextMenu and Dialog
vi.mock('../../src/components/common/ContextMenu', () => ({
  ContextMenu: ({ items, onClose }: { items: Array<{ id: string; label: string; onSelect: () => void }>; onClose: () => void }) => (
    <div data-testid="context-menu">
      {items.map((item) => (
        <button key={item.id} onClick={item.onSelect}>
          {item.label}
        </button>
      ))}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { DatabaseView } from '../../src/components/DatabaseView';

type EnrichedFile = {
  name: string;
  path: string;
  kind: 'note';
  ext: string;
  mtime: number;
  meta?: Record<string, unknown>;
  preview?: string;
};

const SAMPLE_NOTES: EnrichedFile[] = [
  {
    name: 'Note1.md',
    path: '/vault/math/notes/Note1.md',
    kind: 'note',
    ext: '.md',
    mtime: 3000,
    meta: { type: 'lecture', status: 'draft', tags: ['calc'], rating: 4 },
    preview: 'First note content',
  },
  {
    name: 'Note2.md',
    path: '/vault/math/notes/Note2.md',
    kind: 'note',
    ext: '.md',
    mtime: 2000,
    meta: { type: 'exercise', status: 'done', tags: ['algebra'] },
    preview: 'Second note',
  },
  {
    name: 'Note3.md',
    path: '/vault/math/notes/Note3.md',
    kind: 'note',
    ext: '.md',
    mtime: 1000,
    meta: { type: 'lecture', status: 'draft' },
    preview: 'Third note',
  },
];

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  subject: 'Math',
  onOpenFile: vi.fn(),
};

function installMocks(options?: {
  notes?: EnrichedFile[];
  materials?: EnrichedFile[];
}) {
  const listFilesEnrichedMock = vi.fn().mockResolvedValue({
    notes: options?.notes ?? SAMPLE_NOTES,
    materials: options?.materials ?? [],
  });
  const listSubjectsMock = vi.fn().mockResolvedValue(['Math', 'Physics']);
  const revealInFolderMock = vi.fn().mockResolvedValue({ ok: true });
  const summarizeAndApplyMock = vi.fn().mockResolvedValue({
    ok: true,
    result: { oneLiner: 'Summary text' },
  });

  const origApi = window.api;
  const apiOverrides: Record<string, unknown> = {
    vault: {
      listFilesEnriched: listFilesEnrichedMock,
      listSubjects: listSubjectsMock,
    },
    materials: {
      revealInFolder: revealInFolderMock,
    },
    ai: {
      summarizeAndApply: summarizeAndApplyMock,
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

  return {
    listFilesEnrichedMock,
    listSubjectsMock,
    revealInFolderMock,
    summarizeAndApplyMock,
    origApi,
  };
}

describe('DatabaseView', () => {
  let mocks: ReturnType<typeof installMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = installMocks();
  });

  afterEach(() => {
    (window as Record<string, unknown>).api = mocks.origApi;
  });

  it('renders the database header', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('📊 Database')).toBeInTheDocument();
    });
  });

  it('shows row count', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('3/3 件')).toBeInTheDocument();
    });
  });

  it('renders rows with note names', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });
    expect(screen.getByText('Note2')).toBeInTheDocument();
    expect(screen.getByText('Note3')).toBeInTheDocument();
  });

  it('shows column headers', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Default columns: type, status, tags, rating
    expect(screen.getByRole('button', { name: /名前/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /更新/ })).toBeInTheDocument();
  });

  it('calls onOpenFile when clicking a row', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Note1'));
    });

    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalledWith('/vault/math/notes/Note1.md');
  });

  it('shows empty state when no notes', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks({ notes: [] });

    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('該当ノートがありません')).toBeInTheDocument();
    });
  });

  it('sorts by column when clicking header', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Click "名前" to sort by fileName
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /名前/ }));
    });

    // Should show sort indicator
    const nameBtn = screen.getByRole('button', { name: /名前/ });
    expect(nameBtn.textContent).toMatch(/▼|▲/);
  });

  it('toggles sort direction on repeated clicks', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Click fileName header to sort desc
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /名前/ }));
    });

    let nameBtn = screen.getByRole('button', { name: /名前/ });
    expect(nameBtn.textContent).toContain('▼');

    // Click again to sort asc
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /名前/ }));
    });

    nameBtn = screen.getByRole('button', { name: /名前/ });
    expect(nameBtn.textContent).toContain('▲');
  });

  it('filters by frontmatter field', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Select a filter field
    const filterSelect = screen.getByLabelText('フィルタフィールド');

    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: 'status' } });
    });

    // Now the filter value input should appear
    const filterInput = screen.getByLabelText('フィルタ値');

    await act(async () => {
      fireEvent.change(filterInput, { target: { value: 'done' } });
    });

    // Only Note2 has status 'done'
    await waitFor(() => {
      expect(screen.getByText('Note2')).toBeInTheDocument();
      expect(screen.queryByText('Note1')).not.toBeInTheDocument();
      expect(screen.queryByText('Note3')).not.toBeInTheDocument();
    });
  });

  it('shows filtered row count', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Filter
    const filterSelect = screen.getByLabelText('フィルタフィールド');

    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: 'status' } });
    });

    const filterInput = screen.getByLabelText('フィルタ値');

    await act(async () => {
      fireEvent.change(filterInput, { target: { value: 'done' } });
    });

    await waitFor(() => {
      expect(screen.getByText('1/3 件')).toBeInTheDocument();
    });
  });

  it('loads all subjects when subject prop is null', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks();

    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} subject={null} />);
    });

    await waitFor(() => {
      expect(mocks.listSubjectsMock).toHaveBeenCalledWith('/vault');
    });
  });

  it('displays formatted cell values for arrays', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      // tags: ['calc'] should show as "calc"
      expect(screen.getByText('calc')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', async () => {
    // Delay the mock resolution
    (window as Record<string, unknown>).api = mocks.origApi;
    const origApi = window.api;
    let resolveList: ((v: unknown) => void) | null = null;
    const apiOverrides: Record<string, unknown> = {
      vault: {
        listFilesEnriched: () =>
          new Promise((r) => {
            resolveList = r;
          }),
        listSubjects: vi.fn().mockResolvedValue([]),
      },
    };

    (window as Record<string, unknown>).api = new Proxy(origApi, {
      get(target, prop) {
        if (typeof prop === 'string' && prop in apiOverrides) return apiOverrides[prop];
        return (target as Record<string | symbol, unknown>)[prop];
      },
    });

    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();

    // Resolve to avoid warnings
    await act(async () => {
      resolveList?.({ notes: [], materials: [] });
    });

    (window as Record<string, unknown>).api = origApi;
  });

  it('renders column values in table cells', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      // Should show type values
      expect(screen.getAllByText('lecture').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('exercise')).toBeInTheDocument();
    });
  });

  it('shows context menu on right click', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Right-click on a row
    const rows = screen.getAllByRole('row');
    // rows[0] is header, rows[1] is first data row
    await act(async () => {
      fireEvent.contextMenu(rows[1]);
    });

    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    expect(screen.getByText('開く')).toBeInTheDocument();
    expect(screen.getByText('フォルダで表示')).toBeInTheDocument();
    expect(screen.getByText('AI で要約')).toBeInTheDocument();
  });

  it('opens file from context menu', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    await act(async () => {
      fireEvent.contextMenu(rows[1]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('開く'));
    });

    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalled();
  });

  it('reveals in folder from context menu', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    await act(async () => {
      fireEvent.contextMenu(rows[1]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('フォルダで表示'));
    });

    expect(mocks.revealInFolderMock).toHaveBeenCalled();
  });

  it('formats mtime as Japanese date', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // mtime: 3000 => new Date(3000).toLocaleDateString('ja-JP')
    const dateStr = new Date(3000).toLocaleDateString('ja-JP');
    const dateEls = screen.getAllByText(dateStr);
    expect(dateEls.length).toBeGreaterThan(0);
  });

  it('renders with custom columns prop', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} columns={['type', 'status']} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note1')).toBeInTheDocument();
    });

    // Should show type and status columns but not tags/rating column headers
    const headerButtons = screen.getAllByRole('button').filter((b) =>
      b.classList.contains('database-cell')
    );
    const headerTexts = headerButtons.map((b) => b.textContent?.trim());
    expect(headerTexts).toContain('type');
    expect(headerTexts).toContain('status');
  });

  it('uses materials subdir when specified', async () => {
    await act(async () => {
      render(<DatabaseView {...DEFAULT_PROPS} subdir="materials" />);
    });

    await waitFor(() => {
      expect(mocks.listFilesEnrichedMock).toHaveBeenCalledWith('/vault', 'Math');
    });
  });

  it('reloads on reloadKey change', async () => {
    const { rerender } = await act(async () =>
      render(<DatabaseView {...DEFAULT_PROPS} reloadKey={1} />)
    );

    await waitFor(() => {
      expect(mocks.listFilesEnrichedMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender(<DatabaseView {...DEFAULT_PROPS} reloadKey={2} />);
    });

    await waitFor(() => {
      expect(mocks.listFilesEnrichedMock).toHaveBeenCalledTimes(2);
    });
  });
});
