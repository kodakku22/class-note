// Lightweight global store for cross-cutting state. We deliberately keep
// this small — most state still lives in App.tsx as `useState`. Use the
// store for things that genuinely need to be shared across distant
// components (theme, sidebar collapse, currently-open file path).
import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface AppState {
  theme: Theme;
  sidebarOpen: boolean;
  currentFilePath: string | null;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setCurrentFilePath: (p: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'light',
  sidebarOpen: true,
  currentFilePath: null,
  setTheme: (t) => {
    document.body.classList.toggle('dark', t === 'dark');
    set({ theme: t });
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCurrentFilePath: (p) => set({ currentFilePath: p }),
}));
