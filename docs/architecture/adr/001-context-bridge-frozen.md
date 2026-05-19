# ADR 001 — `contextBridge` exposed objects are frozen

**Status**: Accepted — discovered during Wave 1 DocAI E2E development.

## Context

We attempted to write Playwright E2E tests for the DocAI panel by stubbing
`window.api.docai` at runtime inside the renderer:

```ts
await window.evaluate(() => {
  window.api.docai = {
    summarize: async () => ({ ok: true, result: { ... } }),
    // ...
  };
});
```

The stub was silently ignored — the real IPC handler ran, returning the
default "AI 機能が無効です" error because the test fixture sets
`aiProvider: 'none'`.

## Decision

`contextBridge.exposeInMainWorld('api', api)` creates a **frozen** proxy
object in the renderer. This is by design (security): the renderer cannot
override the bridge functions, ensuring main-process logic always runs as
intended.

**Implication for tests**:
- Unit tests (vitest/jsdom) → directly assign `window.api = { ... }` because
  there's no contextBridge — `tests/setup.ts` already does this via Proxy.
- E2E tests (Playwright + real Electron) → **cannot** override `window.api`.
  Must either:
  1. Configure the main process to behave as desired (test settings.json),
  2. Intercept at the network layer (`page.route`),
  3. Or test the UI's response to whatever the real backend returns.

For DocAI specifically (`e2e/tests/docai.spec.ts`), we chose option 3:
verify that quick-action clicks fire the IPC and produce *some* visible
response (either SummaryCard with a real result OR the "AI 機能が無効です"
error alert). Both prove the UI wiring works.

## Consequences

- Future E2E specs for AI features must follow the same pattern.
- New IPC channels should be designed with a "deterministic failure mode"
  that's testable (e.g. always returns a specific error string when
  preconditions fail).
- Documented in `e2e/tests/docai.spec.ts` header comment for discoverability.
