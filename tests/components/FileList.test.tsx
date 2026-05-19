import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FileList } from '../../src/components/FileList';
import type { FileEntry } from '../../src/types';

// Mock CanvasPreviewDialog
vi.mock('../../src/components/papers/CanvasPreviewDialog', () => ({
  CanvasPreviewDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="canvas-dialog"><button onClick={onClose}>close</button></div>
  ),
}));

// Mock Dialog
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    {
      alert: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
    },
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

describe('FileList', () => {
  const onSelect = vi.fn();
  const onSelectVirtual = vi.fn();
  const onChanged = vi.fn();
  const onChangeView = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onSelect.mockClear();
    onSelectVirtual.mockClear();
    onChanged.mockClear();
    onChangeView.mockClear();
    (window as any).api = {
      vault: {
        createTodaysNote: vi.fn().mockResolvedValue({ filePath: '/vault/subject/2024-01-01.md' }),
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
        summarizeAndApply: vi.fn().mockResolvedValue({ ok: true, result: { oneLiner: 'Summary' } }),
        autoTag: vi.fn().mockResolvedValue({ ok: true, result: { tags: ['ml'], reasoning: 'R' } }),
        optimizeMarkdown: vi.fn().mockResolvedValue({ ok: true, result: { optimized: '# X', changes: ['c1'] } }),
      },
      latex: {
        exportNote: vi.fn().mockResolvedValue({ ok: true, outputDir: '/out', usedPandoc: true }),
      },
    };
  });

  const NOTES = [makeNote('lecture-01.md'), makeNote('summary.md')];
  const MATERIALS = [makeMaterial('paper.pdf'), makeMaterial('slides.pptx', 'office')];
  const DEFAULT_PROPS = {
    vaultPath: '/vault',
    subject: 'math' as string | null,
    files: { notes: NOTES, materials: MATERIALS },
    activeFile: null as FileEntry | null,
    virtualFile: null as { kind: 'qa' } | null,
    onSelect,
    onSelectVirtual,
    onChanged,
    onChangeView,
  };

  it('shows empty state when no subject', () => {
    render(<FileList {...DEFAULT_PROPS} subject={null} />);
    expect(screen.getByText(/サイドバーから科目/)).toBeInTheDocument();
  });

  it('shows subject name', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('math')).toBeInTheDocument();
  });

  it('shows note count and material count', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText(/ノート 2 件/)).toBeInTheDocument();
    expect(screen.getByText(/資料 2 件/)).toBeInTheDocument();
  });

  it('renders note items', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('lecture-01')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
  });

  it('renders material items', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('slides.pptx')).toBeInTheDocument();
  });

  it('selects file on click', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('lecture-01'));
    });
    expect(onSelect).toHaveBeenCalledWith(NOTES[0]);
  });

  it('highlights active file', () => {
    const { container } = render(<FileList {...DEFAULT_PROPS} activeFile={NOTES[0]} />);
    const activeItems = container.querySelectorAll('.file-item.active');
    expect(activeItems.length).toBeGreaterThan(0);
  });

  it('shows virtual items', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('科目概要')).toBeInTheDocument();
    expect(screen.getByText('AIに質問')).toBeInTheDocument();
    expect(screen.getByText('今日の授業ノートを作成')).toBeInTheDocument();
  });

  it('selects QA on click', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('AIに質問'));
    });
    expect(onSelectVirtual).toHaveBeenCalledWith('qa');
  });

  it('selects overview on click', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('科目概要'));
    });
    expect(onSelectVirtual).toHaveBeenCalledWith('overview');
  });

  it('shows empty note state', () => {
    render(<FileList {...DEFAULT_PROPS} files={{ notes: [], materials: MATERIALS }} />);
    expect(screen.getByText('まだありません')).toBeInTheDocument();
  });

  it('shows empty material state', () => {
    render(<FileList {...DEFAULT_PROPS} files={{ notes: NOTES, materials: [] }} />);
    expect(screen.getByText(/ドラッグ&ドロップ/)).toBeInTheDocument();
  });

  it('shows view tabs when onChangeView provided', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    const btns = document.querySelectorAll('.view-tab');
    expect(btns.length).toBe(5);
  });

  it('changes view on tab click', async () => {
    render(<FileList {...DEFAULT_PROPS} view="list" />);
    const galleryBtn = screen.getByTitle('ギャラリー表示');
    await act(async () => {
      fireEvent.click(galleryBtn);
    });
    expect(onChangeView).toHaveBeenCalledWith('gallery');
  });

  it('highlights active view tab', () => {
    render(<FileList {...DEFAULT_PROPS} view="gallery" />);
    const galleryBtn = screen.getByTitle('ギャラリー表示');
    expect(galleryBtn.className).toContain('active');
  });

  it('shows dropzone hint', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText(/ファイルをここにドロップ/)).toBeInTheDocument();
  });

  it('creates todays note on click', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('今日の授業ノートを作成'));
    });
    expect((window as any).api.vault.createTodaysNote).toHaveBeenCalledWith('/vault', 'math');
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows context menu on right-click', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('lecture-01'));
    });
    expect(screen.getByText('開く')).toBeInTheDocument();
    expect(screen.getByText(/削除/)).toBeInTheDocument();
  });

  it('shows note icon for notes', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    const noteIcons = screen.getAllByText('📝');
    expect(noteIcons.length).toBeGreaterThan(0);
  });

  it('shows office icon and external badge', () => {
    const { container } = render(<FileList {...DEFAULT_PROPS} />);
    const externalIcons = container.querySelectorAll('.external-icon');
    expect(externalIcons.length).toBe(1);
  });

  it('strips .md extension from note names', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('lecture-01')).toBeInTheDocument();
    expect(screen.queryByText('lecture-01.md')).not.toBeInTheDocument();
  });

  it('does not strip extension from materials', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
  });

  it('shows section labels', () => {
    render(<FileList {...DEFAULT_PROPS} />);
    expect(screen.getByText('ノート')).toBeInTheDocument();
    expect(screen.getByText('資料')).toBeInTheDocument();
    expect(screen.getByText('この科目で')).toBeInTheDocument();
  });

  it('shows AI menu items in context menu for notes', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('lecture-01'));
    });
    expect(screen.getByText('AI で要約')).toBeInTheDocument();
    expect(screen.getByText('AI でタグ付け')).toBeInTheDocument();
    expect(screen.getByText('AI で Canvas 生成')).toBeInTheDocument();
    expect(screen.getByText('AI で Markdown 整形')).toBeInTheDocument();
  });

  it('shows LaTeX export in context menu for notes', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('lecture-01'));
    });
    expect(screen.getByText(/LaTeX.*書出/)).toBeInTheDocument();
  });

  it('does not show rename for materials', async () => {
    render(<FileList {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('paper.pdf'));
    });
    expect(screen.queryByText('名前を変更')).not.toBeInTheDocument();
  });

  it('shows rename when onRename provided for notes', async () => {
    const onRename = vi.fn();
    render(<FileList {...DEFAULT_PROPS} onRename={onRename} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('lecture-01'));
    });
    expect(screen.getByText('名前を変更')).toBeInTheDocument();
  });

  it('shows Obsidian menu when handler provided', async () => {
    const onOpenInObsidian = vi.fn();
    render(<FileList {...DEFAULT_PROPS} onOpenInObsidian={onOpenInObsidian} />);
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('lecture-01'));
    });
    expect(screen.getByText('Obsidian で開く')).toBeInTheDocument();
  });

  it('highlights QA virtual when active', () => {
    const { container } = render(
      <FileList {...DEFAULT_PROPS} virtualFile={{ kind: 'qa' }} />
    );
    const qaItem = container.querySelectorAll('.file-item.virtual.active');
    expect(qaItem.length).toBe(1);
  });
});
