import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Viewer } from '../../src/components/Viewer';
import type { FileEntry } from '../../src/types';

vi.mock('../../src/components/NoteViewer', () => ({
  NoteViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="note-viewer">note:{filePath}</div>
  ),
}));

vi.mock('../../src/components/BookViewer', () => ({
  BookViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="book-viewer">book:{filePath}</div>
  ),
}));

vi.mock('../../src/components/papers/PaperViewer', () => ({
  PaperViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="paper-viewer">paper:{filePath}</div>
  ),
}));

vi.mock('../../src/components/PDFViewer', () => ({
  PDFViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="pdf-viewer">pdf:{filePath}</div>
  ),
}));

vi.mock('../../src/components/experiment/ExperimentEditor', () => ({
  ExperimentEditor: ({ filePath }: { filePath: string }) => (
    <div data-testid="experiment-editor">experiment:{filePath}</div>
  ),
}));

vi.mock('../../src/components/ImageViewer', () => ({
  ImageViewer: ({ filePath }: { filePath: string }) => (
    <div data-testid="image-viewer">image:{filePath}</div>
  ),
}));

vi.mock('../../src/components/LearningAgentPanel', () => ({
  LearningAgentPanel: ({ label }: { label: string }) => (
    <div data-testid="learning-agent">{label}</div>
  ),
}));

const baseProps = {
  subject: '数学',
  vaultPath: 'C:\\Vault',
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
  onOpenInObsidian: vi.fn(),
};

function entry(partial: Partial<FileEntry>): FileEntry {
  const name = partial.name ?? 'Note.md';
  return {
    name,
    path: `C:\\Vault\\数学\\notes\\${name}`,
    kind: 'note',
    ext: '.md',
    mtime: 1,
    ...partial,
  };
}

function installApiMock(noteContent = '# Body') {
  const api = {
    vault: {
      readNote: vi.fn().mockResolvedValue(noteContent),
    },
    materials: {
      revealInFolder: vi.fn().mockResolvedValue({ ok: true }),
      openExternal: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

describe('Viewer route selection', () => {
  it('shows an empty state when no file is selected', () => {
    installApiMock();
    render(<Viewer {...baseProps} file={null} />);
    expect(screen.getByText('ファイルを選択して表示')).toBeInTheDocument();
  });

  it('routes normal notes to NoteViewer and shows note actions', async () => {
    installApiMock('---\ntype: lecture\n---\n# Lecture');
    render(<Viewer {...baseProps} file={entry({ name: 'Lecture.md' })} />);

    expect(await screen.findByTestId('note-viewer')).toHaveTextContent('Lecture.md');
    expect(screen.getByTestId('learning-agent')).toHaveTextContent('AI理解');
    expect(screen.getByTitle('Obsidian で開く (グラフ・プラグイン用)')).toBeInTheDocument();
  });

  it('routes book notes by path', async () => {
    installApiMock('---\ntype: book\n---\n# Book');
    render(
      <Viewer
        {...baseProps}
        subject={null}
        file={entry({ name: 'Book.md', path: 'C:\\Vault\\Books\\Book.md' })}
      />
    );

    expect(await screen.findByTestId('book-viewer')).toHaveTextContent('Book.md');
    expect(screen.getByText('読書リスト')).toBeInTheDocument();
  });

  it('routes paper notes by frontmatter type even outside Papers path', async () => {
    installApiMock('---\ntype: paper\n---\n# Paper');
    render(
      <Viewer
        {...baseProps}
        file={entry({ name: 'Source.md', path: 'C:\\Vault\\Reading\\Source.md' })}
      />
    );

    expect(await screen.findByTestId('paper-viewer')).toHaveTextContent('Source.md');
  });

  it('routes experiment notes by frontmatter type', async () => {
    installApiMock('---\ntype: experiment\n---\n# Run');
    render(
      <Viewer
        {...baseProps}
        file={entry({ name: 'Run.md', path: 'C:\\Vault\\Experiments\\Run.md' })}
      />
    );

    expect(await screen.findByTestId('experiment-editor')).toHaveTextContent('Run.md');
  });

  it('routes binary and external file kinds to the correct viewers or fallback', async () => {
    installApiMock();
    const { rerender } = render(
      <Viewer {...baseProps} file={entry({ name: 'slides.pdf', kind: 'pdf', ext: '.pdf' })} />
    );
    expect(await screen.findByTestId('pdf-viewer')).toHaveTextContent('slides.pdf');

    rerender(
      <Viewer {...baseProps} file={entry({ name: 'figure.png', kind: 'image', ext: '.png' })} />
    );
    expect(screen.getByTestId('image-viewer')).toHaveTextContent('figure.png');

    rerender(
      <Viewer {...baseProps} file={entry({ name: 'dataset.xlsx', kind: 'office', ext: '.xlsx' })} />
    );
    expect(screen.getByText('このファイル形式はアプリ内で表示できません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '外部アプリで開く' })).toBeInTheDocument();
  });
});
