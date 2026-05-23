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

const STORAGE_KEY = 'classnotes_theme';

export function applyTheme(theme: Theme): void {
  // <html data-theme="...">
  document.documentElement.setAttribute('data-theme', theme);
  // <body class="dark"> / <body class="light"> compat
  document.body.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable in jsdom / restricted contexts; ignore.
  }
}

export function readCachedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}
