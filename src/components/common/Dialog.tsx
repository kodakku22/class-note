// Lightweight in-app dialog primitives that replace `window.prompt` / `window.alert`.
//
// WCAG 2.1 AA compliance:
//  - role="dialog" + aria-modal="true"
//  - aria-labelledby points at the title element
//  - Focus trap: Tab cycles within the dialog only
//  - Esc cancels (or no-ops for alert), Enter confirms (when not in textarea)
//  - Focus is restored to the previously focused element on close
//  - Background-click closes only for `alert`; `prompt`/`confirm` ignore it
//    so the user doesn't lose typed input by accident.
import { useCallback, useEffect, useId, useRef, useState } from 'react';

type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
};

type AlertOptions = {
  title: string;
  message?: string;
  okLabel?: string;
  variant?: 'info' | 'success' | 'error';
};

type ConfirmOptions = {
  title: string;
  message?: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type DialogState =
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void }
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | null;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialog(): [
  {
    prompt: (o: PromptOptions) => Promise<string | null>;
    alert: (o: AlertOptions) => Promise<void>;
    confirm: (o: ConfirmOptions) => Promise<boolean>;
  },
  React.ReactElement | null,
] {
  const [state, setState] = useState<DialogState>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  const dlg = {
    prompt: useCallback(
      (opts: PromptOptions) =>
        new Promise<string | null>((resolve) => {
          setValue(opts.defaultValue ?? '');
          previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
          setState({ kind: 'prompt', opts, resolve });
        }),
      []
    ),
    alert: useCallback(
      (opts: AlertOptions) =>
        new Promise<void>((resolve) => {
          previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
          setState({ kind: 'alert', opts, resolve });
        }),
      []
    ),
    confirm: useCallback(
      (opts: ConfirmOptions) =>
        new Promise<boolean>((resolve) => {
          previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
          setState({ kind: 'confirm', opts, resolve });
        }),
      []
    ),
  };

  // Focus the input (prompt) or the OK button (alert/confirm) on open.
  useEffect(() => {
    if (!state) return;
    if (state.kind === 'prompt') {
      requestAnimationFrame(() => inputRef.current?.select());
    } else {
      requestAnimationFrame(() => {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        focusables?.[focusables.length - 1]?.focus(); // focus OK button by default
      });
    }
  }, [state]);

  const close = useCallback(
    (result: { ok: boolean; value?: string }) => {
      if (!state) return;
      if (state.kind === 'prompt') state.resolve(result.ok ? result.value ?? '' : null);
      else if (state.kind === 'alert') state.resolve();
      else if (state.kind === 'confirm') state.resolve(result.ok);
      setState(null);
      // Restore focus to whatever was focused before the dialog opened.
      requestAnimationFrame(() => previouslyFocused.current?.focus?.());
    },
    [state]
  );

  // Focus trap: keep Tab cycling within the dialog.
  const handleKey = (e: React.KeyboardEvent) => {
    if (!state) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // For alert, Esc closes; for prompt/confirm, Esc cancels.
      close({ ok: false });
      return;
    }
    if (e.key === 'Enter' && state.kind !== 'prompt') {
      // Enter triggers OK (in prompt the input has its own handler).
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        close({ ok: true });
      }
      return;
    }
    if (e.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  let element: React.ReactElement | null = null;

  if (state) {
    const onBackdrop = () => {
      // alert: clicking the backdrop is equivalent to dismissing — fine.
      // prompt/confirm: ignore so users don't lose typed text or skip a
      // confirmation by misclick. They must use the explicit Cancel button.
      if (state.kind === 'alert') close({ ok: true });
    };
    element = (
      <div
        className="app-dialog-backdrop"
        onClick={onBackdrop}
        onKeyDown={handleKey}
      >
        <div
          className="app-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={state.opts.message ? messageId : undefined}
          ref={dialogRef}
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          <div className="app-dialog-title" id={titleId}>
            {state.opts.title}
          </div>
          {state.opts.message && (
            <div className="app-dialog-message" id={messageId}>
              {state.opts.message}
            </div>
          )}

          {state.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="app-dialog-input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={state.opts.placeholder}
              aria-label={state.opts.title}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  close({ ok: true, value });
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  close({ ok: false });
                }
              }}
              autoFocus
            />
          )}

          <div className="app-dialog-actions">
            {state.kind !== 'alert' && (
              <button onClick={() => close({ ok: false })}>
                {('cancelLabel' in state.opts && state.opts.cancelLabel) || 'キャンセル'}
              </button>
            )}
            <button
              className={
                state.kind === 'confirm' && state.opts.destructive ? 'danger' : 'primary'
              }
              onClick={() => close({ ok: true, value })}
            >
              {('okLabel' in state.opts && state.opts.okLabel) || 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return [dlg, element];
}
