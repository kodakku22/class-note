import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RailCustomizeDialog } from '../../src/components/layout/RailCustomizeDialog';
import type { RailViewOption } from '../../src/components/layout/RailCustomizeDialog';

const SAMPLE_VIEW_OPTIONS: RailViewOption[] = [
  { id: 'subject' as any, label: '科目', icon: '📚', description: '科目ビュー' },
  { id: 'papers' as any, label: '論文', icon: '📄', description: '論文管理' },
  { id: 'graph' as any, label: 'グラフ', icon: '🕸️', description: 'ナレッジグラフ' },
];

const SAMPLE_COMMANDS = [
  { id: 'cmd-1', title: '新規ノート', subtitle: 'Ctrl+N', icon: '📝', keywords: ['new', 'note'], railEligible: true },
  { id: 'cmd-2', title: 'テーマ切替', subtitle: 'Ctrl+T', icon: '🎨', keywords: ['theme'], railEligible: true },
  { id: 'cmd-3', title: '内部コマンド', subtitle: '', railEligible: false },
];

describe('RailCustomizeDialog', () => {
  const DEFAULT_PROPS = {
    uiMode: 'custom' as const,
    railItems: ['subject' as any],
    railCommandIds: ['cmd-1'],
    viewOptions: SAMPLE_VIEW_OPTIONS,
    commands: SAMPLE_COMMANDS,
    onChangeMode: vi.fn(),
    onAddView: vi.fn(),
    onAddCommand: vi.fn(),
    onResetSimple: vi.fn(),
    onSetFull: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.keys(DEFAULT_PROPS).forEach((k) => {
      if (typeof (DEFAULT_PROPS as any)[k] === 'function') {
        (DEFAULT_PROPS as any)[k] = vi.fn();
      }
    });
  });

  it('renders dialog title', () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('左アイコンを編集')).toBeInTheDocument();
  });

  it('shows three tabs', () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('表示モード')).toBeInTheDocument();
    expect(screen.getByText('ビューを追加')).toBeInTheDocument();
    expect(screen.getByText('コマンドを追加')).toBeInTheDocument();
  });

  it('shows mode options on mode tab', () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('シンプル')).toBeInTheDocument();
    expect(screen.getByText('カスタム')).toBeInTheDocument();
    expect(screen.getByText('全機能')).toBeInTheDocument();
  });

  it('highlights current mode', () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} uiMode="custom" />);
    const customBtn = screen.getByText('カスタム').closest('button');
    expect(customBtn?.className).toContain('active');
  });

  it('calls onChangeMode when mode is clicked', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('シンプル'));
    });

    expect(DEFAULT_PROPS.onChangeMode).toHaveBeenCalledWith('simple');
  });

  it('shows reset and full buttons', () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('シンプルに戻す')).toBeInTheDocument();
    expect(screen.getByText('全機能を表示')).toBeInTheDocument();
  });

  it('calls onResetSimple', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('シンプルに戻す'));
    });

    expect(DEFAULT_PROPS.onResetSimple).toHaveBeenCalled();
  });

  it('calls onSetFull', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('全機能を表示'));
    });

    expect(DEFAULT_PROPS.onSetFull).toHaveBeenCalled();
  });

  // Views tab
  it('shows view options on views tab', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('ビューを追加'));
    });

    expect(screen.getByText('科目')).toBeInTheDocument();
    expect(screen.getByText('論文')).toBeInTheDocument();
    expect(screen.getByText('グラフ')).toBeInTheDocument();
  });

  it('disables already-added views', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('ビューを追加'));
    });

    // 'subject' is in railItems so it should be disabled
    const subjectBtn = screen.getByText('科目').closest('button');
    expect(subjectBtn).toBeDisabled();
  });

  it('shows "追加済み" for added views', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('ビューを追加'));
    });

    expect(screen.getByText('追加済み')).toBeInTheDocument();
  });

  it('calls onAddView when clicking non-added view', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('ビューを追加'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('論文').closest('button')!);
    });

    expect(DEFAULT_PROPS.onAddView).toHaveBeenCalledWith('papers');
  });

  // Commands tab
  it('shows command options on commands tab', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('コマンドを追加'));
    });

    expect(screen.getByText('新規ノート')).toBeInTheDocument();
    expect(screen.getByText('テーマ切替')).toBeInTheDocument();
  });

  it('filters out non-rail-eligible commands', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('コマンドを追加'));
    });

    expect(screen.queryByText('内部コマンド')).not.toBeInTheDocument();
  });

  it('shows command search input', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('コマンドを追加'));
    });

    expect(screen.getByPlaceholderText(/追加したいコマンドを検索/)).toBeInTheDocument();
  });

  it('filters commands by search query', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('コマンドを追加'));
    });

    const input = screen.getByPlaceholderText(/追加したいコマンドを検索/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'テーマ' } });
    });

    expect(screen.getByText('テーマ切替')).toBeInTheDocument();
    expect(screen.queryByText('新規ノート')).not.toBeInTheDocument();
  });

  it('disables already-added commands', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('コマンドを追加'));
    });

    // 'cmd-1' is in railCommandIds
    const noteBtn = screen.getByText('新規ノート').closest('button');
    expect(noteBtn).toBeDisabled();
  });

  it('calls onAddCommand when clicking non-added command', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('コマンドを追加'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('テーマ切替').closest('button')!);
    });

    expect(DEFAULT_PROPS.onAddCommand).toHaveBeenCalledWith('cmd-2');
  });

  it('closes on close button', async () => {
    render(<RailCustomizeDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('閉じる'));
    });

    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    const { container } = render(<RailCustomizeDialog {...DEFAULT_PROPS} />);
    const overlay = container.querySelector('.modal-overlay');

    if (overlay) {
      await act(async () => {
        fireEvent.click(overlay);
      });
    }

    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });
});
