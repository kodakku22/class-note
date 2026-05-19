# Contributing to ClassNotes

Thank you for helping ClassNotes become a useful local-first research tool.

## Setup

Requirements:

- Node.js 20
- npm 10
- Git
- Windows 11 for the supported packaging path

```bash
git clone https://github.com/kodakku22/class-note.git
cd class-note
npm ci
npm run dev
```

## Verification

Run these before opening a pull request:

```bash
npm run lint
npm test -- --run
npm run test:coverage
npm run build
npm run license:check
npm run security:evidence
npm audit
npm audit --omit=dev
```

For release or packaging changes, also run:

```bash
npm run dist
npm run test:release-smoke
npm run hash:release
npm run test:release-artifacts
npm run measure:bundle
```

## Architecture Rules

- All filesystem IPC must validate paths with `validateVaultPath`.
- External file imports must use a purpose-specific `FileAccessGrant` token.
- Writes to Vault files should use `atomicWrite`.
- AI calls must go through `electron/ai/provider.ts` and `runPrompt`.
- Renderer code must not receive decrypted API keys.
- Generated AI content should remain Markdown or Vault-local files.
- Keep Obsidian compatibility: frontmatter, wikilinks, attachments, and plain files matter.
- Logs and diagnostics must pass through redaction before they can leave the process boundary.
- Security evidence should be regenerated when IPC or dependencies change.

Read [docs/architecture.md](docs/architecture.md) and
[docs/threat-model.md](docs/threat-model.md) before touching IPC, plugins,
diagnostics, telemetry, updater, or AI provider code.

## Pull Requests

Please include:

- What changed and why.
- Screenshots or short clips for UI changes.
- Tests for new behavior or bug fixes.
- Any packaging or bundle-size impact.
- Any AI/network/privacy impact.

PR checklist:

- [ ] Lint passes.
- [ ] Tests pass.
- [ ] Build passes.
- [ ] Coverage gate passes.
- [ ] Full and production audits pass.
- [ ] License check passes.
- [ ] Security evidence generation passes when dependencies or IPC change.
- [ ] User-facing docs are updated when behavior changes.

## Issue Labels

Useful labels for early contributors:

- `good first issue`
- `help wanted`
- `research-workflow`
- `ai-agent`
- `packaging`
- `security`
- `docs`

## Security

Please do not report security issues in public issues. See [SECURITY.md](SECURITY.md).
