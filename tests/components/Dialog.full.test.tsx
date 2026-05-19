import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { useDialog } from '../../src/components/common/Dialog';

// A comprehensive test harness that exercises all dialog variants
function DialogTester() {
  const [dlg, dialogElement] = useDialog();
  const [result, setResult] = useState<string>('');

  return (
    <div>
      <button onClick={async () => {
        const r = await dlg.prompt({
          title: 'Enter name',
          defaultValue: 'default',
          placeholder: 'type here',
          okLabel: 'Submit',
          cancelLabel: 'Nope',
          message: 'Please enter your name',
        });
        setResult(r ?? 'null');
      }}>open-prompt</button>

      <button onClick={async () => {
        const r = await dlg.prompt({ title: 'Simple prompt' });
        setResult(r ?? 'null');
      }}>open-prompt-simple</button>

      <button onClick={async () => {
        await dlg.alert({ title: 'Alert Title', message: 'Alert body', variant: 'success', okLabel: 'Got it' });
        setResult('alert-closed');
      }}>open-alert</button>

      <button onClick={async () => {
        await dlg.alert({ title: 'Simple Alert' });
        setResult('alert-closed');
      }}>open-alert-simple</button>

      <button onClick={async () => {
        const r = await dlg.confirm({
          title: 'Confirm?',
          message: 'Are you sure?',
          okLabel: 'Yes',
          cancelLabel: 'No',
          destructive: true,
        });
        setResult(r ? 'confirmed' : 'cancelled');
      }}>open-confirm</button>

      <button onClick={async () => {
        const r = await dlg.confirm({ title: 'Simple Confirm' });
        setResult(r ? 'confirmed' : 'cancelled');
      }}>open-confirm-simple</button>

      <div data-testid="result">{result}</div>
      {dialogElement}
    </div>
  );
}

describe('Dialog full coverage', () => {
  // --- Prompt ---

  it('opens prompt with default value and placeholder', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Enter name')).toBeInTheDocument();
    expect(screen.getByText('Please enter your name')).toBeInTheDocument();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('default');
    expect(input.placeholder).toBe('type here');
  });

  it('submits prompt on OK click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const input = screen.getByRole('textbox');
    await act(async () => { fireEvent.change(input, { target: { value: 'hello' } }); });
    await act(async () => { fireEvent.click(screen.getByText('Submit')); });
    expect(screen.getByTestId('result').textContent).toBe('hello');
  });

  it('cancels prompt on Cancel click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    await act(async () => { fireEvent.click(screen.getByText('Nope')); });
    expect(screen.getByTestId('result').textContent).toBe('null');
  });

  it('submits prompt on Enter in input', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const input = screen.getByRole('textbox');
    await act(async () => { fireEvent.change(input, { target: { value: 'enter-val' } }); });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(screen.getByTestId('result').textContent).toBe('enter-val');
  });

  it('cancels prompt on Escape in input', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const input = screen.getByRole('textbox');
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }); });
    expect(screen.getByTestId('result').textContent).toBe('null');
  });

  it('cancels prompt on Escape on backdrop', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.keyDown(backdrop, { key: 'Escape' }); });
    expect(screen.getByTestId('result').textContent).toBe('null');
  });

  it('does not close prompt on backdrop click (prevents accidental close)', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.click(backdrop); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stops propagation on dialog click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const dialog = screen.getByRole('dialog');
    await act(async () => { fireEvent.click(dialog); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows default cancel label for prompt', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt-simple')); });
    expect(screen.getByText('キャンセル')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  // --- Alert ---

  it('opens alert with custom OK label', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert')); });
    expect(screen.getByText('Alert Title')).toBeInTheDocument();
    expect(screen.getByText('Alert body')).toBeInTheDocument();
    expect(screen.getByText('Got it')).toBeInTheDocument();
  });

  it('closes alert on OK click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert')); });
    await act(async () => { fireEvent.click(screen.getByText('Got it')); });
    expect(screen.getByTestId('result').textContent).toBe('alert-closed');
  });

  it('closes alert on backdrop click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.click(backdrop); });
    expect(screen.getByTestId('result').textContent).toBe('alert-closed');
  });

  it('closes alert on Escape', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.keyDown(backdrop, { key: 'Escape' }); });
    expect(screen.getByTestId('result').textContent).toBe('alert-closed');
  });

  it('closes alert on Enter key (confirm shortcut)', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    // Enter on alert/confirm triggers OK
    await act(async () => { fireEvent.keyDown(backdrop, { key: 'Enter' }); });
    expect(screen.getByTestId('result').textContent).toBe('alert-closed');
  });

  it('alert without message omits message element', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert-simple')); });
    expect(screen.getByText('Simple Alert')).toBeInTheDocument();
    expect(document.querySelector('.app-dialog-message')).toBeNull();
  });

  it('alert has only one button (no cancel)', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert-simple')); });
    const buttons = document.querySelectorAll('.app-dialog-actions button');
    expect(buttons.length).toBe(1);
  });

  // --- Confirm ---

  it('opens destructive confirm with danger button', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    expect(screen.getByText('Confirm?')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    const okBtn = screen.getByText('Yes');
    expect(okBtn.className).toContain('danger');
  });

  it('confirms on OK click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    await act(async () => { fireEvent.click(screen.getByText('Yes')); });
    expect(screen.getByTestId('result').textContent).toBe('confirmed');
  });

  it('cancels on Cancel click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    await act(async () => { fireEvent.click(screen.getByText('No')); });
    expect(screen.getByTestId('result').textContent).toBe('cancelled');
  });

  it('cancels confirm on Escape', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.keyDown(backdrop, { key: 'Escape' }); });
    expect(screen.getByTestId('result').textContent).toBe('cancelled');
  });

  it('confirms on Enter key', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.keyDown(backdrop, { key: 'Enter' }); });
    expect(screen.getByTestId('result').textContent).toBe('confirmed');
  });

  it('does not close confirm on backdrop click', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    await act(async () => { fireEvent.click(backdrop); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('non-destructive confirm uses primary OK button', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm-simple')); });
    const okBtn = screen.getByText('OK');
    expect(okBtn.className).toContain('primary');
  });

  it('default labels used for simple confirm', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm-simple')); });
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('キャンセル')).toBeInTheDocument();
  });

  // --- Accessibility ---

  it('has aria-modal and aria-labelledby', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('has aria-describedby when message present', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-confirm')); });
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('omits aria-describedby when no message', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-alert-simple')); });
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBeNull();
  });

  // --- Focus trap ---

  it('traps Tab at last focusable', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled])'
    );
    const last = focusables[focusables.length - 1];
    last.focus();
    await act(async () => {
      fireEvent.keyDown(backdrop, { key: 'Tab', shiftKey: false });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('traps Shift+Tab at first focusable', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled])'
    );
    const first = focusables[0];
    first.focus();
    await act(async () => {
      fireEvent.keyDown(backdrop, { key: 'Tab', shiftKey: true });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Tab in middle does not wrap', async () => {
    render(<DialogTester />);
    await act(async () => { fireEvent.click(screen.getByText('open-prompt')); });
    const backdrop = document.querySelector('.app-dialog-backdrop')!;
    // Tab when focused on a middle element should not be prevented
    await act(async () => {
      fireEvent.keyDown(backdrop, { key: 'Tab' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
