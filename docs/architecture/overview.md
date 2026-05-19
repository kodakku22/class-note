# ClassNotes Architecture Overview

## Process model

```mermaid
graph LR
  subgraph "Renderer (Chromium / React 18)"
    UI[App.tsx + WorkspaceRouter]
    Hooks[hooks/<br/>useFileNavigation, useCommandPalette,<br/>useWorkspaceLoader, useDocAIStream, ...]
    Comp[components/<br/>Viewer, NoteViewer, PDFViewer,<br/>DocAIPanel, FAQPanel, CommandPalette]
    UI --> Hooks
    UI --> Comp
    Comp --> Hooks
  end

  subgraph "Main (Node.js)"
    IPC[ipc/<br/>vault, papers, wiki, qa, docai, ...]
    AI[ai/<br/>provider.ts → OpenAI/Gemini/Claude<br/>agents.ts, docai.ts,<br/>chunker.ts, context-retriever.ts]
    Index[vault-index.ts<br/>(searchText, mtime, tags)]
    Watcher[watcher.ts<br/>(chokidar)]
    Telem[telemetry.ts<br/>(opt-in, batched)]
  end

  UI -.contextBridge.-> IPC
  IPC --> AI
  IPC --> Index
  IPC --> Watcher
  IPC --> Telem
  AI -.HTTPS.-> ExtAPI[OpenAI / Gemini / Anthropic API]
  AI -.subprocess.-> CLI[codex / claude / gemini / gcloud CLI]
```

## Layers

1. **Renderer** – React 18 + Vite. Talks ONLY through `window.api.*` (contextBridge).
   No direct access to filesystem, network, or process APIs.

2. **Preload** – `electron/preload.ts` declares the entire IPC surface. Single
   file, all channels enumerated. Tested independently in `tests/electron/preload.test.ts`.

3. **Main / IPC** – `electron/ipc/*.ts`. One file per logical domain (vault,
   papers, qa, docai, wiki, ...). Each file exports `register<Name>Handlers()`
   that wires `ipcMain.handle('domain:action', ...)` and is invoked once from
   `electron/main.ts`. Phase 2-D added a table-of-contents header to large
   files (papers.ts 996 lines, vault.ts 704 lines, wiki.ts 616 lines) for
   reviewability — physical split deferred (see Phase 2 plan rationale).

4. **AI** – `electron/ai/*.ts`. `provider.ts` is the single entry to LLM calls
   (`runPrompt(provider, opts)`). Each agent (summarize, autoTag, documentQA,
   smartSummary, etc.) returns a typed `{ ok: true, result }` envelope.
   Pluggable provider strategy: API key (OpenAI/Gemini/Anthropic) or CLI
   subprocess (codex / claude / gemini / gcloud).

5. **DocAI** – `electron/ai/{chunker,context-retriever,docai}.ts`. Phase 1+2 of
   the Acrobat AI Assistant suite (Wave 1 = features 1-3, Wave 2 = features 4-5).

## State management (renderer)

Renderer-side state is intentionally distributed (no global store):

- **Navigation** – `useAppNav()` (state reducer) with canonical view transitions
- **Vault loading** – `useWorkspaceLoader({ vaultPath, activeSubject, ... })`
- **File navigation** – `useFileNavigation({ vaultPath, linkTargetsRef, ... })`
- **Rail config** – `useRailConfig({ viewMode, setViewMode })`
- **Command palette** – `useCommandPalette({ ... })` (Phase 2-A)
- **Keyboard** – `useKeyboardShortcuts({ vaultPath, ... })`
- **DocAI** – `useDocAIStream` + `useDocAISummary` + `useDocAIMultiAnalyze` (Phase 2-B)

App.tsx (~534 lines after Phase 2-A) is now a composition root.

## Security boundaries

| Boundary | Mechanism |
|---|---|
| Renderer → Filesystem | Forbidden (no `fs` import, no `nodeIntegration`) |
| Renderer → Network | Forbidden (no `fetch` to LLM APIs from renderer) |
| Renderer → Main | `contextBridge.exposeInMainWorld('api', ...)` only |
| API key storage | `safeStorage` (Win DPAPI / macOS Keychain / Linux libsecret) |
| User-supplied paths | `validateVaultPath(filePath, vaultRoot)` rejects `..` escapes |
| Symlink escape | `validateVaultPath` calls `fs.realpathSync.native` |
| Prompt injection | `sanitizeForPrompt(text, maxLen)` strips fence breakouts |
| File size DoS | `docaiMaxFileSizeMB` (default 50MB) checked in `readChunkableDocument` |

## Related docs

- `docs/architecture/ipc-channels.md` — full IPC channel inventory
- `docs/architecture/adr/` — Architecture Decision Records
- `docs/PERF.md` — performance log per release
- `docs/FAQ.md` — user-facing troubleshooting
- `docs/getting-started.md` — vault setup walkthrough
