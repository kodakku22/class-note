import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

// --------------------------------------------------------------------------
// Coverage targets for ErrorBoundary.tsx:
//   - Custom fallback rendering (props.fallback branch)
//   - No label branch (label is undefined)
//   - reset button (restores children)
//   - openLogDir method
//   - copyDetails clipboard error branch
//   - buildReport with and without componentStack info
// --------------------------------------------------------------------------

vi.mock('../../src/utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function Boom(): never {
  throw new Error('test error');
}

describe('ErrorBoundary – additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders custom fallback when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom</div>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    // Should NOT show the default error UI
    expect(screen.queryByText(/エラーが発生しました/)).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders error UI without label when label is not provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
    // Label text should not appear
    expect(screen.queryByText('TestView')).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows label div when label is provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary label="TestView">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('TestView')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('reset button restores children rendering', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function MaybeBoom() {
      if (shouldThrow) throw new Error('boom');
      return <div data-testid="recovered">OK</div>;
    }

    render(
      <ErrorBoundary label="test">
        <MaybeBoom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();

    // Fix the component and reset
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /再試行/ }));
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('openLogDir button calls window.api.materials.openLogDir', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockOpenLogDir = vi.fn().mockResolvedValue(undefined);
    (window as any).api = {
      materials: { openLogDir: mockOpenLogDir },
    };

    render(
      <ErrorBoundary label="test">
        <Boom />
      </ErrorBoundary>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ログを開く/ }));
    });
    expect(mockOpenLogDir).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('openLogDir handles error gracefully', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as any).api = {
      materials: {
        openLogDir: vi.fn().mockRejectedValue(new Error('fail')),
      },
    };

    render(
      <ErrorBoundary label="test">
        <Boom />
      </ErrorBoundary>
    );

    // Should not throw
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ログを開く/ }));
    });
    // No crash means the catch block worked
    expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('copyDetails handles clipboard error gracefully', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no clipboard')) },
    });

    render(
      <ErrorBoundary label="test">
        <Boom />
      </ErrorBoundary>
    );

    // Should not throw even if clipboard fails
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /詳細をコピー/ }));
    });
    // No crash
    expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows copied state after successful clipboard copy', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(
      <ErrorBoundary label="test">
        <Boom />
      </ErrorBoundary>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /詳細をコピー/ }));
    });
    // Should show "copied" state
    expect(screen.getByText(/コピーしました/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
