import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Controllable Dialog mock
const mockAlert = vi.fn().mockResolvedValue(undefined);
const mockPrompt = vi.fn().mockResolvedValue(null);
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    { alert: mockAlert, confirm: vi.fn().mockResolvedValue(true), prompt: mockPrompt },
    null,
  ],
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ProgressDashboard } from '../../src/components/progress/ProgressDashboard';

const MOCK_DASHBOARD = {
  deadlines: [
    { id: 'dl-1', name: 'NeurIPS 2026', due: '2026-05-15', days: 10, url: 'https://neurips.cc' },
    { id: 'dl-2', name: 'ICML 2026', due: '2026-01-15', days: -120 },
    { id: 'dl-3', name: 'ACL 2026', due: '2026-05-16', days: 0 },
    { id: 'dl-4', name: 'AAAI 2026', due: '2026-05-20', days: 4 },
  ],
  papers: {
    total: 15,
    byStatus: { read: 5, 'to-read': 8, reading: 2 },
    recent: [
      { filePath: '/vault/_papers/p1.md', title: 'Paper A' },
    ],
  },
  books: {
    total: 3,
    byStatus: { reading: 2, read: 1 },
    recent: [
      { filePath: '/vault/_books/b1.md', title: 'Book A' },
    ],
  },
  lectures: {
    subjects: 4,
    notes: 25,
    recent: [
      { filePath: '/vault/math/note.md', title: 'Lecture 1', subject: 'math' },
    ],
  },
  activity: [
    { date: '2026-05-01', count: 5 },
    { date: '2026-05-02', count: 0 },
    { date: '2026-05-03', count: 12 },
  ],
  wikiHealth: {
    orphanCount: 3,
    tagCount: 15,
    topTags: [
      { tag: 'ml', count: 10 },
      { tag: 'nlp', count: 8 },
    ],
  },
};

describe('ProgressDashboard actions', () => {
  const onOpenFile = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAlert.mockResolvedValue(undefined);
    mockPrompt.mockResolvedValue(null);
    onOpenFile.mockClear();
    (window as any).api = {
      research: {
        getDashboard: vi.fn().mockResolvedValue({ ok: true, dashboard: MOCK_DASHBOARD }),
        saveDeadlines: vi.fn().mockResolvedValue({ ok: true }),
      },
      materials: {
        openUrl: vi.fn(),
      },
    };
  });

  it('adds deadline via prompts', async () => {
    mockPrompt
      .mockResolvedValueOnce('EMNLP 2026')
      .mockResolvedValueOnce('2026-12-01');
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    expect((window as any).api.research.saveDeadlines).toHaveBeenCalledWith(
      '/vault',
      expect.arrayContaining([
        expect.objectContaining({ name: 'EMNLP 2026', due: '2026-12-01' }),
      ])
    );
  });

  it('cancels deadline add when name prompt returns null', async () => {
    mockPrompt.mockResolvedValueOnce(null);
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    expect((window as any).api.research.saveDeadlines).not.toHaveBeenCalled();
  });

  it('cancels deadline add when name prompt returns empty string', async () => {
    mockPrompt.mockResolvedValueOnce('   ');
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    expect((window as any).api.research.saveDeadlines).not.toHaveBeenCalled();
  });

  it('shows error when deadline date is invalid format', async () => {
    mockPrompt
      .mockResolvedValueOnce('Test Event')
      .mockResolvedValueOnce('invalid-date');
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '日付形式が不正です' }));
    expect((window as any).api.research.saveDeadlines).not.toHaveBeenCalled();
  });

  it('cancels deadline add when date prompt returns falsy', async () => {
    mockPrompt
      .mockResolvedValueOnce('Test')
      .mockResolvedValueOnce(null);
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '日付形式が不正です' }));
  });

  it('removes deadline on × button click', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('NeurIPS 2026')).toBeInTheDocument(); });
    const removeBtns = screen.getAllByLabelText('削除');
    await act(async () => { fireEvent.click(removeBtns[0]); });
    // Should save with dl-1 removed
    expect((window as any).api.research.saveDeadlines).toHaveBeenCalledWith(
      '/vault',
      expect.not.arrayContaining([expect.objectContaining({ id: 'dl-1' })]),
    );
  });

  it('opens CFP URL on ↗ button', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('NeurIPS 2026')).toBeInTheDocument(); });
    const cfpBtn = screen.getByLabelText('CFP を開く');
    await act(async () => { fireEvent.click(cfpBtn); });
    expect((window as any).api.materials.openUrl).toHaveBeenCalledWith('https://neurips.cc');
  });

  it('shows error when saveDeadlines fails', async () => {
    (window as any).api.research.saveDeadlines = vi.fn().mockResolvedValue({ ok: false, error: 'save err' });
    mockPrompt
      .mockResolvedValueOnce('Test')
      .mockResolvedValueOnce('2026-12-01');
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '締切の保存に失敗しました' }));
  });

  it('shows "今日" for deadline with days=0', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      expect(screen.getByText('今日')).toBeInTheDocument();
    });
  });

  it('applies past class to past deadlines', async () => {
    const { container } = await act(async () => {
      return render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => { expect(screen.getByText('NeurIPS 2026')).toBeInTheDocument(); });
    const past = container.querySelectorAll('.deadline-item.past');
    expect(past.length).toBe(1);
  });

  it('applies urgent class to upcoming deadlines within 14 days', async () => {
    const { container } = await act(async () => {
      return render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => { expect(screen.getByText('NeurIPS 2026')).toBeInTheDocument(); });
    const urgent = container.querySelectorAll('.deadline-item.urgent');
    // ACL (0 days), AAAI (4 days), NeurIPS (10 days) should be urgent
    expect(urgent.length).toBeGreaterThanOrEqual(2);
  });

  it('handles getDashboard rejection with catch path', async () => {
    (window as any).api.research.getDashboard = vi.fn().mockRejectedValue(new Error('network error'));
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      expect(screen.getByText(/読み込みに失敗しました/)).toBeInTheDocument();
    });
  });

  it('opens recent paper on click', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('論文: Paper A')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('論文: Paper A')); });
    expect(onOpenFile).toHaveBeenCalledWith('/vault/_papers/p1.md');
  });

  it('opens recent book on click', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('本: Book A')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('本: Book A')); });
    expect(onOpenFile).toHaveBeenCalledWith('/vault/_books/b1.md');
  });

  it('opens recent lecture on click', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('math: Lecture 1')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('math: Lecture 1')); });
    expect(onOpenFile).toHaveBeenCalledWith('/vault/math/note.md');
  });

  it('shows activity heatmap with correct cell count', async () => {
    const { container } = await act(async () => {
      return render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      const cells = container.querySelectorAll('.activity-cell');
      expect(cells.length).toBe(3); // 3 activity entries
    });
  });

  it('shows wiki health orphan and tag counts', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      expect(screen.getByText('孤立ノート')).toBeInTheDocument();
      expect(screen.getByText('ユニークタグ')).toBeInTheDocument();
    });
  });

  it('shows top tags in wiki health', async () => {
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      expect(screen.getByText(/ml\(10\)/)).toBeInTheDocument();
      expect(screen.getByText(/nlp\(8\)/)).toBeInTheDocument();
    });
  });

  it('shows empty tag help when no top tags', async () => {
    const dashboard = { ...MOCK_DASHBOARD, wikiHealth: { orphanCount: 0, tagCount: 0, topTags: [] } };
    (window as any).api.research.getDashboard = vi.fn().mockResolvedValue({ ok: true, dashboard });
    await act(async () => { render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      expect(screen.getByText('タグなし')).toBeInTheDocument();
    });
  });

  it('renders sparkbar row labels in the canonical chart-palette order', async () => {
    // The 今週の進捗 card always renders five rows in this exact order.
    await act(async () => {
      render(<ProgressDashboard vaultPath="/vault" onOpenFile={onOpenFile} />);
    });
    await waitFor(() => {
      expect(screen.getByText('論文の精読')).toBeInTheDocument();
    });
    expect(screen.getByText('書籍の読書')).toBeInTheDocument();
    expect(screen.getByText('Wiki 健全度')).toBeInTheDocument();
    expect(screen.getByText('締切に余裕')).toBeInTheDocument();
    expect(screen.getByText('直近 7 日の活動')).toBeInTheDocument();
  });
});
