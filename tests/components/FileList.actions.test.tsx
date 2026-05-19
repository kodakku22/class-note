import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { FileList } from '../../src/components/FileList';
import type { FileEntry } from '../../src/types';

// Mock CanvasPreviewDialog
vi.mock('../../src/components/papers/CanvasPreviewDialog', () => ({
  CanvasPreviewDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="canvas-dialog"><button onClick={onClose}>close</button></div>
  ),
}));

// Mock Dialog with controllable confirm/alert
const mockConfirm = vi.fn().mockResolvedValue(true);
const mockAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    { alert: mockAlert, confirm: mockConfirm },
    null,
  ],
}));

const makeNote = (name: string, path?: string): FileEntry => ({
  name,
  path: path ?? `/vault/subject/${name}`,
  kind: 'note',
  mtime: Date.now(),
});

const makeMaterial = (name: string, kind: FileEntry['kind'] = 'pdf'): FileEntry => ({
  name,
  path: `/vault/subject/${name}`,
  kind,
  mtime: Date.now(),
});

describe('FileList context menu actions', () => {
  const onSelect = vi.fn();
  const onSelectVirtual = vi.fn();
  const onChanged = vi.fn();
  const onChangeView = vi.fn();

  const NOTES = [makeNote('test-note.md'), makeNote('other.md')];
  const MATERIALS = [makeMaterial('paper.pdf'), makeMaterial('img.png', 'image')];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockAlert.mockResolvedValue(undefined);
    onSelect.mockClear();
    onSelectVirtual.mockClear();
    onChanged.mockClear();
    onChangeView.mockClear();

    (window as any).api = {
      vault: {
        createTodaysNote: vi.fn().mockResolvedValue({ filePath: '/vault/subject/today.md' }),
        duplicateNote: vi.fn().mockResolvedValue({ ok: true }),
        deleteNote: vi.fn().mockResolvedValue({ ok: true }),
        readNote: vi.fn().mockResolvedValue('---\ntitle: T\n---\nBody'),
        writeNote: vi.fn().mockResolvedValue({ ok: true }),
      },
      materials: {
        revealInFolder: vi.fn(),
        addFiles: vi.fn().mockResolvedValue(undefined),
      },
      ai: {
        summarizeAndApply: vi.fn().mockResolvedValue({ ok: true, result: { oneLiner: 'Summary done' } }),
        autoTag: vi.fn().mockResolvedValue({ ok: true, result: { tags: ['ml', 'nlp'], reasoning: 'Because ML' } }),
        applyTags: vi.fn().mockResolvedValue({ ok: true }),
        optimizeMarkdown: vi.fn().mockResolvedValue({
          ok: true,
          result: { optimized: '# Optimized\nNew content', changes: ['Fixed headers', 'Added links'] },
        }),
      },
      latex: {
        exportNote: vi.fn().mockResolvedValue({ ok: true, outputDir: '/out', usedPandoc: true }),
      },
    };
  });

  const DEFAULT_PROPS = {
    vaultPath: '/vault',
    subject: 'math',
    files: { notes: NOTES, materials: MATERIALS },
    activeFile: null as FileEntry | null,
    virtualFile: null as { kind: 'qa' } | null,
    onSelect,
    onSelectVirtual,
    onChanged,
    onChangeView,
  };

  async function openContextMenu(text: string) {
    await act(async () => {
      fireEvent.contextMenu(screen.getByText(text));
    });
  }

  async function clickMenuItem(text: string) {
    await act(async () => {
      fireEvent.click(screen.getByText(text));
    });
  }

  it('runs AI summarize from context menu', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI で要約');
    expect((window as any).api.ai.summarizeAndApply).toHaveBeenCalledWith('/vault/subject/test-note.md');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '要約完了' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows error when AI summarize fails', async () => {
    (window as any).api.ai.summarizeAndApply = vi.fn().mockResolvedValue({ ok: false, error: 'API error' });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI で要約');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '要約に失敗しました' }));
  });

  it('runs AI tag from context menu and applies', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI でタグ付け');
    expect((window as any).api.ai.autoTag).toHaveBeenCalledWith('/vault/subject/test-note.md');
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'タグを適用しますか？' }));
    expect((window as any).api.ai.applyTags).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not apply tags when user cancels', async () => {
    mockConfirm.mockResolvedValue(false);
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI でタグ付け');
    expect((window as any).api.ai.applyTags).not.toHaveBeenCalled();
  });

  it('shows error when AI tag fails', async () => {
    (window as any).api.ai.autoTag = vi.fn().mockResolvedValue({ ok: false, error: 'tag error' });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI でタグ付け');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'タグ提案失敗' }));
  });

  it('opens Canvas preview dialog', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI で Canvas 生成');
    expect(screen.getByTestId('canvas-dialog')).toBeInTheDocument();
  });

  it('runs LaTeX export from context menu', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem(/LaTeX.*書出/);
    expect((window as any).api.latex.exportNote).toHaveBeenCalledWith('/vault', '/vault/subject/test-note.md', 'neurips');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'LaTeX 書出完了' }));
  });

  it('shows error when LaTeX export fails', async () => {
    (window as any).api.latex.exportNote = vi.fn().mockResolvedValue({ ok: false, error: 'pandoc missing' });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem(/LaTeX.*書出/);
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'LaTeX 書出失敗' }));
  });

  it('shows fallback message when LaTeX export without Pandoc', async () => {
    (window as any).api.latex.exportNote = vi.fn().mockResolvedValue({ ok: true, outputDir: '/out', usedPandoc: false });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem(/LaTeX.*書出/);
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('フォールバック'),
    }));
  });

  it('runs AI Markdown optimize from context menu', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI で Markdown 整形');
    expect((window as any).api.ai.optimizeMarkdown).toHaveBeenCalledWith('/vault/subject/test-note.md');
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '整形を適用しますか？' }));
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not apply Markdown optimize when user cancels', async () => {
    // The optimize flow calls confirm once (to apply). Reject it.
    mockConfirm.mockResolvedValueOnce(false);
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI で Markdown 整形');
    // writeNote should not be called because confirm was rejected
    expect((window as any).api.vault.writeNote).not.toHaveBeenCalled();
  });

  it('shows error when AI optimize fails', async () => {
    (window as any).api.ai.optimizeMarkdown = vi.fn().mockResolvedValue({ ok: false, error: 'optimize error' });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('AI で Markdown 整形');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '整形失敗' }));
  });

  it('duplicates note from context menu', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('複製');
    expect((window as any).api.vault.duplicateNote).toHaveBeenCalledWith('/vault/subject/test-note.md');
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows error when duplicate fails', async () => {
    (window as any).api.vault.duplicateNote = vi.fn().mockResolvedValue({ ok: false, error: 'dup error' });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('複製');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '複製に失敗しました' }));
  });

  it('deletes note from context menu after confirmation', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    // The delete menu item has text like "削除 (ゴミ箱へ)"
    const deleteBtn = screen.getByText(/削除.*ゴミ箱/);
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '削除しますか？' }));
    expect((window as any).api.vault.deleteNote).toHaveBeenCalledWith('/vault/subject/test-note.md');
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not delete when confirmation cancelled', async () => {
    mockConfirm.mockResolvedValue(false);
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    const deleteBtn = screen.getByText(/削除.*ゴミ箱/);
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect((window as any).api.vault.deleteNote).not.toHaveBeenCalled();
  });

  it('shows error when delete fails', async () => {
    (window as any).api.vault.deleteNote = vi.fn().mockResolvedValue({ ok: false, error: 'delete error' });
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    const deleteBtn = screen.getByText(/削除.*ゴミ箱/);
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '削除に失敗しました' }));
  });

  it('reveals in folder from context menu', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('フォルダで表示');
    expect((window as any).api.materials.revealInFolder).toHaveBeenCalledWith('/vault/subject/test-note.md');
  });

  it('copies path from context menu', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('パスをコピー');
    expect(writeTextMock).toHaveBeenCalledWith('/vault/subject/test-note.md');
  });

  it('shows material context menu without rename/AI options', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('paper.pdf');
    expect(screen.getByText('開く')).toBeInTheDocument();
    expect(screen.getByText('フォルダで表示')).toBeInTheDocument();
    expect(screen.queryByText('AI で要約')).not.toBeInTheDocument();
    expect(screen.queryByText('複製')).not.toBeInTheDocument();
  });

  it('shows image icon for image files', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('🖼️')).toBeInTheDocument();
  });

  it('shows different view tabs', () => {
    render(<FileList {...DEFAULT_PROPS} view="list" />);
    expect(screen.getByTitle('リスト表示')).toBeInTheDocument();
    expect(screen.getByTitle('ギャラリー表示')).toBeInTheDocument();
    expect(screen.getByTitle('Database View')).toBeInTheDocument();
    expect(screen.getByTitle('Canvas Board')).toBeInTheDocument();
    expect(screen.getByTitle('グラフ')).toBeInTheDocument();
  });

  it('highlights database view tab', () => {
    render(<FileList {...DEFAULT_PROPS} view="database" />);
    const dbBtn = screen.getByTitle('Database View');
    expect(dbBtn.className).toContain('active');
  });

  it('changes to board view', async () => {
    render(<FileList {...DEFAULT_PROPS} view="list" />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Canvas Board'));
    });
    expect(onChangeView).toHaveBeenCalledWith('board');
  });

  it('changes to graph view', async () => {
    render(<FileList {...DEFAULT_PROPS} view="list" />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('グラフ'));
    });
    expect(onChangeView).toHaveBeenCalledWith('graph');
  });

  it('handles drop event to add files', async () => {
    const { container } = render(<FileList {...DEFAULT_PROPS} />);
    const dropzone = container.querySelector('.drop-zone') || container.querySelector('.file-list');

    if (dropzone) {
      const dataTransfer = {
        files: [],
        items: [{ kind: 'file', getAsFile: () => ({ path: '/home/user/test.pdf' }) }],
        types: ['Files'],
      };

      await act(async () => {
        fireEvent.dragEnter(dropzone, { dataTransfer });
      });

      await act(async () => {
        fireEvent.drop(dropzone, {
          dataTransfer: {
            files: [{ path: '/home/user/test.pdf' }],
            items: [],
            types: ['Files'],
          },
        });
      });
    }
  });

  it('opens note from context menu "開く"', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await openContextMenu('test-note');
    await clickMenuItem('開く');
    expect(onSelect).toHaveBeenCalledWith(NOTES[0]);
  });

  it('shows Obsidian option when handler provided', async () => {
    const onOpenInObsidian = vi.fn();
    render(<FileList {...DEFAULT_PROPS} onOpenInObsidian={onOpenInObsidian} />);
    await openContextMenu('test-note');
    await clickMenuItem('Obsidian で開く');
    expect(onOpenInObsidian).toHaveBeenCalledWith('/vault/subject/test-note.md');
  });

  it('triggers rename from context menu when provided', async () => {
    const onRename = vi.fn();
    render(<FileList {...DEFAULT_PROPS} onRename={onRename} />);
    await openContextMenu('test-note');
    await clickMenuItem('名前を変更');
    expect(onRename).toHaveBeenCalledWith(NOTES[0]);
  });
});
