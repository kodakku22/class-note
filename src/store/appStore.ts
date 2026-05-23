// Lightweight global store for cross-cutting state. We deliberately keep
// this small — most state still lives in App.tsx as `useState`. Use the
// store for things that genuinely need to be shared across distant
// components (theme, sidebar collapse, currently-open file path).
import { create } from 'zustand';
import { applyTheme, type Theme } from '../utils/theme';

interface AppState {
  theme: Theme;
  sidebarOpen: boolean;
  currentFilePath: string | null;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setCurrentFilePath: (p: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Dark is the canonical default per the design system handoff. Users
  // who prefer light flip it in Settings; the choice is persisted via
  // applyTheme() to both Electron settings (App.tsx) and localStorage.
  theme: 'dark',
  sidebarOpen: true,
  currentFilePath: null,
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCurrentFilePath: (p) => set({ currentFilePath: p }),
}));
