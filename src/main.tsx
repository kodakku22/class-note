import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/reset.css';
import './styles.css';
// Per-view stylesheets extracted from the styles.css monolith
// (commit 01d1d2c…). Each owns the CSS for one main view + its
// view-specific helpers. Order between them doesn't matter; they
// don't override each other.
import './styles/books.css';
import './styles/papers.css';
import './styles/progress.css';
import './types';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { applyTheme, readCachedTheme } from './utils/theme';

// Apply the cached theme before React mounts so the first paint matches
// the user's saved preference. Without this, light-theme users would see
// a brief flash of the default dark tokens while the IPC settings call
// resolves inside App.tsx.
const cachedTheme = readCachedTheme();
if (cachedTheme) {
  applyTheme(cachedTheme);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
