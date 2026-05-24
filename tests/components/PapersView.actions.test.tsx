import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Controllable Dialog mock
const mockAlert = vi.fn().mockResolvedValue(undefined);
const mockConfirm = vi.fn().mockResolvedValue(true);
const mockPrompt = vi.fn().mockResolvedValue('generic');
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    { alert: mockAlert, confirm: mockConfirm, prompt: mockPrompt },
    null,
  ],
}));

// Mock PaperFilterBar
vi.mock('../../src/components/papers/PaperFilterBar', () => ({
  PaperFilterBar: ({ filters, onChange }: any) => (
    <div data-testid="filter-bar">
      <input
        data-testid="query-input"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
      />
      <select
        data-testid="status-filter"
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
      >
        <option value="all">all</option>
        <option value="read">read</option>
        <option value="to-read">to-read</option>
      </select>
      <select
        data-testid="tag-filter"
        value={filters.tag}
        onChange={(e) => onChange({ ...filters, tag: e.target.value })}
      >
        <option value="all">all</option>
        <option value="transformer">transformer</option>
        <option value="nlp">nlp</option>
      </select>
    </div>
  ),
}));

// Mock PaperImportDialog
vi.mock('../../src/components/papers/PaperImportDialog', () => ({
  PaperImportDialog: ({ onClose, onImported }: any) => (
    <div data-testid="import-dialog">
      <button onClick={onClose}>close</button>
      <button onClick={() => onImported('/vault/_papers/imported.md')}>import</button>
    </div>
  ),
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { PapersView } from '../../src/components/papers/PapersView';
import type { PaperEntry } from '../../src/types';

const SAMPLE_PAPERS: PaperEntry[] = [
  {
    filePath: '/vault/_papers/attention.md',
    fileName: 'attention.md',
    mtime: 1000,
    meta: {
      title: 'Attention Is All You Need',
      authors: ['Vaswani', 'Shazeer'],
      year: 2017,
      venue: 'NeurIPS',
      status: 'read',
      tags: ['transformer', 'nlp'],
      bibkey: 'vaswani2017',
      summary: 'A summary of the paper',
    },
    bodyPreview: 'A preview of the paper...',
  },
  {
    filePath: '/vault/_papers/bert.md',
    fileName: 'bert.md',
    mtime: 2000,
    meta: {
      title: 'BERT: Pre-training',
      authors: ['Devlin', 'Chang'],
      year: 2019,
      venue: 'NAACL',
      status: 'to-read',
      tags: ['nlp'],
      bibkey: 'devlin2019',
    },
    bodyPreview: 'BERT preview...',
  },
  {
    filePath: '/vault/_papers/gpt3.md',
    fileName: 'gpt3.md',
    mtime: 3000,
    meta: {
      title: 'Language Models are Few-Shot Learners',
      authors: 'Brown et al.',
      year: 2020,
      venue: 'NeurIPS',
      status: 'reading',
      tags: ['llm'],
    },
    bodyPreview: 'GPT-3 preview...',
  },
  {
    filePath: '/vault/_papers/noauthor.md',
    fileName: 'noauthor.md',
    mtime: 500,
    meta: {
      title: 'No Author Paper',
      year: 2021,
      status: 'skimmed',
      tags: 'single-tag',
    },
    bodyPreview: '',
  },
  {
    filePath: '/vault/_papers/empty-authors.md',
    fileName: 'empty-authors.md',
    mtime: 400,
    meta: {
      title: 'Empty Authors',
      authors: [],
      status: 'cited',
      tags: ['transformer', 'nlp', 'attention', 'extra-tag'],
    },
    bodyPreview: '',
  },
];

describe('PapersView context menu & actions', () => {
  const onOpenFile = vi.fn();
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAlert.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
    mockPrompt.mockResolvedValue('generic');
    onOpenFile.mockClear();
    onChanged.mockClear();
    (window as any).api = {
      papers: {
        list: vi.fn().mockResolvedValue(SAMPLE_PAPERS),
        delete: vi.fn().mockResolvedValue({ ok: true }),
        create: vi.fn().mockResolvedValue({ ok: true, filePath: '/vault/_papers/new.md' }),
        pickBibtexFile: vi.fn().mockResolvedValue(null),
        importFromBibtex: vi.fn().mockResolvedValue({
          ok: true, imported: 2, skipped: 1, errors: [], filePaths: ['/vault/_papers/imp1.md'],
        }),
        exportBibtex: vi.fn().mockResolvedValue({
          ok: true, count: 3, filePath: '/vault/refs.bib', skipped: 1,
        }),
      },
      materials: {
        revealInFolder: vi.fn(),
        openUrl: vi.fn(),
      },
      ai: {
        summarizeAndApply: vi.fn().mockResolvedValue({ ok: true, result: { oneLiner: 'Sum' } }),
        autoTag: vi.fn().mockResolvedValue({ ok: true, result: { tags: ['ml'], reasoning: 'R' } }),
        applyTags: vi.fn().mockResolvedValue({ ok: true }),
        learningCoachAndSave: vi.fn().mockResolvedValue({ ok: true, result: { diagnosis: 'D' } }),
      },
      latex: {
        exportNote: vi.fn().mockResolvedValue({ ok: true, texPath: '/out/main.tex', usedPandoc: true }),
      },
    };
  });

  async function waitForPapers() {
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    });
  }

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

  // --- Context menu actions ---

  it('opens file from context menu', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('開く');
    expect(onOpenFile).toHaveBeenCalledWith('/vault/_papers/attention.md');
  });

  it('reveals in folder from context menu', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('フォルダで表示');
    expect((window as any).api.materials.revealInFolder).toHaveBeenCalledWith('/vault/_papers/attention.md');
  });

  it('copies bibkey from context menu', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem(/引用キーをコピー/);
    expect(writeTextMock).toHaveBeenCalledWith('[@vaswani2017]');
  });

  it('runs AI summarize from context menu', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} onChanged={onChanged} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('AI で要約');
    expect((window as any).api.ai.summarizeAndApply).toHaveBeenCalledWith('/vault/_papers/attention.md');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '要約完了' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows error when AI summarize fails', async () => {
    (window as any).api.ai.summarizeAndApply = vi.fn().mockResolvedValue({ ok: false, error: 'fail' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('AI で要約');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '要約に失敗しました' }));
  });

  it('runs AI learning coach from context menu', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} onChanged={onChanged} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('論文向けAI理解支援');
    expect((window as any).api.ai.learningCoachAndSave).toHaveBeenCalledWith('/vault/_papers/attention.md', 'paper');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI理解支援を保存しました' }));
  });

  it('shows error when learning coach fails', async () => {
    (window as any).api.ai.learningCoachAndSave = vi.fn().mockResolvedValue({ ok: false, error: 'coach err' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('論文向けAI理解支援');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI理解支援に失敗しました' }));
  });

  it('runs LaTeX export from context menu', async () => {
    mockPrompt.mockResolvedValue('neurips');
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('LaTeX で書出');
    expect((window as any).api.latex.exportNote).toHaveBeenCalledWith('/vault', '/vault/_papers/attention.md', 'neurips');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'LaTeX 書出完了' }));
  });

  it('rejects invalid LaTeX style', async () => {
    mockPrompt.mockResolvedValue('invalid-style');
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('LaTeX で書出');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'スタイルが不正です' }));
    expect((window as any).api.latex.exportNote).not.toHaveBeenCalled();
  });

  it('cancels LaTeX export when prompt returns null', async () => {
    mockPrompt.mockResolvedValue(null);
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('LaTeX で書出');
    expect((window as any).api.latex.exportNote).not.toHaveBeenCalled();
  });

  it('shows error when LaTeX export fails', async () => {
    mockPrompt.mockResolvedValue('generic');
    (window as any).api.latex.exportNote = vi.fn().mockResolvedValue({ ok: false, error: 'pandoc missing' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('LaTeX で書出');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'LaTeX 書出失敗' }));
  });

  it('runs AI auto-tag and applies', async () => {
    mockConfirm.mockResolvedValue(true);
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('AI でタグ付け');
    expect((window as any).api.ai.autoTag).toHaveBeenCalledWith('/vault/_papers/attention.md');
    expect((window as any).api.ai.applyTags).toHaveBeenCalled();
  });

  it('does not apply tags when user cancels', async () => {
    mockConfirm.mockResolvedValue(false);
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('AI でタグ付け');
    expect((window as any).api.ai.applyTags).not.toHaveBeenCalled();
  });

  it('shows error when auto-tag fails', async () => {
    (window as any).api.ai.autoTag = vi.fn().mockResolvedValue({ ok: false, error: 'tag err' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('AI でタグ付け');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'タグ提案失敗' }));
  });

  it('deletes paper from context menu', async () => {
    mockConfirm.mockResolvedValue(true);
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem(/削除.*ゴミ箱/);
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '削除しますか？' }));
    expect((window as any).api.papers.delete).toHaveBeenCalledWith('/vault/_papers/attention.md');
  });

  it('does not delete when user cancels', async () => {
    mockConfirm.mockResolvedValue(false);
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem(/削除.*ゴミ箱/);
    expect((window as any).api.papers.delete).not.toHaveBeenCalled();
  });

  it('shows error when delete fails', async () => {
    mockConfirm.mockResolvedValue(true);
    (window as any).api.papers.delete = vi.fn().mockResolvedValue({ ok: false, error: 'del err' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem(/削除.*ゴミ箱/);
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: '削除失敗' }));
  });

  // --- Sort interactions ---

  it('toggles sort direction when clicking same column', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    // Default sort is mtime desc. Click year → year desc
    await act(async () => { fireEvent.click(screen.getByText('年')); });
    // Click year again → year asc
    await act(async () => { fireEvent.click(screen.getByText('年')); });
    const arrow = document.querySelector('.sort-arrow');
    expect(arrow?.textContent).toContain('▲');
  });

  it('sorts by authors', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText('著者')); });
    // Authors sort defaults to asc
    const arrow = document.querySelector('.sort-arrow');
    expect(arrow?.textContent).toContain('▲');
  });

  it('sorts by status', async () => {
    // Sort toolbar label is now "状態" (was "ステータス" in the old
    // column-header row replaced by HANDOFF Phase 1.3).
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText('状態')); });
    const arrow = document.querySelector('.sort-arrow');
    expect(arrow).toBeTruthy();
  });

  // --- Filter interactions ---

  it('filters by search query', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    const input = screen.getByTestId('query-input');
    await act(async () => { fireEvent.change(input, { target: { value: 'attention' } }); });
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
      expect(screen.queryByText('BERT: Pre-training')).not.toBeInTheDocument();
    });
  });

  it('filters by status', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    const select = screen.getByTestId('status-filter');
    await act(async () => { fireEvent.change(select, { target: { value: 'read' } }); });
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
      expect(screen.queryByText('BERT: Pre-training')).not.toBeInTheDocument();
    });
  });

  it('filters by tag', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    const select = screen.getByTestId('tag-filter');
    await act(async () => { fireEvent.change(select, { target: { value: 'transformer' } }); });
    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
      expect(screen.queryByText('BERT: Pre-training')).not.toBeInTheDocument();
    });
  });

  // --- firstAuthor edge cases ---

  it('omits missing author / year / venue from the subtitle', async () => {
    // In the old paradigm each missing field rendered "—" in its own
    // cell. The HANDOFF row paradigm collapses author/year/venue into
    // a subtitle line where empty parts are filtered out — so papers
    // without authors simply have no subtitle (or a shorter one).
    // We verify the renderer doesn't leak placeholder dashes into the
    // visible text.
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    // The em-dash literal should not appear as a standalone cell text.
    // The empty-authors paper (no authors, no year, no venue) renders
    // with no subtitle, not with three dashes.
    const subtitleDashes = document
      .querySelectorAll('.papers-subtitle')
      ;
    Array.from(subtitleDashes).forEach((el) => {
      expect(el.textContent).not.toMatch(/^—$/);
    });
  });

  it('shows +N for papers with more than 3 tags', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    // empty-authors.md has 4 tags
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows paper summary when present', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    const summaries = document.querySelectorAll('.papers-summary');
    expect(summaries.length).toBeGreaterThan(0);
  });

  // --- BibTeX export ---

  it('exports BibTeX successfully', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText(/BibTeX 書出/)); });
    await waitFor(() => {
      expect((window as any).api.papers.exportBibtex).toHaveBeenCalledWith('/vault');
      expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'BibTeX を書出しました' }));
    });
  });

  it('shows error when BibTeX export fails', async () => {
    (window as any).api.papers.exportBibtex = vi.fn().mockResolvedValue({ ok: false, error: 'export err' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText(/BibTeX 書出/)); });
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'BibTeX 書出失敗' }));
    });
  });

  // --- BibTeX import ---

  it('imports BibTeX when file is picked', async () => {
    (window as any).api.papers.pickBibtexFile = vi.fn().mockResolvedValue({ token: 'abc123' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} onChanged={onChanged} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText(/BibTeX取込/)); });
    await waitFor(() => {
      expect((window as any).api.papers.importFromBibtex).toHaveBeenCalledWith('/vault', 'abc123');
      expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'BibTeX を取り込みました' }));
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it('does nothing when BibTeX file pick is cancelled', async () => {
    (window as any).api.papers.pickBibtexFile = vi.fn().mockResolvedValue(null);
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText(/BibTeX取込/)); });
    expect((window as any).api.papers.importFromBibtex).not.toHaveBeenCalled();
  });

  it('shows error when BibTeX import fails', async () => {
    (window as any).api.papers.pickBibtexFile = vi.fn().mockResolvedValue({ token: 'abc' });
    (window as any).api.papers.importFromBibtex = vi.fn().mockResolvedValue({
      ok: false, imported: 0, skipped: 0, errors: ['parse error'], filePaths: [],
    });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText(/BibTeX取込/)); });
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'BibTeX 取込失敗' }));
    });
  });

  // --- Create paper dialog ---

  it('creates paper from dialog', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText('+ 論文を追加')); });
    expect(screen.getByText('📑 論文を追加')).toBeInTheDocument();

    // Fill title (required)
    const dialog = screen.getByRole('dialog');
    const titleInput = dialog.querySelectorAll('input')[0];
    await act(async () => { fireEvent.change(titleInput, { target: { value: 'New Paper Title' } }); });
    const submitBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('作成')
    )!;
    await act(async () => { fireEvent.click(submitBtn); });
    expect((window as any).api.papers.create).toHaveBeenCalledWith('/vault', expect.objectContaining({
      title: 'New Paper Title',
    }));
    expect(onOpenFile).toHaveBeenCalledWith('/vault/_papers/new.md');
  });

  it('shows error when title is empty', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText('+ 論文を追加')); });
    // Dialog is now open with "作成" button inside it
    const dialog = screen.getByRole('dialog');
    const submitBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('作成')
    )!;
    await act(async () => { fireEvent.click(submitBtn); });
    expect(screen.getByText(/タイトルは必須です/)).toBeInTheDocument();
  });

  it('shows error when paper creation fails', async () => {
    (window as any).api.papers.create = vi.fn().mockResolvedValue({ ok: false, error: 'create err' });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText('+ 論文を追加')); });
    const dialog = screen.getByRole('dialog');
    const inputs = dialog.querySelectorAll('input');
    await act(async () => { fireEvent.change(inputs[0], { target: { value: 'Test' } }); });
    const submitBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('作成')
    )!;
    await act(async () => { fireEvent.click(submitBtn); });
    expect(screen.getByText(/create err/)).toBeInTheDocument();
  });

  it('closes create dialog on cancel', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText('+ 論文を追加')); });
    await act(async () => { fireEvent.click(screen.getByText('キャンセル')); });
    expect(screen.queryByText('📑 論文を追加')).not.toBeInTheDocument();
  });

  it('shows "no filter match" state', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    const input = screen.getByTestId('query-input');
    await act(async () => { fireEvent.change(input, { target: { value: 'xyznonexistent' } }); });
    await waitFor(() => {
      expect(screen.getByText('条件に合う論文がありません')).toBeInTheDocument();
    });
  });

  it('copies path when paper has no bibkey', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    // gpt3.md has no bibkey
    await openContextMenu('Language Models are Few-Shot Learners');
    await clickMenuItem('パスをコピー');
    expect(writeTextMock).toHaveBeenCalledWith('/vault/_papers/gpt3.md');
  });

  // --- Import dialog ---

  it('closes import dialog and reloads', async () => {
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await act(async () => { fireEvent.click(screen.getByText(/📥 取込/)); });
    expect(screen.getByTestId('import-dialog')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('import')); });
    expect(onOpenFile).toHaveBeenCalledWith('/vault/_papers/imported.md');
  });

  // --- Loading error ---

  it('handles list failure gracefully', async () => {
    (window as any).api.papers.list = vi.fn().mockRejectedValue(new Error('list failed'));
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      expect(screen.getByText('まだ論文がありません')).toBeInTheDocument();
    });
  });

  // --- LaTeX fallback message ---

  it('shows fallback message when LaTeX export without Pandoc', async () => {
    mockPrompt.mockResolvedValue('generic');
    (window as any).api.latex.exportNote = vi.fn().mockResolvedValue({ ok: true, texPath: '/out/main.tex', usedPandoc: false });
    await act(async () => { render(<PapersView vaultPath="/vault" onOpenFile={onOpenFile} />); });
    await waitForPapers();
    await openContextMenu('Attention Is All You Need');
    await clickMenuItem('LaTeX で書出');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('簡易変換'),
    }));
  });
});
