import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock child components with changeColor and rename callbacks
vi.mock('../../src/components/cards/NoteCard', () => ({
  NoteCard: ({ fileName, onOpen, onChangeColor, onRename }: any) => (
    <div data-testid="note-card">
      <span onClick={onOpen}>{fileName.replace(/\.md$/, '')}</span>
      <button data-testid={`color-${fileName}`} onClick={() => onChangeColor('red')}>color</button>
      <button data-testid={`color-default-${fileName}`} onClick={() => onChangeColor('default')}>default</button>
      <button data-testid={`rename-${fileName}`} onClick={onRename}>rename</button>
    </div>
  ),
}));
vi.mock('../../src/components/cards/MaterialCard', () => ({
  MaterialCard: ({ fileName, onOpen }: any) => (
    <div data-testid="material-card" onClick={onOpen}>{fileName}</div>
  ),
}));

import { GalleryView } from '../../src/views/GalleryView';

const SAMPLE_NOTES = [
  { name: 'Calc.md', path: '/vault/Math/notes/Calc.md', kind: 'note' as const, ext: '.md', mtime: 3000, meta: { type: 'lecture', color: 'blue' }, preview: 'calculus' },
  { name: 'Summary.md', path: '/vault/Math/notes/Summary.md', kind: 'note' as const, ext: '.md', mtime: 2000, meta: { type: 'summary' }, preview: 'summary' },
];

const SAMPLE_MATERIALS = [
  { name: 'diagram.png', path: '/vault/Math/materials/diagram.png', kind: 'image' as const, ext: '.png', mtime: 1500 },
];

describe('GalleryView actions', () => {
  const onOpenFile = vi.fn();
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onOpenFile.mockClear();
    onChanged.mockClear();
    (window as any).api = {
      vault: {
        listFilesEnriched: vi.fn().mockResolvedValue({ notes: SAMPLE_NOTES, materials: SAMPLE_MATERIALS }),
        readNote: vi.fn().mockResolvedValue('---\ncolor: blue\n---\ncontent here'),
        writeNote: vi.fn().mockResolvedValue({ ok: true }),
        renameNote: vi.fn().mockResolvedValue({ ok: true }),
      },
    };
  });

  it('changes note color and calls onChanged', async () => {
    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('color-Calc.md'));
    });

    expect((window as any).api.vault.readNote).toHaveBeenCalledWith('/vault/Math/notes/Calc.md');
    expect((window as any).api.vault.writeNote).toHaveBeenCalledWith(
      '/vault/Math/notes/Calc.md',
      expect.stringContaining('color: red'),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('removes color when set to default', async () => {
    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('color-default-Calc.md'));
    });

    expect((window as any).api.vault.writeNote).toHaveBeenCalledWith(
      '/vault/Math/notes/Calc.md',
      expect.not.stringContaining('color:'),
    );
  });

  it('renames note on prompt input', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('NewName');

    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('rename-Calc.md'));
    });

    expect((window as any).api.vault.renameNote).toHaveBeenCalledWith('/vault', '/vault/Math/notes/Calc.md', 'NewName');
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not rename when prompt returns null', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('rename-Calc.md'));
    });

    expect((window as any).api.vault.renameNote).not.toHaveBeenCalled();
  });

  it('does not rename when prompt returns same name', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Calc');

    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('rename-Calc.md'));
    });

    expect((window as any).api.vault.renameNote).not.toHaveBeenCalled();
  });

  it('alerts when rename fails', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Bad Name');
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    (window as any).api.vault.renameNote = vi.fn().mockResolvedValue({ ok: false, error: 'invalid chars' });

    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('rename-Calc.md'));
    });

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('invalid chars'));
  });

  it('shows only notes section when no materials', async () => {
    (window as any).api.vault.listFilesEnriched = vi.fn().mockResolvedValue({
      notes: SAMPLE_NOTES,
      materials: [],
    });

    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('Calc')).toBeInTheDocument());

    expect(screen.getByText('ノート')).toBeInTheDocument();
    expect(screen.queryByText('資料')).not.toBeInTheDocument();
  });

  it('shows only materials section when filtered notes are empty', async () => {
    (window as any).api.vault.listFilesEnriched = vi.fn().mockResolvedValue({
      notes: [],
      materials: SAMPLE_MATERIALS,
    });

    await act(async () => {
      render(<GalleryView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} onChanged={onChanged} />);
    });
    await waitFor(() => expect(screen.getByText('diagram.png')).toBeInTheDocument());

    expect(screen.queryByText('ノート')).not.toBeInTheDocument();
    expect(screen.getByText('資料')).toBeInTheDocument();
  });
});
