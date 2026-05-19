import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock heavy child components
vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));
vi.mock('../../src/components/WikiCompilePanel', () => ({
  WikiCompilePanel: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="wiki-compile-panel">
      <button onClick={onComplete}>Complete</button>
    </div>
  ),
}));

import { WikiView } from '../../src/components/WikiView';

type WikiPage = { name: string; filePath: string; mtime: number };

const SAMPLE_PAGES: WikiPage[] = [
  { name: 'Calculus.md', filePath: '/vault/wiki/Calculus.md', mtime: 1000 },
  { name: 'LinearAlgebra.md', filePath: '/vault/wiki/LinearAlgebra.md', mtime: 2000 },
  { name: 'Topology.md', filePath: '/vault/wiki/Topology.md', mtime: 3000 },
];

const SAMPLE_INDEX = '# Wiki Index\n\n- [[Calculus]]\n- [[LinearAlgebra]]';

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  onJumpToWikilink: vi.fn(),
  onOpenFile: vi.fn(),
};

function installMocks(options?: {
  pages?: WikiPage[];
  index?: string | null;
}) {
  const listMock = vi.fn().mockResolvedValue(options?.pages ?? SAMPLE_PAGES);
  const readIndexMock = vi.fn().mockResolvedValue(options && 'index' in options ? options.index : SAMPLE_INDEX);
  const importFromQALogsMock = vi.fn().mockResolvedValue({ ok: true, imported: ['Math'] });
  const healthCheckMock = vi.fn().mockResolvedValue({
    ok: true,
    reportPath: '/vault/wiki/_health.md',
  });

  const origApi = window.api;
  const apiOverrides: Record<string, unknown> = {
    wiki: {
      list: listMock,
      readIndex: readIndexMock,
      importFromQALogs: importFromQALogsMock,
      healthCheck: healthCheckMock,
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

  return { listMock, readIndexMock, importFromQALogsMock, healthCheckMock, origApi };
}

describe('WikiView', () => {
  let mocks: ReturnType<typeof installMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = installMocks();
  });

  afterEach(() => {
    (window as Record<string, unknown>).api = mocks.origApi;
  });

  it('renders the wiki header', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Wiki');
    });
  });

  it('shows wiki subtitle', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/AI が整理した知識ベース/)).toBeInTheDocument();
    });
  });

  it('lists wiki pages', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });
    expect(screen.getByText('LinearAlgebra')).toBeInTheDocument();
    expect(screen.getByText('Topology')).toBeInTheDocument();
  });

  it('renders the wiki index via MarkdownRenderer', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      const renderer = screen.getByTestId('markdown-renderer');
      expect(renderer).toHaveTextContent('Wiki Index');
    });
  });

  it('calls onOpenFile when clicking a page', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Calculus'));
    });

    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalledWith('/vault/wiki/Calculus.md');
  });

  it('shows empty state when no pages and no index', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks({ pages: [], index: null });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Wiki がまだありません')).toBeInTheDocument();
    });
  });

  it('shows compile CTA button in empty state', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks({ pages: [], index: null });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      // There are two buttons with "Wiki をコンパイル" — one in the header and one
      // in the empty-state CTA. The CTA has the "primary" class.
      const btns = screen.getAllByRole('button', { name: /Wiki をコンパイル/ });
      expect(btns.length).toBeGreaterThanOrEqual(2);
      const primaryBtn = btns.find((b) => b.classList.contains('primary'));
      expect(primaryBtn).toBeTruthy();
    });
  });

  it('toggles the compile panel', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    // Click compile button in header
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ }));
    });

    expect(screen.getByTestId('wiki-compile-panel')).toBeInTheDocument();

    // Click again to close
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    });

    expect(screen.queryByTestId('wiki-compile-panel')).not.toBeInTheDocument();
  });

  it('handles QA log import', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /QA ログから取込/ }));
    });

    await waitFor(() => {
      expect(mocks.importFromQALogsMock).toHaveBeenCalledWith('/vault');
    });

    await waitFor(() => {
      expect(screen.getByText(/1 科目分の QA ログを Wiki に取り込みました/)).toBeInTheDocument();
    });
  });

  it('shows message when no QA logs to import', async () => {
    mocks.importFromQALogsMock.mockResolvedValue({ ok: true, imported: [] });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /QA ログから取込/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/インポート対象の QA ログがありませんでした/)).toBeInTheDocument();
    });
  });

  it('shows error message when QA import fails', async () => {
    mocks.importFromQALogsMock.mockResolvedValue({ ok: false });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /QA ログから取込/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/インポート失敗/)).toBeInTheDocument();
    });
  });

  it('handles health check', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ヘルスチェック/ }));
    });

    await waitFor(() => {
      expect(mocks.healthCheckMock).toHaveBeenCalledWith('/vault');
    });

    await waitFor(() => {
      expect(screen.getByText(/ヘルスチェックレポートを生成しました/)).toBeInTheDocument();
    });

    // Should open the report file
    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalledWith('/vault/wiki/_health.md');
  });

  it('shows error when health check fails', async () => {
    mocks.healthCheckMock.mockResolvedValue({ ok: false, error: 'no files' });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ヘルスチェック/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/no files/)).toBeInTheDocument();
    });
  });

  it('calls list and readIndex on mount', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    expect(mocks.listMock).toHaveBeenCalledWith('/vault');
    expect(mocks.readIndexMock).toHaveBeenCalledWith('/vault');
  });

  it('shows pages section label', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('ページ')).toBeInTheDocument();
    });
  });

  it('renders pages without .md extension', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      // The component strips .md from the display name
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });
    // Should NOT show the .md extension in display
    expect(screen.queryByText('Calculus.md')).not.toBeInTheDocument();
  });

  it('opens compile panel from empty state CTA', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks({ pages: [], index: null });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Wiki がまだありません')).toBeInTheDocument();
    });

    // Click the primary CTA button (the one inside the empty state)
    const btns = screen.getAllByRole('button', { name: /Wiki をコンパイル/ });
    const primaryBtn = btns.find((b) => b.classList.contains('primary'));
    expect(primaryBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(primaryBtn!);
    });

    expect(screen.getByTestId('wiki-compile-panel')).toBeInTheDocument();
  });

  it('reloads after compile panel completes', async () => {
    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    // Open compile panel
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ }));
    });

    const callCountBefore = mocks.listMock.mock.calls.length;

    // Click "Complete" in the mock compile panel
    await act(async () => {
      fireEvent.click(screen.getByText('Complete'));
    });

    // Should have reloaded (called list again)
    expect(mocks.listMock.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('shows health check error without error message', async () => {
    mocks.healthCheckMock.mockResolvedValue({ ok: false });

    await act(async () => {
      render(<WikiView {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ヘルスチェック/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/不明なエラー/)).toBeInTheDocument();
    });
  });
});
