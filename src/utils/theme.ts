// Theme application helpers.
//
// Canonical mechanism (per design_handoff_classnotes/HANDOFF.md):
//   <html data-theme="light">   → light theme tokens
//   <html data-theme="dark">    → dark theme tokens (explicit)
//   no attribute                → :root in tokens.css resolves to dark
//
// Legacy mechanism still supported for backward compatibility with
// `body.dark .X` selectors that exist in src/styles.css:
//   <body class="dark"> / <body class="light">
//
// `applyTheme(theme)` keeps both in sync, and `readCachedTheme()` is meant
// for synchronous use in main.tsx before the React tree mounts so the
// first paint matches the user's saved preference (no flash of the
// default dark theme).

export type Theme = 'light' | 'dark';

// Project convention uses colon-separated namespaces for localStorage keys
// (classnotes:subjectView, classnotes:recents, classnotes:subjectPanelWidth).
// LEGACY_STORAGE_KEY is the snake_case key shipped briefly in 9f8089e;
// readCachedTheme() reads it as a fallback so users who already booted
// once on that build don't see a flash of the default dark theme.
const STORAGE_KEY = 'classnotes:theme';
const LEGACY_STORAGE_KEY = 'classnotes_theme';

export function applyTheme(theme: Theme): void {
  // <html data-theme="...">
  document.documentElement.setAttribute('data-theme', theme);
  // <body class="dark"> / <body class="light"> compat
  document.body.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    // Clean up the legacy key once we've written the canonical one.
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable in jsdom / restricted contexts; ignore.
  }
}

export function readCachedTheme(): Theme | null {
  try {
    const v =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}
