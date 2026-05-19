import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Controllable Dialog mock
const mockAlert = vi.fn().mockResolvedValue(undefined);
const mockConfirm = vi.fn().mockResolvedValue(true);
const mockPrompt = vi.fn().mockResolvedValue('new-name');
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    { alert: mockAlert, confirm: mockConfirm, prompt: mockPrompt },
    null,
  ],
}));

// Mock LearningProgress
vi.mock('../../src/components/insights/LearningProgress', () => ({
  LearningProgress: () => <div data-testid="learning-progress" />,
}));

// Mock frontmatter utils with real-enough behavior
vi.mock('../../src/utils/frontmatter', () => ({
  parseFrontmatter: (raw: string) => {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { meta: {}, body: raw };
    const meta: Record<string, unknown> = {};
    for (const line of match[1].split('\n')) {
      const [k, ...rest] = line.split(':');
      if (k) meta[k.trim()] = rest.join(':').trim();
    }
    return { meta, body: match[2] };
  },
  stringifyFrontmatter: (meta: Record<string, unknown>, body: string) => {
    const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
    return `---\n${lines.join('\n')}\n---\n${body}`;
  },
}));

import { Sidebar } from '../../src/components/Sidebar';
import type { RecentEntry, FavoriteEntry } from '../../src/components/Sidebar';

describe('Sidebar context menu actions', () => {
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

  const SUBJECTS = ['math', 'physics'];
  const RECENTS: RecentEntry[] = [
    { filePath: '/vault/math/recent.md', fileName: 'recent.md', subject: 'math' },
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

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAlert.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
    mockPrompt.mockResolvedValue('new-name');
    Object.values(handlers).forEach((fn) => fn.mockClear());
    (window as any).api = {
      vault: {
        createSubject: vi.fn().mockResolvedValue({ ok: true }),
        renameSubject: vi.fn().mockResolvedValue({ ok: true }),
        deleteSubject: vi.fn().mockResolvedValue({ ok: true }),
        readNote: vi.fn().mockResolvedValue('---\npinned: true\ntitle: My Note\n---\nBody text'),
        writeNote: vi.fn().mockResolvedValue({ ok: true }),
      },
      materials: {
        revealInFolder: vi.fn(),
      },
    };
  });

  async function openContextMenu(text: string) {
    await act(async () => {
      fireEvent.contextMenu(screen.getByText(text));
    });
  }

  async function clickMenuItem(text: string | RegExp) {
    const el = typeof text === 'string' ? screen.getByText(text) : screen.getByText(text);
    await act(async () => {
      fireEvent.click(el);
    });
  }

  // --- Subject context menu ---

  it('renames subject from context menu', async () => {
    mockPrompt.mockResolvedValue('renamed-subject');
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem('名前を変更');
    expect(mockPrompt).toHaveBeenCalledWith(expect.objectContaining({ title: '科目の名前を変更' }));
    expect((window as any).api.vault.renameSubject).toHaveBeenCalledWith('/vault', 'math', 'renamed-subject');
    expect(handlers.onSubjectsChanged).toHaveBeenCalled();
  });

  it('does not rename when prompt returns null', async () => {
    mockPrompt.mockResolvedValue(null);
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem('名前を変更');
    expect((window as any).api.vault.renameSubject).not.toHaveBeenCalled();
  });

  it('does not rename when prompt returns same name', async () => {
    mockPrompt.mockResolvedValue('math');
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem('名前を変更');
    expect((window as any).api.vault.renameSubject).not.toHaveBeenCalled();
  });

  it('shows error when rename fails', async () => {
    mockPrompt.mockResolvedValue('new-name');
    (window as any).api.vault.renameSubject = vi.fn().mockResolvedValue({ ok: false, error: 'dup name' });
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem('名前を変更');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'リネーム失敗' }));
  });

  it('reveals subject folder from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem('フォルダで表示');
    expect((window as any).api.materials.revealInFolder).toHaveBeenCalledWith('/vault/math');
  });

  it('deletes subject from context menu after confirm', async () => {
    mockConfirm.mockResolvedValue(true);
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem(/削除.*ゴミ箱/);
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '科目を削除しますか？' }));
    expect((window as any).api.vault.deleteSubject).toHaveBeenCalledWith('/vault', 'math');
    expect(handlers.onSubjectsChanged).toHaveBeenCalled();
  });

  it('does not delete when confirm is cancelled', async () => {
    mockConfirm.mockResolvedValue(false);
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem(/削除.*ゴミ箱/);
    expect((window as any).api.vault.deleteSubject).not.toHaveBeenCalled();
  });

  it('shows error when delete fails', async () => {
    mockConfirm.mockResolvedValue(true);
    (window as any).api.vault.deleteSubject = vi.fn().mockResolvedValue({ ok: false, error: 'perm denied' });
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('math');
    await clickMenuItem(/削除.*ゴミ箱/);
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '削除失敗' }));
  });

  // --- Favorite context menu ---

  it('opens favorite from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('fav');
    await clickMenuItem('開く');
    expect(handlers.onOpenFile).toHaveBeenCalledWith('/vault/math/fav.md');
  });

  it('reveals favorite in folder from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('fav');
    await clickMenuItem('フォルダで表示');
    expect((window as any).api.materials.revealInFolder).toHaveBeenCalledWith('/vault/math/fav.md');
  });

  it('copies favorite path from context menu', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('fav');
    await clickMenuItem('パスをコピー');
    expect(writeTextMock).toHaveBeenCalledWith('/vault/math/fav.md');
  });

  it('unpins favorite from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('fav');
    await clickMenuItem('Pin を解除');
    expect((window as any).api.vault.readNote).toHaveBeenCalledWith('/vault/math/fav.md');
    expect((window as any).api.vault.writeNote).toHaveBeenCalledWith(
      '/vault/math/fav.md',
      expect.any(String)
    );
    expect(handlers.onSubjectsChanged).toHaveBeenCalled();
  });

  it('handles unpin error silently', async () => {
    (window as any).api.vault.readNote = vi.fn().mockRejectedValue(new Error('read failed'));
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('fav');
    // Should not throw
    await clickMenuItem('Pin を解除');
    expect(handlers.onSubjectsChanged).not.toHaveBeenCalled();
  });

  // --- Recent context menu ---

  it('opens recent from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('recent');
    await clickMenuItem('開く');
    expect(handlers.onOpenFile).toHaveBeenCalledWith('/vault/math/recent.md');
  });

  it('reveals recent in folder from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('recent');
    await clickMenuItem('フォルダで表示');
    expect((window as any).api.materials.revealInFolder).toHaveBeenCalledWith('/vault/math/recent.md');
  });

  it('copies recent path from context menu', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('recent');
    await clickMenuItem('パスをコピー');
    expect(writeTextMock).toHaveBeenCalledWith('/vault/math/recent.md');
  });

  it('removes recent from context menu', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await openContextMenu('recent');
    await clickMenuItem('履歴から外す');
    expect(handlers.onRemoveRecent).toHaveBeenCalledWith('/vault/math/recent.md');
  });

  // --- Add subject dialog ---

  it('submits new subject via button click', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    const input = screen.getByPlaceholderText(/数学, 英語/);
    await act(async () => { fireEvent.change(input, { target: { value: 'history' } }); });
    await act(async () => { fireEvent.click(screen.getByText('作成')); });
    expect((window as any).api.vault.createSubject).toHaveBeenCalledWith('/vault', 'history');
    expect(handlers.onSubjectsChanged).toHaveBeenCalled();
    expect(handlers.onSelectSubject).toHaveBeenCalledWith('history');
  });

  it('shows error when createSubject fails', async () => {
    (window as any).api.vault.createSubject = vi.fn().mockResolvedValue({ ok: false, error: 'already exists' });
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    const input = screen.getByPlaceholderText(/数学, 英語/);
    await act(async () => { fireEvent.change(input, { target: { value: 'math' } }); });
    await act(async () => { fireEvent.click(screen.getByText('作成')); });
    expect(screen.getByText('already exists')).toBeInTheDocument();
  });

  it('shows default error message when createSubject fails without message', async () => {
    (window as any).api.vault.createSubject = vi.fn().mockResolvedValue({ ok: false });
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    const input = screen.getByPlaceholderText(/数学, 英語/);
    await act(async () => { fireEvent.change(input, { target: { value: 'test' } }); });
    await act(async () => { fireEvent.click(screen.getByText('作成')); });
    expect(screen.getByText('作成に失敗しました')).toBeInTheDocument();
  });

  it('closes add dialog on cancel', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    expect(screen.getByText('科目を追加', { selector: 'h3' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('キャンセル')); });
    expect(screen.queryByText('科目を追加', { selector: 'h3' })).not.toBeInTheDocument();
  });

  it('closes add dialog on overlay click', async () => {
    const { container } = render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    const overlay = container.querySelector('.modal-overlay')!;
    await act(async () => { fireEvent.click(overlay); });
    expect(screen.queryByText('科目を追加', { selector: 'h3' })).not.toBeInTheDocument();
  });

  it('stops propagation on modal click', async () => {
    const { container } = render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    const modal = container.querySelector('.modal')!;
    await act(async () => { fireEvent.click(modal); });
    // Modal should still be visible (not closed by overlay handler)
    expect(screen.getByText('科目を追加', { selector: 'h3' })).toBeInTheDocument();
  });

  it('disables create button when name is empty', async () => {
    render(<Sidebar {...DEFAULT_PROPS} />);
    await act(async () => { fireEvent.click(screen.getByText('科目を追加')); });
    const btn = screen.getByText('作成');
    expect(btn).toBeDisabled();
  });

  // --- Active subject not highlighted when viewMode differs ---

  it('does not highlight subject when viewMode is not subject', () => {
    const { container } = render(
      <Sidebar {...DEFAULT_PROPS} viewMode="timetable" />
    );
    const active = container.querySelectorAll('.sidebar-item.active');
    expect(active.length).toBe(0);
  });

  // --- Recents limited to 10 ---

  it('limits recents to 10 entries', () => {
    const manyRecents: RecentEntry[] = Array.from({ length: 15 }, (_, i) => ({
      filePath: `/vault/math/note-${i}.md`,
      fileName: `note-${i}.md`,
      subject: 'math',
    }));
    render(<Sidebar {...DEFAULT_PROPS} recents={manyRecents} />);
    const recentItems = document.querySelectorAll('.recent-item');
    expect(recentItems.length).toBe(10);
  });
});
