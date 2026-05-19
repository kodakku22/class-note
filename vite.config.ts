import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const manualChunkGroups: Record<string, string[]> = {
  'editor-tiptap': [
    '@tiptap/react',
    '@tiptap/starter-kit',
    '@tiptap/extension-placeholder',
    '@tiptap/extension-task-item',
    '@tiptap/extension-task-list',
    'tiptap-markdown',
  ],
  markdown: [
    'react-markdown',
    'remark-gfm',
    'remark-math',
    'rehype-katex',
    'rehype-highlight',
    'highlight.js',
    'katex',
  ],
  pdf: ['pdfjs-dist', 'react-pdf'],
  flow: ['@xyflow/react', 'd3-force'],
};

function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');
  for (const [chunk, packages] of Object.entries(manualChunkGroups)) {
    if (packages.some((pkg) => normalized.includes(`/node_modules/${pkg}/`))) {
      return chunk;
    }
  }
  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // `@sentry/electron` is loaded via dynamic import only when a DSN is
              // configured. We mark it external so the build doesn't fail when the
              // package isn't installed (it's optional in this skeleton).
              external: [
                'electron',
                'electron-log',
                'electron-log/main',
                'electron-updater',
                'chokidar',
                'fs',
                'fs/promises',
                'path',
                'os',
                'url',
                'crypto',
                'child_process',
                'jsdom',
                'defuddle',
                '@sentry/electron',
                '@sentry/electron/main',
              ],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy third-party deps into their own chunks so the initial
        // bundle stays small. React/ReactDOM stay in the main chunk because
        // every view needs them; everything else gets its own file that the
        // browser fetches lazily once the user enters a feature that uses it.
        manualChunks,
      },
    },
  },
});
