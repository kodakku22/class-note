import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DailyView } from '../../src/components/DailyView';

const mockListDailyNotes = vi.fn();
const mockCreateTodaysNote = vi.fn();

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('DailyView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockListDailyNotes.mockResolvedValue({
      date: todayStr(),
      entries: [
        { subject: '数学', filePath: '/vault/数学/notes/today.md', exists: true, preview: 'Preview text' },
        { subject: '物理', filePath: '/vault/物理/notes/today.md', exists: false, preview: '' },
      ],
    });
    mockCreateTodaysNote.mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.api.vault = {
      ...w.api.vault,
      listDailyNotes: mockListDailyNotes,
      createTodaysNote: mockCreateTodaysNote,
    };
  });

  it('renders today\'s date', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(todayStr())).toBeInTheDocument();
    });
  });

  it('shows today badge', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      // Two elements contain "今日": the badge and the nav button
      const badges = screen.getAllByText('今日');
      expect(badges.length).toBe(2);
    });
  });

  it('shows existing entries', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });
    expect(screen.getByText('Preview text')).toBeInTheDocument();
  });

  it('shows missing entries with create button', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('物理')).toBeInTheDocument();
    });
    expect(screen.getByText('＋ 今日のノートを作成')).toBeInTheDocument();
  });

  it('navigates to previous day', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(todayStr())).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('◀ 前日'));
    });

    // Should have called listDailyNotes more than initial renders
    expect(mockListDailyNotes.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onJumpToFile when existing entry is clicked', async () => {
    const onJumpToFile = vi.fn();
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={onJumpToFile} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Preview text')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Preview text'));
    expect(onJumpToFile).toHaveBeenCalledWith('数学', '/vault/数学/notes/today.md');
  });

  it('shows empty state when no subjects', async () => {
    mockListDailyNotes.mockResolvedValue({ date: todayStr(), entries: [] });

    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('科目がまだありません')).toBeInTheDocument();
    });
  });

  it('shows navigation buttons', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    expect(screen.getByText('◀ 前日')).toBeInTheDocument();
    expect(screen.getByText('翌日 ▶')).toBeInTheDocument();
  });
});
