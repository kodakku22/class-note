import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Timetable } from '../../src/components/Timetable';

const mockTimetableRead = vi.fn();
const mockTimetableWrite = vi.fn();

const SAMPLE_TIMETABLE = {
  days: ['月', '火', '水', '木', '金'],
  periods: 4,
  cells: {
    '月-1': '数学',
    '火-2': '物理',
    '水-3': '英語',
  },
};

describe('Timetable', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockTimetableRead.mockResolvedValue({ ...SAMPLE_TIMETABLE, cells: { ...SAMPLE_TIMETABLE.cells } });
    mockTimetableWrite.mockResolvedValue({ ok: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api.timetable = {
      read: mockTimetableRead,
      write: mockTimetableWrite,
    };
  });

  it('renders header', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学', '物理', '英語']} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('時間割');
    });
  });

  it('renders day columns', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('月')).toBeInTheDocument();
    });
    expect(screen.getByText('火')).toBeInTheDocument();
    expect(screen.getByText('水')).toBeInTheDocument();
    expect(screen.getByText('木')).toBeInTheDocument();
    expect(screen.getByText('金')).toBeInTheDocument();
  });

  it('renders subject cells', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学', '物理', '英語']} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });
    expect(screen.getByText('物理')).toBeInTheDocument();
    expect(screen.getByText('英語')).toBeInTheDocument();
  });

  it('shows loading state before data loads', () => {
    mockTimetableRead.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('renders period rows', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      // 4 periods → rows labeled 1, 2, 3, 4
      expect(screen.getByText('1')).toBeInTheDocument();
    });
    // The table header cells should include period numbers
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
  });

  it('calls onJumpToSubject when subject cell is clicked', async () => {
    const onJump = vi.fn();
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学']} onJumpToSubject={onJump} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('数学'));
    expect(onJump).toHaveBeenCalledWith('数学');
  });

  it('shows Saturday toggle button', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('土曜を表示')).toBeInTheDocument();
    });
  });

  it('toggles Saturday on', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('土曜を表示')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('土曜を表示'));
    });

    expect(mockTimetableWrite).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ days: ['月', '火', '水', '木', '金', '土'] })
    );
  });

  it('toggles Saturday off when already visible', async () => {
    mockTimetableRead.mockResolvedValue({
      ...SAMPLE_TIMETABLE,
      days: ['月', '火', '水', '木', '金', '土'],
      cells: { ...SAMPLE_TIMETABLE.cells },
    });

    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('土曜を非表示')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('土曜を非表示'));
    });

    expect(mockTimetableWrite).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ days: ['月', '火', '水', '木', '金'] })
    );
  });

  it('increases period count', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('＋')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('＋'));
    });

    expect(mockTimetableWrite).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ periods: 5 })
    );
  });

  it('decreases period count', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('−')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('−'));
    });

    expect(mockTimetableWrite).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ periods: 3 })
    );
  });

  it('enters edit mode on empty cell click', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学']} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });

    // Click an empty "+" cell
    const plusCells = screen.getAllByText('+');
    fireEvent.click(plusCells[0]);

    expect(screen.getByPlaceholderText('科目名')).toBeInTheDocument();
  });

  it('enters edit mode on double-click filled cell', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学']} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });

    fireEvent.doubleClick(screen.getByText('数学'));
    expect(screen.getByPlaceholderText('科目名')).toBeInTheDocument();
  });

  it('commits edit on Enter key', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学']} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      const plusCells = screen.getAllByText('+');
      expect(plusCells.length).toBeGreaterThan(0);
    });

    const plusCells = screen.getAllByText('+');
    fireEvent.click(plusCells[0]);

    const input = screen.getByPlaceholderText('科目名');
    await act(async () => {
      fireEvent.change(input, { target: { value: '化学' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(mockTimetableWrite).toHaveBeenCalled();
  });

  it('cancels edit on Escape', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      const plusCells = screen.getAllByText('+');
      expect(plusCells.length).toBeGreaterThan(0);
    });

    const plusCells = screen.getAllByText('+');
    fireEvent.click(plusCells[0]);

    const input = screen.getByPlaceholderText('科目名');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });

    expect(screen.queryByPlaceholderText('科目名')).not.toBeInTheDocument();
  });

  it('commits edit on blur', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={[]} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      const plusCells = screen.getAllByText('+');
      expect(plusCells.length).toBeGreaterThan(0);
    });

    const plusCells = screen.getAllByText('+');
    fireEvent.click(plusCells[0]);

    const input = screen.getByPlaceholderText('科目名');
    await act(async () => {
      fireEvent.change(input, { target: { value: '化学' } });
    });

    await act(async () => {
      fireEvent.blur(input);
    });

    expect(mockTimetableWrite).toHaveBeenCalled();
  });

  it('clears cell content when editing to empty', async () => {
    await act(async () => {
      render(<Timetable vaultPath="/vault" subjects={['数学']} onJumpToSubject={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('数学')).toBeInTheDocument();
    });

    fireEvent.doubleClick(screen.getByText('数学'));
    const input = screen.getByPlaceholderText('科目名');

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    // The last write call should reflect the cleared value
    expect(mockTimetableWrite).toHaveBeenCalled();
    const lastCall = mockTimetableWrite.mock.calls[mockTimetableWrite.mock.calls.length - 1];
    const writtenData = lastCall[1];
    expect(writtenData.cells['月-1']).toBeUndefined();
  });
});
