import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WebClipDialog } from '../../src/components/skills/WebClipDialog';

describe('WebClipDialog', () => {
  const DEFAULT_PROPS = {
    vaultPath: '/vault',
    onClose: vi.fn(),
    onClipped: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    DEFAULT_PROPS.onClose = vi.fn();
    DEFAULT_PROPS.onClipped = vi.fn();
    (window as any).api.web = {
      clip: vi.fn().mockResolvedValue({ ok: true, title: 'Test Page', wordCount: 500, filePath: '/vault/Web/test.md' }),
    };
  });

  it('renders dialog title', () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Web ページをクリップ/)).toBeInTheDocument();
  });

  it('renders URL input', () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();
  });

  it('renders help text about Defuddle', () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Defuddle/)).toBeInTheDocument();
  });

  it('disables clip button when URL is empty', () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('クリップ')).toBeDisabled();
  });

  it('enables clip button when URL is entered', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText('https://...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    expect(screen.getByText('クリップ')).not.toBeDisabled();
  });

  it('submits clip request', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText('https://...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('クリップ'));
    });

    expect((window as any).api.web.clip).toHaveBeenCalledWith('/vault', 'https://example.com');
  });

  it('shows success message after clip', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText('https://...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('クリップ'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Test Page/)).toBeInTheDocument();
      expect(screen.getByText(/500 words/)).toBeInTheDocument();
    });
  });

  it('shows error message on failure', async () => {
    (window as any).api.web.clip = vi.fn().mockResolvedValue({ ok: false, error: 'Failed to fetch' });

    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText('https://...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://bad-url.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('クリップ'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument();
    });
  });

  it('shows error for empty URL', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);

    // Can't submit with empty URL (button disabled), but pressing Enter does
    const input = screen.getByPlaceholderText('https://...');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    await waitFor(() => {
      expect(screen.getByText(/URL を入力/)).toBeInTheDocument();
    });
  });

  it('submits on Enter key', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText('https://...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect((window as any).api.web.clip).toHaveBeenCalled();
  });

  it('closes dialog on close button', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      fireEvent.click(screen.getByText('閉じる'));
    });

    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('closes dialog on overlay click', async () => {
    const { container } = render(<WebClipDialog {...DEFAULT_PROPS} />);
    const overlay = container.querySelector('.modal-overlay');

    if (overlay) {
      await act(async () => {
        fireEvent.click(overlay);
      });
    }

    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('does not close on modal body click', async () => {
    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const dialog = screen.getByRole('dialog');

    await act(async () => {
      fireEvent.click(dialog);
    });

    expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();
  });

  it('shows fetching status while busy', async () => {
    // Make clip never resolve
    (window as any).api.web.clip = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<WebClipDialog {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText('https://...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('クリップ'));
    });

    expect(screen.getByText(/取得中/)).toBeInTheDocument();
  });
});
