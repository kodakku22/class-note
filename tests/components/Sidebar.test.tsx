import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock Dialog
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    {
      alert: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
      prompt: vi.fn().mockResolvedValue('new-name'),
    },
    null,
  ],
}));

// Mock LearningProgress
vi.mock('../../src/components/insights/LearningProgress', () => ({
  LearningProgress: () => <div data-testid="learning-progress" />,
}));

// Mock frontmatter utils
vi.mock('../../src/utils/frontmatter', () => ({
  parseFrontmatter: (raw: string) => ({ meta: {}, body: raw }),
  stringifyFrontmatter: (meta: any, body: string) => body,
}));

import { Sidebar } from '../../src/components/Sidebar';
import type { RecentEntry, FavoriteEntry } from '../../src/components/Sidebar';

describe('Sidebar', () => {
  const handlers = {
    onSelectSubject: vi.fn(),
    onShowSettings: vi.fn(),
    onShowPalette: vi.fn(),
    onOpenObsidian: vi.fn(),
    onSubjectsChanged: vi.fn(),
    onResetVault: vi.fn(),
    onOpenFile: vi.fn(),
    onRemoveRecent: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(handlers).forEach((fn) => fn.mockClear());
    (window as any).api = {
      vault: {
        createSubject: vi.fn().mockResolvedValue({ ok: true }),
        renameSubject: vi.fn().mockResolvedValue({ ok: true }),
        deleteSubject: vi.fn().mockResolvedValue({ ok: true }),
        readNote: vi.fn().mockResolvedValue('---\npinned: true\n---\nBody'),
        writeNote: vi.fn().mockResolvedValue({ ok: true }),
      },
      materials: {
        revealInFolder: vi.fn(),
      },
    };
  });

  const SUBJECTS = ['math', 'physics', 'english'];
  const RECENTS: RecentEntry[] = [
    { filePath: '/vault/math/note.md', fileName: 'note.md', subject: 'math' },
  ];
  const FAVORITES: FavoriteEntry[] = [
    { filePath: '/vault/math/fav.md', fileName: 'fav.md', subject: 'math' },
  ];

  const DEFAULT_PROPS = {
    vaultPath: '/vault',
    subjects: SUBJECTS,
    activeSubject: 'math' as string | null,
    viewMode: 'subject' as const,
    recents: RECENTS,
    favorites: FAVORITES,
    ...handlers,
  };

  it('renders search trigger', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText(/チャンネル.*ノート検索/)).toBeInTheDocument();
  });

  it('shows Ctrl+P shortcut', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('Ctrl+P')).toBeInTheDocument();
  });

  it('shows subjects', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('math')).toBeInTheDocument();
    expect(screen.getByText('physics')).toBeInTheDocument();
    expect(screen.getByText('english')).toBeInTheDocument();
  });

  it('highlights active subject', () => {
    const { container } = render(<Sidebar {...DEFAULT_PROPS} />);
    const active = container.querySelectorAll('.sidebar-item.active');
    expect(active.length).toBe(1);
  });

  it('selects subject on click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('physics'));
    });
    expect(handlers.onSelectSubject).toHaveBeenCalledWith('physics');
  });

  it('shows Channels section', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('Channels')).toBeInTheDocument();
  });

  it('shows Favorites section', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('fav')).toBeInTheDocument();
  });

  it('shows Recent section', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('note')).toBeInTheDocument();
  });

  it('opens favorite on click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('fav'));
    });
    expect(handlers.onOpenFile).toHaveBeenCalledWith('/vault/math/fav.md');
  });

  it('opens recent on click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('note'));
    });
    expect(handlers.onOpenFile).toHaveBeenCalledWith('/vault/math/note.md');
  });

  it('shows settings button', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('⚙️ 設定'));
    });
    expect(handlers.onShowSettings).toHaveBeenCalled();
  });

  it('shows vault button', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('📂 Vault'));
    });
    expect(handlers.onResetVault).toHaveBeenCalled();
  });

  it('shows Obsidian button', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Obsidian で開く'));
    });
    expect(handlers.onOpenObsidian).toHaveBeenCalled();
  });

  it('shows vault path', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('/vault')).toBeInTheDocument();
  });

  it('shows add subject button', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('科目を追加')).toBeInTheDocument();
  });

  it('opens add dialog on click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('科目を追加'));
    });
    expect(screen.getByText('科目を追加', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/数学, 英語/)).toBeInTheDocument();
  });

  it('shows empty state when no subjects', () => {
    render(<Sidebar {...DEFAULT_PROPS} subjects={[]} />);
    expect(screen.getByText(/まだ科目がありません/)).toBeInTheDocument();
  });

  it('hides favorites when empty', () => {
    render(<Sidebar {...DEFAULT_PROPS} favorites={[]} />);
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
  });

  it('hides recents when empty', () => {
    render(<Sidebar {...DEFAULT_PROPS} recents={[]} />);
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('shows LearningProgress component', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('learning-progress')).toBeInTheDocument();
  });

  it('shows context menu on subject right-click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('math'));
    });
    expect(screen.getByText('名前を変更')).toBeInTheDocument();
    expect(screen.getByText('フォルダで表示')).toBeInTheDocument();
    expect(screen.getByText(/削除/)).toBeInTheDocument();
  });

  it('shows context menu on favorite right-click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('fav'));
    });
    expect(screen.getByText('開く')).toBeInTheDocument();
    expect(screen.getByText('Pin を解除')).toBeInTheDocument();
  });

  it('shows context menu on recent right-click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('note'));
    });
    expect(screen.getByText('開く')).toBeInTheDocument();
    expect(screen.getByText('履歴から外す')).toBeInTheDocument();
  });

  it('shows palette on search click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    const searchBtn = screen.getByText(/チャンネル.*ノート検索/).closest('button')!;
    await act(async () => {
      fireEvent.click(searchBtn);
    });
    expect(handlers.onShowPalette).toHaveBeenCalled();
  });

  it('strips .md from favorite names', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('fav')).toBeInTheDocument();
    expect(screen.queryByText('fav.md')).not.toBeInTheDocument();
  });

  it('strips .md from recent names', () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    expect(screen.getByText('note')).toBeInTheDocument();
    expect(screen.queryByText('note.md')).not.toBeInTheDocument();
  });

  it('submits new subject via Enter key', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('科目を追加'));
    });
    const input = screen.getByPlaceholderText(/数学, 英語/);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'history' } });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect((window as any).api.vault.createSubject).toHaveBeenCalledWith('/vault', 'history');
  });
});
