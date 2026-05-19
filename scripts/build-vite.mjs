import { build, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

const electronExternal = [
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
];

const manualChunkGroups = {
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

function manualChunks(id) {
  const normalized = id.replace(/\\/g, '/');
  for (const [chunk, packages] of Object.entries(manualChunkGroups)) {
    if (packages.some((pkg) => normalized.includes(`/node_modules/${pkg}/`))) {
      return chunk;
    }
  }
  return undefined;
}

await build(
  defineConfig({
    root: process.cwd(),
    configFile: false,
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: electronExternal,
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
          manualChunks,
        },
      },
    },
  })
);
