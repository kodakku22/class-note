import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CommandPalette, type PaletteCommand } from '../../src/components/CommandPalette';
import type { LinkTarget, SearchHit } from '../../src/types';

const SAMPLE_TARGETS: LinkTarget[] = [
  { filePath: '/vault/Math/calc.md', name: 'Calculus', category: 'subject-note', subject: 'Math' },
  { filePath: '/vault/books/deep.md', name: 'Deep Learning', category: 'book' },
  { filePath: '/vault/memos/m1.md', name: 'Quick idea', category: 'memo' },
];

const SAMPLE_COMMANDS: PaletteCommand[] = [
  { id: 'new-note', title: '新しいノート', icon: '📝', keywords: ['note', 'create'], run: vi.fn() },
  { id: 'settings', title: '設定を開く', subtitle: 'テーマ, API', keywords: ['config'], run: vi.fn() },
];

const DEFAULT_PROPS = {
  open: true,
  vaultPath: '/vault',
  commands: SAMPLE_COMMANDS,
  onClose: vi.fn(),
  onSelectTarget: vi.fn(),
  onSelectHit: vi.fn(),
};

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    DEFAULT_PROPS.onClose = vi.fn();
    DEFAULT_PROPS.onSelectTarget = vi.fn();
    DEFAULT_PROPS.onSelectHit = vi.fn();
    SAMPLE_COMMANDS[0].run = vi.fn();
    SAMPLE_COMMANDS[1].run = vi.fn();
    (window as any).api.links = {
      listTargets: vi.fn().mockResolvedValue(SAMPLE_TARGETS),
    };
    (window as any).api.search = {
      query: vi.fn().mockResolvedValue([]),
    };
  });

  it('returns null when not open', () => {
    const { container } = render(<CommandPalette {...DEFAULT_PROPS} open={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders input placeholder', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });
    expect(screen.getByPlaceholderText(/コマンド/)).toBeInTheDocument();
  });

  it('renders footer hints', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });
    expect(screen.getByText('↑↓ 移動')).toBeInTheDocument();
    expect(screen.getByText('Enter 開く')).toBeInTheDocument();
    expect(screen.getByText('Esc 閉じる')).toBeInTheDocument();
  });

  it('loads link targets on mount', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect((window as any).api.links.listTargets).toHaveBeenCalledWith('/vault');
    });
  });

  it('shows commands', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('新しいノート')).toBeInTheDocument();
      expect(screen.getByText('設定を開く')).toBeInTheDocument();
    });
  });

  it('shows target names after loading', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
      expect(screen.getByText('Deep Learning')).toBeInTheDocument();
    });
  });

  it('filters targets by query', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/コマンド/), { target: { value: 'calc' } });
    });

    // After highlight, text is split by <mark>, so use container text content
    const results = document.querySelector('.palette-results');
    expect(results?.textContent).toContain('Calculus');
    expect(results?.textContent).not.toContain('Quick idea');
  });

  it('filters commands by keyword', async () => {
    (window as any).api.links.listTargets = vi.fn().mockResolvedValue([]);

    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('新しいノート')).toBeInTheDocument();
      expect(screen.getByText('設定を開く')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/コマンド/), { target: { value: 'config' } });
    });

    // "config" matches keyword of settings command but not new-note
    expect(screen.getByText('設定を開く')).toBeInTheDocument();
    expect(screen.queryByText('新しいノート')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    fireEvent.keyDown(screen.getByPlaceholderText(/コマンド/), { key: 'Escape' });
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    const overlay = document.querySelector('.palette-overlay');
    if (overlay) fireEvent.click(overlay);
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('selects target on Enter and calls onSelectTarget', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/コマンド/);
    const cmdCount = SAMPLE_COMMANDS.length;
    for (let i = 0; i < cmdCount; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(DEFAULT_PROPS.onSelectTarget).toHaveBeenCalledWith(SAMPLE_TARGETS[0]);
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('runs command on click', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('新しいノート')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('新しいノート'));
    expect(SAMPLE_COMMANDS[0].run).toHaveBeenCalled();
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('navigates with ArrowDown and ArrowUp', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/コマンド/);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    const items = document.querySelectorAll('.palette-item');
    expect(items[0]?.classList.contains('selected')).toBe(true);
  });

  it('shows empty state with query', async () => {
    (window as any).api.links.listTargets = vi.fn().mockResolvedValue([]);

    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} commands={[]} />);
    });

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/コマンド/);
      fireEvent.change(input, { target: { value: 'nonexistent' } });
    });

    expect(screen.getByText('一致するノートがありません')).toBeInTheDocument();
  });

  it('shows category label for targets', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('ノート')).toBeInTheDocument();
    });
  });

  it('shows subject name for targets with subject', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Math')).toBeInTheDocument();
    });
  });

  it('shows command subtitle', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/テーマ, API/)).toBeInTheDocument();
    });
  });

  it('performs full-text search after 2+ char query', async () => {
    vi.useFakeTimers();

    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    const input = screen.getByPlaceholderText(/コマンド/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'ab' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect((window as any).api.search.query).toHaveBeenCalledWith('/vault', 'ab');
    vi.useRealTimers();
  });

  it('does not search with single char query', async () => {
    vi.useFakeTimers();

    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    const input = screen.getByPlaceholderText(/コマンド/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect((window as any).api.search.query).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('resets query on re-open', async () => {
    const { rerender } = await act(async () =>
      render(<CommandPalette {...DEFAULT_PROPS} />)
    );

    const input = screen.getByPlaceholderText(/コマンド/) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
    });

    // Close and re-open
    await act(async () => {
      rerender(<CommandPalette {...DEFAULT_PROPS} open={false} />);
    });
    await act(async () => {
      rerender(<CommandPalette {...DEFAULT_PROPS} open={true} />);
    });

    const newInput = screen.getByPlaceholderText(/コマンド/) as HTMLInputElement;
    expect(newInput.value).toBe('');
  });

  it('filters targets by subject name', async () => {
    await act(async () => {
      render(<CommandPalette {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/コマンド/), { target: { value: 'math' } });
    });

    // Calculus has subject=Math, should still show
    expect(screen.getByText('Calculus')).toBeInTheDocument();
  });
});
