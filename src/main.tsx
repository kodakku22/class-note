import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/reset.css';
import './styles.css';
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
