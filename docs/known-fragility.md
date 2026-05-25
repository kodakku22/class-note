# Known Fragility — dependency strategy decisions

This document records intentional deviations from "always-latest"
dependency hygiene, with the reason for each decision. New maintainers
should read this before bumping anything listed below.

## TS5 / React 18 / Electron 38 LTS rollback (2026-05-25)

Reverted from the bleeding-edge stack we were on for ~10 days:

| Package | Was | Is now | Why |
|---|---|---|---|
| `typescript` | 6.0.3 | 5.9.3 (LTS) | TS 6 was 3 weeks old when we adopted it. Already hit one breaking change (`moduleResolution=node10` deprecation needed `ignoreDeprecations: "6.0"`). The ecosystem hasn't caught up — narrowing & inference subtleties were tripping ESLint and the React types. |
| `react` / `react-dom` | 19.2.6 | 18.3.x (LTS) | React 19 is recent and rapidly evolving. The `react-dom` peer mismatch (Dependabot only bumped `react`) showed how easily the ecosystem desyncs. We do not use any React 19-only API (audited: no `use()`, `useFormStatus`, `useFormState`, `useOptimistic`, `useActionState`, `ref` as prop) so the downgrade is functionally a no-op. |
| `@types/react` / `@types/react-dom` | 19.x | 18.3.x | Mirrors the runtime downgrade. |
| `electron` | 42.0.1 | 38.x (LTS) | Electron 42 is the current dev line; 38 is the supported LTS branch. The `signtoolOptions` schema change between 26.x and 26.8.x already burned us once (commit e608863). |

Tiptap stays at 3.22.5 (the `3.23.x` line splits the bundled extensions
into a new `@tiptap/extensions` peer that is not yet wired up in our
deps, and breaks `ChainedCommands` for `toggleHeading` / `setParagraph`
/ etc. — see commit b91b3ee for the rollback rationale).

### Known security trade-off

`npm audit` after the rollback flags **1 high-severity vulnerability**
chain in Electron 38.x:

- GHSA-532v-xpq5-8h95 — UAF in offscreen child-window paint callback
- GHSA-8x5q-pvf5-64mp — UAF in offscreen shared texture `release()` callback
- GHSA-f37v-82c4-4x64 — Crash in `clipboard.readImage()` on malformed data
- GHSA-f3pv-wv63-48x8 — Named `window.open` targets not scoped to opener

ClassNotes does **not** use offscreen rendering, does **not** call
`clipboard.readImage()`, and the renderer's CSP forbids `window.open`
on external origins. The practical exposure is low. Re-evaluate when
Electron 38.x publishes a patch release that covers these CVEs, or
when the LTS line moves to a newer branch.

### Verification after the rollback

- `npm run lint` — clean.
- `npm run build` — clean (TS5 + React 18 + Electron 38 + Vite 8.0.14 +
  Vitest 4.1.x).
- `npx vitest run` — 2,339 / 2,339 tests passing on first attempt.

### When to revisit

- TypeScript 5 LTS reaches EOL.
- React 19 ecosystem (Testing Library, etc.) stabilises and most plugins
  declare `react@^19` as primary.
- Electron 38 reaches EOL (~12 months from each major's release).
- A specific bleeding-edge feature is a hard requirement (e.g. React 19
  Form Actions for a server-component flow we choose to adopt).

Until then: stay on LTS. The cost of a rollback later is much higher
than the cost of a delayed upgrade now.
