import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CanvasPreviewDialog } from '../../src/components/papers/CanvasPreviewDialog';

const SAMPLE_RESULT = {
  nodes: [
    { id: 'root', label: 'Main Concept', level: 0 },
    { id: 'child1', label: 'Sub Topic A', level: 1 },
    { id: 'child2', label: 'Sub Topic B', level: 1 },
  ],
  edges: [
    { from: 'root', to: 'child1' },
    { from: 'root', to: 'child2' },
  ],
};

describe('CanvasPreviewDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockClear();
    (window as any).api.ai = {
      generateCanvas: vi.fn().mockResolvedValue({ ok: true, result: SAMPLE_RESULT }),
    };
    (window as any).api.materials = {
      openUrl: vi.fn(),
    };
  });

  it('renders dialog title', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    expect(screen.getByText(/AI で生成した Canvas/)).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    (window as any).api.ai.generateCanvas = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    expect(screen.getByText(/生成中/)).toBeInTheDocument();
  });

  it('renders SVG with nodes after loading', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Main Concept')).toBeInTheDocument();
      expect(screen.getByText('Sub Topic A')).toBeInTheDocument();
      expect(screen.getByText('Sub Topic B')).toBeInTheDocument();
    });
  });

  it('shows error state when generation fails', async () => {
    (window as any).api.ai.generateCanvas = vi.fn().mockResolvedValue({
      ok: false,
      error: 'AI provider not configured',
    });

    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/AI provider not configured/)).toBeInTheDocument();
    });
  });

  it('renders SVG element with aria-label', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /マインドマップ/ })).toBeInTheDocument();
    });
  });

  it('closes on close button click', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('閉じる'));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    const { container } = await act(async () => {
      return render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    const overlay = container.querySelector('.modal-overlay');
    if (overlay) {
      await act(async () => {
        fireEvent.click(overlay);
      });
    }

    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on dialog body click', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.click(dialog);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls generateCanvas with filePath', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    expect((window as any).api.ai.generateCanvas).toHaveBeenCalledWith('/vault/note.md');
  });

  it('shows JSON copy button', async () => {
    await act(async () => {
      render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/JSON をコピー/)).toBeInTheDocument();
    });
  });

  it('disables JSON copy button when no result', () => {
    (window as any).api.ai.generateCanvas = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<CanvasPreviewDialog filePath="/vault/note.md" onClose={onClose} />);
    const copyBtn = screen.getByText(/JSON をコピー/);
    expect(copyBtn).toBeDisabled();
  });
});
