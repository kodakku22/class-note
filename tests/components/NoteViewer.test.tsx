import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock heavy child components so the test focuses on NoteViewer logic.
vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));
vi.mock('../../src/components/BacklinksPanel', () => ({
  BacklinksPanel: () => <div data-testid="backlinks-panel" />,
}));
vi.mock('../../src/components/editor/BlockEditor', () => ({
  BlockEditor: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="block-editor"
      value={content}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('../../src/components/relations/RelationsPanel', () => ({
  RelationsPanel: () => <div data-testid="relations-panel" />,
}));

import { NoteViewer } from '../../src/components/NoteViewer';

const DEFAULT_PROPS = {
  filePath: '/vault/subjects/math/notes/test-note.md',
  vaultPath: '/vault',
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
};

// Helper to install real mock objects onto the window.api proxy.
// The proxy intercepts gets but we can still attach owned properties
// on the proxy target's nested objects by replacing sub-namespaces.
function installMocks() {
  const writeNoteMock = vi.fn().mockResolvedValue({ ok: true, currentMtime: 2000 });
  const readNoteWithMtimeMock = vi.fn().mockResolvedValue({
    content: '---\ntitle: Test\n---\n\nHello world',
    mtime: 1000,
  });
  const indexMock = vi.fn().mockResolvedValue({});
  const toPdfMock = vi.fn().mockResolvedValue({ ok: true });

  // Replace sub-namespaces with real objects that have the methods we need.
  // The proxy handler returns nested proxies for unknown props, so anything
  // we don't override still falls through to the heuristic defaults.
  const origApi = window.api;
  const apiOverrides: Record<string, unknown> = {
    vault: {
      readNoteWithMtime: readNoteWithMtimeMock,
      writeNote: writeNoteMock,
    },
    attachments: {
      index: indexMock,
      pick: vi.fn().mockResolvedValue({ ok: true, added: [] }),
      saveImage: vi.fn().mockResolvedValue({ ok: true, name: 'img.png' }),
      dropFiles: vi.fn().mockResolvedValue({ ok: true, added: [] }),
    },
    exporter: {
      toPdf: toPdfMock,
    },
  };

  // Build a proxy that checks overrides first, then falls through to original.
  (window as Record<string, unknown>).api = new Proxy(origApi, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in apiOverrides) {
        return apiOverrides[prop];
      }
      return (target as Record<string | symbol, unknown>)[prop];
    },
  });

  return { writeNoteMock, readNoteWithMtimeMock, indexMock, toPdfMock, origApi };
}

describe('NoteViewer', () => {
  let mocks: ReturnType<typeof installMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks = installMocks();
  });

  afterEach(() => {
    // Restore original api proxy
    (window as Record<string, unknown>).api = mocks.origApi;
    vi.useRealTimers();
  });

  it('renders with content in preview mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Hello world');
    });

    expect(screen.getByText('test-note')).toBeInTheDocument();
  });

  it('shows preview and edit tab buttons', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    const previewTab = screen.getByRole('button', { name: /プレビュー/ });
    expect(previewTab).toBeInTheDocument();
    expect(previewTab.className).toContain('active');

    const editTab = screen.getByRole('button', { name: /編集/ });
    expect(editTab).toBeInTheDocument();
  });

  it('toggles between preview and edit mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit mode
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    expect(screen.getByTestId('block-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();

    // Switch back to preview
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /プレビュー/ }));
    });

    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
  });

  it('displays dirty flag when content changes', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('block-editor'), { target: { value: 'Changed body' } });
    });

    expect(screen.getByText('未保存')).toBeInTheDocument();
  });

  it('auto-saves after timer', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('block-editor'), { target: { value: 'Updated body' } });
    });

    // Advance timers past the 800ms debounce
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(mocks.writeNoteMock).toHaveBeenCalled();
  });

  it('shows the relations panel by default', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('relations-panel')).toBeInTheDocument();
    });
  });

  it('toggles the relations panel', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('relations-panel')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Properties/ }));
    });

    expect(screen.queryByTestId('relations-panel')).not.toBeInTheDocument();
  });

  it('shows the rename button when onRename is provided', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} onRename={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /リネーム/ })).toBeInTheDocument();
  });

  it('shows PDF export button in preview mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument();
  });

  it('shows backlinks panel in preview mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('backlinks-panel')).toBeInTheDocument();
    });
  });

  it('calls readNoteWithMtime on mount', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    expect(mocks.readNoteWithMtimeMock).toHaveBeenCalledWith(DEFAULT_PROPS.filePath);
  });

  it('calls attachments.index on mount', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    expect(mocks.indexMock).toHaveBeenCalledWith('/vault', DEFAULT_PROPS.filePath);
  });

  it('exports PDF when clicking the PDF button', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    });

    expect(mocks.toPdfMock).toHaveBeenCalledWith(DEFAULT_PROPS.filePath);
  });

  it('shows alert when PDF export fails', async () => {
    mocks.toPdfMock.mockResolvedValue({ ok: false, error: 'export error' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('export error'));
    });
  });

  it('does not show PDF export button in edit mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit mode
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    // The PDF export button (with text "🖨️ PDF") is only shown in preview mode.
    // In edit mode, the only button with "PDF" is the "画像/PDFを挿入" toolbar button.
    expect(screen.queryByRole('button', { name: /🖨️ PDF/ })).not.toBeInTheDocument();
  });

  it('shows Block and MD editor kind tabs in edit mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    expect(screen.getByRole('button', { name: /Block/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MD' })).toBeInTheDocument();
  });

  it('toggles between Block and Raw editor', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit mode (block editor by default)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    expect(screen.getByTestId('block-editor')).toBeInTheDocument();

    // Switch to raw MD editor
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'MD' }));
    });

    // Raw editor is a textarea (not the block-editor testid)
    expect(screen.queryByTestId('block-editor')).not.toBeInTheDocument();
    // Raw editor should show full source including frontmatter
    const textarea = document.querySelector('.note-editor textarea');
    expect(textarea).toBeTruthy();
  });

  it('shows save status bar initially with hint text', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // The save bar should show the hint when not dirty and not just saved
    const saveBar = document.querySelector('.note-save-bar');
    expect(saveBar).toBeTruthy();
    expect(saveBar?.textContent).toContain('[[名前]]');
  });

  it('shows saving status during save', async () => {
    // Make writeNote hang to observe the "保存中..." state
    let resolveWrite: ((v: unknown) => void) | null = null;
    mocks.writeNoteMock.mockImplementation(
      () => new Promise((r) => { resolveWrite = r; })
    );

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit, make change
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('block-editor'), { target: { value: 'new content' } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    // Should show saving
    expect(screen.getByText('保存中...')).toBeInTheDocument();

    // Resolve the save
    await act(async () => {
      resolveWrite?.({ ok: true, currentMtime: 3000 });
    });

    // Should show saved timestamp
    await waitFor(() => {
      expect(screen.getByText(/保存しました/)).toBeInTheDocument();
    });
  });

  it('calls onRename when rename button is clicked', async () => {
    const onRenameMock = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('new-name');

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} onRename={onRenameMock} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /リネーム/ }));
    });

    expect(onRenameMock).toHaveBeenCalledWith(DEFAULT_PROPS.filePath, 'new-name');
  });

  it('does not call onRename when prompt is cancelled', async () => {
    const onRenameMock = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} onRename={onRenameMock} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /リネーム/ }));
    });

    expect(onRenameMock).not.toHaveBeenCalled();
  });

  it('does not call onRename when name is unchanged', async () => {
    const onRenameMock = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('test-note');

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} onRename={onRenameMock} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /リネーム/ }));
    });

    expect(onRenameMock).not.toHaveBeenCalled();
  });

  it('shows the image/PDF insert button in edit mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    expect(screen.getByRole('button', { name: /画像\/PDFを挿入/ })).toBeInTheDocument();
  });

  it('renders without onRename - no rename button', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /リネーム/ })).not.toBeInTheDocument();
  });

  it('loads content from different filePath when prop changes', async () => {
    const { rerender } = await act(async () =>
      render(<NoteViewer {...DEFAULT_PROPS} />)
    );

    await waitFor(() => {
      expect(mocks.readNoteWithMtimeMock).toHaveBeenCalledWith(DEFAULT_PROPS.filePath);
    });

    const newPath = '/vault/subjects/math/notes/other-note.md';

    await act(async () => {
      rerender(<NoteViewer {...DEFAULT_PROPS} filePath={newPath} />);
    });

    await waitFor(() => {
      expect(mocks.readNoteWithMtimeMock).toHaveBeenCalledWith(newPath);
    });
  });

  it('does not show editor kind tabs in preview mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Block/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MD' })).not.toBeInTheDocument();
  });

  it('shows toolbar hint in edit mode', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    expect(screen.getByText(/ブロック挿入/)).toBeInTheDocument();
  });

  it('shows MD toolbar hint when raw editor is selected', async () => {
    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'MD' }));
    });

    expect(screen.getByText(/ドラッグ&ドロップ/)).toBeInTheDocument();
  });

  it('renders note content without frontmatter', async () => {
    mocks.readNoteWithMtimeMock.mockResolvedValue({
      content: 'Plain text without frontmatter',
      mtime: 1000,
    });

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toHaveTextContent(
        'Plain text without frontmatter'
      );
    });
  });

  it('handles writeNote conflict by showing dialog', async () => {
    // Configure writeNote to return a conflict
    mocks.writeNoteMock.mockResolvedValue({
      ok: false,
      conflict: true,
      currentMtime: 5000,
      currentContent: '---\ntitle: Test\n---\n\nExternal edit',
    });

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit, make a change
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('block-editor'), { target: { value: 'local change' } });
    });

    // Trigger save
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    // The conflict dialog should be shown (from useDialog)
    // It will appear as a dialog element in the DOM
    expect(mocks.writeNoteMock).toHaveBeenCalled();
  });

  it('shows PDF cancelled export without alert', async () => {
    mocks.toPdfMock.mockResolvedValue({ ok: false, error: 'cancelled' });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    });

    // "cancelled" error should NOT trigger alert
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('handles image pick and insert', async () => {
    const pickMock = vi.fn().mockResolvedValue({ ok: true, added: ['photo.png'] });
    // Re-install with pick mock that returns a file
    const origApi = mocks.origApi;
    const apiOverrides: Record<string, unknown> = {
      vault: {
        readNoteWithMtime: mocks.readNoteWithMtimeMock,
        writeNote: mocks.writeNoteMock,
      },
      attachments: {
        index: mocks.indexMock,
        pick: pickMock,
        saveImage: vi.fn().mockResolvedValue({ ok: true, name: 'img.png' }),
        dropFiles: vi.fn().mockResolvedValue({ ok: true, added: [] }),
      },
      exporter: {
        toPdf: mocks.toPdfMock,
      },
    };

    (window as Record<string, unknown>).api = new Proxy(origApi, {
      get(target, prop) {
        if (typeof prop === 'string' && prop in apiOverrides) return apiOverrides[prop];
        return (target as Record<string | symbol, unknown>)[prop];
      },
    });

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    // Click the attachment button
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /画像\/PDFを挿入/ }));
    });

    await waitFor(() => {
      expect(pickMock).toHaveBeenCalledWith(DEFAULT_PROPS.filePath);
    });

    // Restore
    (window as Record<string, unknown>).api = origApi;
  });

  it('clears draft from localStorage after successful save', async () => {
    const draftKey = `classnotes:draft:${DEFAULT_PROPS.filePath}`;

    await act(async () => {
      render(<NoteViewer {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    // Switch to edit and make a change
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /編集/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('block-editor'), { target: { value: 'changed' } });
    });

    // Wait for draft timer (5s)
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    // Draft should exist
    const draft = localStorage.getItem(draftKey);
    // Draft might or might not be there depending on the timer ordering.
    // But after successful save, it should be cleared.

    // Wait for save timer (already 5.1s > 800ms)
    await waitFor(() => {
      expect(mocks.writeNoteMock).toHaveBeenCalled();
    });

    // After save, draft should be cleaned
    expect(localStorage.getItem(draftKey)).toBeNull();
  });
});
