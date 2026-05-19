import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to jsdom — component tests need a DOM. Pure-logic tests can opt
    // back into Node via a `// @vitest-environment node` file-level pragma.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.ts', 'src/**/*.{ts,tsx}'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
        'electron/ipc/file-access.ts': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'electron/vault-index.ts': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'electron/diagnostics-report.ts': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'electron/redaction.ts': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'src/components/ai/AiSettingsPanel.tsx': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'src/components/BacklinksPanel.tsx': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'src/components/SearchBar.tsx': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'src/components/VaultPicker.tsx': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'src/components/Viewer.tsx': {
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        },
        'src/hooks/useUndoRedo.ts': {
          statements: 80,
          branches: 60,
          functions: 80,
          lines: 80,
        },
        'src/state/appReducer.ts': {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80,
        },
        'src/state/useAppNav.ts': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
