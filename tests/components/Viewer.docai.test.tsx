import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Viewer } from '../../src/components/Viewer';
import type { FileEntry } from '../../src/types';

// Replace heavy children with light stubs so we can test the Viewer-level
// integration (🤖 button + DocAIPanel toggle + handleJumpToSource → PDFViewer.requestedPage).

vi.mock('../../src/components/NoteViewer', () => ({
  NoteViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="note-viewer">note:{filePath}</div>
  ),
}));

vi.mock('../../src/components/PDFViewer', () => ({
  PDFViewer: ({
    filePath,
    requestedPageSignal,
  }: {
    filePath: string;
    requestedPageSignal?: { page: number; seq: number };
  }) => (
    <div
      data-testid="pdf-viewer"
      data-requested-page={requestedPageSignal?.page ?? 'none'}
      data-requested-seq={requestedPageSignal?.seq ?? '0'}
    >
      pdf:{filePath}
    </div>
  ),
}));

vi.mock('../../src/components/BookViewer', () => ({
  BookViewer: () => <div data-testid="book-viewer" />,
}));

vi.mock('../../src/components/papers/PaperViewer', () => ({
  PaperViewer: () => <div data-testid="paper-viewer" />,
}));

vi.mock('../../src/components/experiment/ExperimentEditor', () => ({
  ExperimentEditor: () => <div data-testid="experiment-editor" />,
}));

vi.mock('../../src/components/ImageViewer', () => ({
  ImageViewer: () => <div data-testid="image-viewer" />,
}));

vi.mock('../../src/components/LearningAgentPanel', () => ({
  LearningAgentPanel: () => <div data-testid="learning-agent" />,
}));

// Capture the DocAIPanel props so we can drive onJumpToSource from the test.
let lastDocAIProps:
  | { filePath: string; vaultPath?: string; onClose: () => void; onJumpToSource?: (p: { pageNumber?: number; source: string; section: string }) => void }
  | null = null;
vi.mock('../../src/components/ai/DocAIPanel', () => ({
  DocAIPanel: (props: {
    filePath: string;
    vaultPath?: string;
    onClose: () => void;
    onJumpToSource?: (p: { pageNumber?: number; source: string; section: string }) => void;
  }) => {
    lastDocAIProps = props;
    return <div data-testid="docai-panel">docai:{props.filePath}</div>;
  },
}));

const baseProps = {
  subject: 'Math',
  vaultPath: 'C:\\Vault',
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
  onOpenInObsidian: vi.fn(),
};

function entry(partial: Partial<FileEntry>): FileEntry {
  const name = partial.name ?? 'Note.md';
  return {
    name,
    path: `C:\\Vault\\Math\\notes\\${name}`,
    kind: 'note',
    ext: '.md',
    mtime: 1,
    ...partial,
  };
}

function installApiMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    vault: { readNote: vi.fn().mockResolvedValue('# Body') },
    materials: { revealInFolder: vi.fn(), openExternal: vi.fn() },
  };
}

describe('Viewer DocAI integration', () => {
  it('shows 🤖 button only for notes and pdfs', () => {
    installApiMock();
    const { rerender } = render(<Viewer {...baseProps} file={entry({ name: 'a.md' })} />);
    expect(screen.getByTitle('AI アシスタント (DocAI)')).toBeInTheDocument();

    rerender(<Viewer {...baseProps} file={entry({ name: 'doc.pdf', kind: 'pdf', ext: '.pdf' })} />);
    expect(screen.getByTitle('AI アシスタント (DocAI)')).toBeInTheDocument();

    rerender(<Viewer {...baseProps} file={entry({ name: 'pic.png', kind: 'image', ext: '.png' })} />);
    expect(screen.queryByTitle('AI アシスタント (DocAI)')).not.toBeInTheDocument();
  });

  it('toggles the DocAIPanel on 🤖 click and reflects aria-pressed', async () => {
    installApiMock();
    render(<Viewer {...baseProps} file={entry({ name: 'a.md' })} />);
    const btn = screen.getByTitle('AI アシスタント (DocAI)');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByTestId('docai-panel')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('docai-panel')).not.toBeInTheDocument();
  });

  it('passes vaultPath through to the DocAIPanel', async () => {
    installApiMock();
    render(<Viewer {...baseProps} file={entry({ name: 'a.md' })} />);
    fireEvent.click(screen.getByTitle('AI アシスタント (DocAI)'));
    await waitFor(() => expect(lastDocAIProps).not.toBeNull());
    expect(lastDocAIProps?.vaultPath).toBe('C:\\Vault');
  });

  it('forwards handleJumpToSource(pageNumber) to PDFViewer.requestedPage', async () => {
    installApiMock();
    render(
      <Viewer {...baseProps} file={entry({ name: 'doc.pdf', kind: 'pdf', ext: '.pdf' })} />
    );
    fireEvent.click(screen.getByTitle('AI アシスタント (DocAI)'));
    await waitFor(() => expect(lastDocAIProps).not.toBeNull());

    const pdf = screen.getByTestId('pdf-viewer');
    expect(pdf).toHaveAttribute('data-requested-page', 'none');

    // Simulate DocAIPanel asking Viewer to jump to page 3.
    lastDocAIProps?.onJumpToSource?.({ pageNumber: 3, source: 'doc.pdf', section: 'Page 3' });
    await waitFor(() => {
      expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-requested-page', '3');
    });
  });

  it('jumping to the same page twice increments the signal seq', async () => {
    installApiMock();
    render(
      <Viewer {...baseProps} file={entry({ name: 'doc.pdf', kind: 'pdf', ext: '.pdf' })} />
    );
    fireEvent.click(screen.getByTitle('AI アシスタント (DocAI)'));
    await waitFor(() => expect(lastDocAIProps).not.toBeNull());

    lastDocAIProps?.onJumpToSource?.({ pageNumber: 5, source: 'doc.pdf', section: 'Page 5' });
    await waitFor(() => {
      expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-requested-page', '5');
    });
    const firstSeq = screen.getByTestId('pdf-viewer').getAttribute('data-requested-seq');

    lastDocAIProps?.onJumpToSource?.({ pageNumber: 5, source: 'doc.pdf', section: 'Page 5' });
    await waitFor(() => {
      const secondSeq = screen.getByTestId('pdf-viewer').getAttribute('data-requested-seq');
      expect(secondSeq).not.toBe(firstSeq);
    });
    // Page itself stays the same (still 5)
    expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-requested-page', '5');
  });

  it('falls back to onJumpToFile when current file is a note (not pdf)', async () => {
    installApiMock();
    const onJumpToFile = vi.fn();
    render(
      <Viewer
        {...baseProps}
        onJumpToFile={onJumpToFile}
        file={entry({ name: 'note.md' })}
      />
    );
    fireEvent.click(screen.getByTitle('AI アシスタント (DocAI)'));
    await waitFor(() => expect(lastDocAIProps).not.toBeNull());

    // Citation pointing to a different file: should call onJumpToFile.
    lastDocAIProps?.onJumpToSource?.({
      pageNumber: undefined,
      source: 'other.md',
      section: '見出し',
      // Cast to access optional filePath
      ...({ filePath: 'C:\\Vault\\Math\\notes\\other.md' } as { filePath: string }),
    });
    await waitFor(() => {
      expect(onJumpToFile).toHaveBeenCalledWith('C:\\Vault\\Math\\notes\\other.md');
    });
  });
});
