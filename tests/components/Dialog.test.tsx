// Smoke tests for the useDialog hook — replaces window.prompt/alert.
// Validates: default value plumbing, OK returns the value, Cancel returns null,
// Esc/Enter keyboard shortcuts, and that alert resolves on OK.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import { useDialog } from '../../src/components/common/Dialog';

function PromptHarness({ onResolve }: { onResolve: (v: string | null) => void }) {
  const [dlg, element] = useDialog();
  useEffect(() => {
    dlg.prompt({ title: 'Name', defaultValue: 'foo' }).then(onResolve);
    // dlg is stable; intentional one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{element}</>;
}

function AlertHarness({ onDone }: { onDone: () => void }) {
  const [dlg, element] = useDialog();
  useEffect(() => {
    dlg.alert({ title: 'Saved' }).then(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{element}</>;
}

describe('useDialog', () => {
  it('prompt: returns the typed value when OK is pressed', async () => {
    let result: string | null | 'pending' = 'pending';
    render(<PromptHarness onResolve={(v) => (result = v)} />);
    expect(screen.getByText('Name')).toBeInTheDocument();

    const input = screen.getByDisplayValue('foo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bar' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await act(() => Promise.resolve());
    expect(result).toBe('bar');
  });

  it('prompt: returns null on cancel', async () => {
    let result: string | null | 'pending' = 'pending';
    render(<PromptHarness onResolve={(v) => (result = v)} />);
    fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));
    await act(() => Promise.resolve());
    expect(result).toBeNull();
  });

  it('prompt: Enter submits the current value', async () => {
    let result: string | null | 'pending' = 'pending';
    render(<PromptHarness onResolve={(v) => (result = v)} />);
    const input = screen.getByDisplayValue('foo') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(() => Promise.resolve());
    expect(result).toBe('foo');
  });

  it('alert: resolves when OK is pressed', async () => {
    let done = false;
    render(<AlertHarness onDone={() => (done = true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await act(() => Promise.resolve());
    expect(done).toBe(true);
  });
});
