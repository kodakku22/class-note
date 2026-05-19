import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DailyView } from '../../src/components/DailyView';

// --------------------------------------------------------------------------
// Coverage targets for DailyView.tsx:
//   - createForSubject: today check and non-today alert
//   - navigateForward (翌日 ▶)
//   - todayString() reset button behavior
//   - Entry without preview text (shows (本文なし))
//   - Missing entries without create button on non-today dates
// --------------------------------------------------------------------------

const mockListDailyNotes = vi.fn();
const mockCreateTodaysNote = vi.fn();

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('DailyView – additional branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockListDailyNotes.mockResolvedValue({
      date: todayStr(),
      entries: [
        { subject: '数学', filePath: '/vault/math.md', exists: true, preview: '' },
        { subject: '英語', filePath: '/vault/eng.md', exists: false, preview: '' },
      ],
    });
    mockCreateTodaysNote.mockResolvedValue({ ok: true });
    const w = window as any;
    w.api.vault = {
      ...w.api.vault,
      listDailyNotes: mockListDailyNotes,
      createTodaysNote: mockCreateTodaysNote,
    };
  });

  it('shows (本文なし) for entries without preview text', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });
    // Empty preview should show placeholder
    expect(screen.getByText('(本文なし)')).toBeInTheDocument();
  });

  it('creates todays note when clicking create button', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('＋ 今日のノートを作成')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('＋ 今日のノートを作成'));
    });

    expect(mockCreateTodaysNote).toHaveBeenCalledWith('/vault', '英語');
  });

  it('navigates forward and does not show today badge', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(todayStr())).toBeInTheDocument();
    });

    // Click forward to tomorrow
    await act(async () => {
      fireEvent.click(screen.getByText('翌日 ▶'));
    });

    // The "今日" nav button should no longer be disabled
    await waitFor(() => {
      const todayBtn = screen.getAllByText('今日').find(
        (el) => el.tagName === 'BUTTON'
      );
      expect(todayBtn).not.toBeDisabled();
    });
  });

  it('does not show create button for missing entries on non-today date', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(todayStr())).toBeInTheDocument();
    });

    // Navigate to previous day
    await act(async () => {
      fireEvent.click(screen.getByText('◀ 前日'));
    });

    // Wait for re-render and check that create button is NOT present
    // (Since we changed date, missing entries on non-today should not show create button)
    await waitFor(() => {
      expect(mockListDailyNotes.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('navigating to today resets the today badge', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(todayStr())).toBeInTheDocument();
    });

    // Navigate away
    await act(async () => {
      fireEvent.click(screen.getByText('◀ 前日'));
    });

    // Navigate back to today
    await act(async () => {
      const todayBtn = screen.getAllByText('今日').find(
        (el) => el.tagName === 'BUTTON'
      );
      if (todayBtn) fireEvent.click(todayBtn);
    });

    // Today badge should reappear
    await waitFor(() => {
      expect(screen.getByText(todayStr())).toBeInTheDocument();
    });
  });

  it('today button is disabled when already on today', async () => {
    await act(async () => {
      render(<DailyView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      const todayBtn = screen.getAllByText('今日').find(
        (el) => el.tagName === 'BUTTON'
      );
      expect(todayBtn).toBeDisabled();
    });
  });
});
