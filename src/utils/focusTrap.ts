// Minimal keyboard focus trap for modal dialogs.
//
// React hook that wires up:
//   - Tab cycling inside `containerRef.current` only
//   - Escape calls `onClose`
//   - Initial focus on the first focusable element (or the container itself)
//
// Avoids the focus-trap-react dependency (~10KB) — this is ~40 lines and
// handles the standard cases (MultiDocPicker, ContentGenerator, FAQPanel).
import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: { onEscape?: () => void; active?: boolean } = {}
): void {
  const { onEscape, active = true } = options;

  useEffect(() => {
    if (!active) return;
    const node = containerRef.current;
    if (!node) return;

    // Move focus to the first focusable element on mount.
    const initial = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (initial.length > 0) initial[0].focus();
    else node.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onEscape) {
          e.preventDefault();
          onEscape();
        }
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [containerRef, onEscape, active]);
}
