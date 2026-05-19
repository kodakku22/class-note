// Global registry for the currently focused text editor's "insert at caret"
// callback. The Phase 2 CitationPicker wrote `[@bibkey]` to the clipboard
// because we had no other plumbing; now any editor (TipTap BlockEditor,
// QAChat textarea, etc.) can register a callback when it gains focus and
// unregister on blur/unmount.
//
// This is intentionally a tiny module — not a Zustand store, not Context —
// because the editor focus is inherently a singleton and we want the
// callback to fire even when the picker is rendered far up the React tree.
//
// Contract:
//   - At most one callback active at a time. Newer registrations replace
//     older ones (the most recently focused editor wins).
//   - Callback receives a string and is responsible for inserting it at
//     the caret. Returns true if it handled the insertion, false to fall
//     back to the clipboard.

type Inserter = (text: string) => boolean;

let active: Inserter | null = null;

export function registerActiveInserter(fn: Inserter): () => void {
  active = fn;
  return () => {
    if (active === fn) active = null;
  };
}

/**
 * Insert at the active editor's caret if one is registered. Returns true on
 * success. Callers can fall back to navigator.clipboard.writeText on false.
 */
export function insertAtActiveCaret(text: string): boolean {
  if (!active) return false;
  try {
    return active(text);
  } catch {
    return false;
  }
}
