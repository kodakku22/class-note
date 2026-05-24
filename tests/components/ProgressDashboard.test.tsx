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

  it('renders the 今週の進捗 sparkbar section header', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('今週の進捗')).toBeInTheDocument();
    });
  });

  it('displays the papers reviewed sparkbar row', async () => {
    // SAMPLE_DASHBOARD: papers byStatus { 'to-read': 3, reading: 4, read: 3 }.
    // reviewed = read + cited + skimmed = 3 + 0 + 0 = 3 ; total = 10.
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('論文の精読')).toBeInTheDocument();
    });
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('displays the books read sparkbar row', async () => {
    // SAMPLE_DASHBOARD: books byStatus { reading: 2, read: 3 }.
    // active = reading + done = 2 + 0 = 2 ; total = 5.
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('書籍の読書')).toBeInTheDocument();
    });
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('renders 5 sparkbar rows in chart-palette order', async () => {
    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('今週の進捗')).toBeInTheDocument();
    });
    const rows = document.querySelectorAll('.progress-row-l');
    expect(rows.length).toBe(5);
    // Order: 論文 / 書籍 / Wiki / 締切 / 直近 7 日
    const labels = Array.from(rows).map((r) => r.querySelector('.label')?.textContent ?? '');
    expect(labels[0]).toContain('論文の精読');
    expect(labels[1]).toContain('書籍の読書');
    expect(labels[2]).toContain('Wiki 健全度');
    expect(labels[3]).toContain('締切に余裕');
    expect(labels[4]).toContain('直近 7 日の活動');
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

  it('shows full Wiki health when no orphans', async () => {
    // Wiki health heuristic: 100 - orphanCount * 5, floored at 0. With
    // zero orphans the bar reads "100 %".
    const dashboard = {
      ...SAMPLE_DASHBOARD,
      wikiHealth: { orphanCount: 0, tagCount: 8, topTags: [] },
    };
    (window as any).api.research.getDashboard = vi
      .fn()
      .mockResolvedValue({ ok: true, dashboard });

    await act(async () => {
      render(<ProgressDashboard {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('100 %')).toBeInTheDocument();
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
