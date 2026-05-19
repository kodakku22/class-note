import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => {
    const dlg = {
      prompt: vi.fn().mockResolvedValue(null),
      confirm: vi.fn().mockResolvedValue(false),
      alert: vi.fn().mockResolvedValue(undefined),
    };
    return [dlg, null];
  },
}));

import { ProgressDashboard } from '../../src/components/progress/ProgressDashboard';

const SAMPLE_DASHBOARD = {
  papers: {
    total: 10,
    byStatus: { 'to-read': 3, reading: 4, read: 3 },
    recent: [
      { filePath: '/vault/papers/attention.md', title: 'Attention Is All You Need' },
    ],
  },
  books: {
    total: 5,
    byStatus: { reading: 2, read: 3 },
    recent: [
      { filePath: '/vault/books/deeplearning.md', title: 'Deep Learning' },
    ],
  },
  lectures: {
    subjects: 3,
    notes: 15,
    recent: [
      { filePath: '/vault/Math/notes/calc.md', title: 'Calculus', subject: 'Math' },
    ],
  },
  wikiHealth: {
    orphanCount: 2,
    tagCount: 8,
    topTags: [
      { tag: 'ml', count: 5 },
      { tag: 'nlp', count: 3 },
    ],
  },
  deadlines: [
    { id: 'd1', name: 'NeurIPS 2026', due: '2026-12-01', days: 200 },
    { id: 'd2', name: 'ICML 2026', due: '2026-01-15', days: -120 },
  ],
  activity: [
    { date: '2026-05-01', count: 3 },
    { date: '2026-05-02', count: 0 },
    { date: '2026-05-03', count: 7 },
  ],
};

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  onOpenFile: vi.fn(),
};

describe('ProgressDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    DEFAULT_PROPS.onOpenFile = vi.fn();
    (window as any).api.research = {
      getDashboard: vi.fn().mockResolvedValue({ ok: true, dashboard: SAMPLE_DASHBOARD }),
      saveDeadlines: vi.fn().mockResolvedValue({ ok: true }),
    };
    (window as any).api.materials = {
      openUrl: vi.fn(),
    };
  });

  it('renders dashboard header', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('研究進捗ダッシュボード')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    (window as any).api.research.getDashboard = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ProgressDashboard {...DEFAULT_PROPS} />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('shows error state on failure', async () => {
    (window as any).api.research.getDashboard = vi.fn().mockResolvedValue({ ok: false, error: 'network error' });

    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/)).toBeInTheDocument();
    });
  });

  it('displays paper count', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });
    // Check "論文" label
    expect(screen.getAllByText('論文').length).toBeGreaterThan(0);
  });

  it('displays book count', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('displays subject count', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('displays deadlines', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('NeurIPS 2026')).toBeInTheDocument();
      expect(screen.getByText('ICML 2026')).toBeInTheDocument();
    });
  });

  it('shows days remaining for future deadline', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('あと 200 日')).toBeInTheDocument();
    });
  });

  it('shows days past for past deadline', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('120 日前')).toBeInTheDocument();
    });
  });

  it('displays recent papers', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Attention Is All You Need/)).toBeInTheDocument();
    });
  });

  it('displays recent books', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Deep Learning/)).toBeInTheDocument();
    });
  });

  it('displays recent lectures', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Calculus/)).toBeInTheDocument();
    });
  });

  it('calls onOpenFile when clicking recent paper', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Attention Is All You Need/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Attention Is All You Need/));
    expect(DEFAULT_PROPS.onOpenFile).toHaveBeenCalledWith('/vault/papers/attention.md');
  });

  it('displays wiki health metrics', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('孤立ノート')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('ユニークタグ')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('displays activity heatmap', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/90 日間のアクティビティ/)).toBeInTheDocument();
    });
  });

  it('shows total activity count', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      // 3 + 0 + 7 = 10
      expect(screen.getByText(/10 回の作成・更新/)).toBeInTheDocument();
    });
  });

  it('shows empty deadlines message', async () => {
    const emptyDashboard = { ...SAMPLE_DASHBOARD, deadlines: [] };
    (window as any).api.research.getDashboard = vi.fn().mockResolvedValue({ ok: true, dashboard: emptyDashboard });

    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/登録された deadline がありません/)).toBeInTheDocument();
    });
  });

  it('shows status breakdown for papers', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/reading: 4/)).toBeInTheDocument();
    });
  });

  it('shows top tags', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/ml\(5\)/)).toBeInTheDocument();
    });
  });

  it('reloads when reloadKey changes', async () => {
    const { rerender } = await act(async () =>
      render(<ProgressDashboard {...DEFAULT_PROPS} reloadKey={1} />)
    );

    await waitFor(() => {
      expect((window as any).api.research.getDashboard).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender(<ProgressDashboard {...DEFAULT_PROPS} reloadKey={2} />);
    });

    await waitFor(() => {
      expect((window as any).api.research.getDashboard).toHaveBeenCalledTimes(2);
    });
  });
});
