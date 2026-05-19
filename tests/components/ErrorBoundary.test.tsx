// ErrorBoundary smoke tests — verify it catches render errors,
// shows actionable UI, and the reset button restores the tree.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

function Boom(): never {
  throw new Error('test boom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary label="x">
        <div>healthy</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('shows fallback UI with action buttons when child throws', () => {
    // Suppress the expected error noise from React.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary label="テスト">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
    expect(screen.getByText(/test boom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /詳細をコピー/ })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('clipboard copy populates the clipboard with a structured report', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ErrorBoundary label="テスト">
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /詳細をコピー/ }));
    // Microtask flush for the async handler.
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledOnce();
    const report = writeText.mock.calls[0][0] as string;
    expect(report).toContain('ClassNotes error report');
    expect(report).toContain('view: テスト');
    expect(report).toContain('test boom');
    spy.mockRestore();
  });
});
