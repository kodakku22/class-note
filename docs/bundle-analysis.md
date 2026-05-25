# Bundle Composition & Lazy-Load Strategy

Recorded 2026-05-25 after Phase C of the senior-programmer critique
remediation. Numbers are from `npm run measure:bundle` on the
production build (`vite build` → `dist/assets/`).

## Top-10 chunks

| Chunk | Size | Source | Loads when |
|---|---|---|---|
| `pdf.worker.min` | 1.18 MB | `pdfjs-dist`'s WebWorker | Only when a PDF file is viewed (`PDFViewer.tsx`, lazy under `Viewer.tsx`) |
| `chunk-NNHCCRGN` | 0.57 MB | **Mermaid core** + transitive YAML parser (the `vscode-jsonrpc` / `vscode-languageserver-*` strings in the bundle are mermaid's diagram-spec parser code paths). Companion to `architectureDiagram-*` / `sequenceDiagram-*` / `cytoscape.esm-*`. | Dynamic-imported inside `MarkdownRenderer.tsx` only when a `mermaid` code fence is rendered. |
| `markdown` | 0.56 MB | `react-markdown` + `remark-gfm` / `remark-math` / `rehype-katex` / `rehype-highlight` / `highlight.js` / `katex` | Loaded when the user opens any view that renders Markdown — note preview, wiki, Q&A. |
| `editor-tiptap` | 0.48 MB | `@tiptap/react` + `@tiptap/starter-kit` + extensions + `tiptap-markdown` | Phase C: now `React.lazy()` in `NoteViewer.tsx` and `ExperimentEditor.tsx` — only fetched when the user clicks "Edit" or opens an experiment. |
| `cytoscape.esm` | 0.41 MB | Mermaid transitive (graph diagrams) | Same dynamic-import path as the mermaid core chunk. |
| `pdf` | 0.40 MB | `pdfjs-dist` + `react-pdf` (no worker) | Lazy via `PDFViewer.tsx`. |
| `index-xvnrFN2c` | 0.33 MB | Main React bundle (App + Sidebar + WorkspaceRouter scaffolding) | Initial load. Most views inside it are themselves `React.lazy()`. |
| `chunk-CSCIHK7Q` | 0.21 MB | Mermaid common helpers | Dynamic via mermaid. |
| `flow` | 0.18 MB | `@xyflow/react` + `d3-force` | Lazy via `GraphView.tsx` / `CanvasView.tsx`. |
| `architectureDiagram` | 0.14 MB | Mermaid sub-chunk | Dynamic only when an architecture diagram is rendered. |

## Phase C wins

Before Phase C, `NoteViewer.tsx` and `ExperimentEditor.tsx` imported
`BlockEditor` at module scope — meaning every note open pulled the
0.48 MB editor-tiptap chunk eagerly, even when the user stayed in
preview mode (the common case).

After Phase C the import is `React.lazy()` wrapped in a `Suspense`
boundary with a placeholder ("エディタを読み込み中…"). Cold open
of a note in preview mode now never touches the editor-tiptap chunk.

`MarkdownRenderer` is deliberately *not* lazy-loaded inside
`NoteViewer` because preview mode renders it on every open — the
Suspense flash would add latency to the dominant code path.

## What was NOT a real problem

- **`cytoscape.esm-*` (0.41 MB)** — flagged in the Explore audit as an
  orphan because `src/` has no direct import. In fact it's a transitive
  of mermaid for graph-diagram support, only loaded after the user
  renders a relevant mermaid code fence. Removing it would require
  removing or forking mermaid; left in place.
- **`chunk-NNHCCRGN` (0.57 MB)** — also flagged as unidentified. It's
  the mermaid core/parser chunk, paired with the diagram sub-chunks.
  Same lazy path as cytoscape; no action needed.

## Future opportunities (out of current scope)

- `MarkdownRenderer` is loaded the moment any markdown-rendering view
  mounts. A more aggressive deferral (per-feature dynamic import
  inside `MarkdownRenderer` itself) could split `katex` and
  `highlight.js` off — both are only needed when content contains
  the corresponding syntax. Estimated win: ~150 KB at startup.
- The 0.33 MB `index-xvnrFN2c` main chunk is roughly at the floor of
  what React + the lazy router scaffold needs. Below that requires
  switching to Preact or a custom router.
