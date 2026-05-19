# Governance

ClassNotes is an early OSS project. Governance is lightweight, but explicit,
because the app handles local research data, optional AI prompts, local files,
and release artifacts.

## Roles

### Maintainers

Maintainers can merge pull requests, cut releases, triage security reports, and
make final product decisions. Maintainers are responsible for keeping the
project local-first, supportable, and secure.

### Reviewers

Reviewers can approve changes in areas they know well. A reviewer approval is
not enough for merge if the change touches security-sensitive boundaries.

Security-sensitive boundaries include:

- IPC handlers and preload API shape.
- Vault path validation.
- External file import.
- AI provider calls and prompt contents.
- API key storage.
- Diagnostics, logs, telemetry, Sentry, and updater behavior.
- Release signing and packaging.
- Plugin sandboxing and asset loading.

### Contributors

Contributors may open issues, discussions, and pull requests. Good first
contributions should prefer tests, docs, small UX fixes, and focused bug fixes.

## Decision Process

- Small fixes may be merged after one maintainer review.
- Security, privacy, IPC, updater, dependency, or data-layout changes require a
  maintainer review and a written rationale in the pull request.
- Breaking Vault data-layout changes require a migration note, rollback note,
  and changelog entry.
- Disagreements are resolved by documenting trade-offs in the PR and choosing
  the option that best preserves local-first safety and data portability.

## Release Ownership

Each release has a release owner. The owner must verify:

- `npm run lint`
- `npm test -- --run`
- `npm run test:coverage`
- `npm run build`
- `npm run dist`
- `npm run test:release-smoke`
- `npm run hash:release`
- `npm run test:release-artifacts`
- `npm run security:evidence`
- `npm audit`
- `npm audit --omit=dev`
- `npm run license:check`

Release notes must include:

- User-facing changes.
- Security or privacy impact.
- Known limitations.
- Upgrade notes.
- Artifact hashes.

## Security Handling

Security reports must not be triaged in public issues. See
[SECURITY.md](SECURITY.md). A maintainer should acknowledge a valid private
report within 72 hours when possible.

Security fixes should be merged with the smallest practical scope, covered by a
regression test, and released promptly.

## Bus Factor

To reduce single-maintainer risk:

- Keep architecture decisions documented in `docs/`.
- Keep release steps executable through scripts and CI.
- Keep critical behavior covered by tests.
- Prefer small PRs with clear ownership.
- Mark starter issues with `good first issue` only when setup and test commands
  are enough for a new contributor to succeed.

## Maintainer Handoff

A new maintainer should be able to:

1. Run the full quality gate locally.
2. Build a release artifact.
3. Read the threat model and privacy docs.
4. Triage a diagnostics report without seeing private note content.
5. Cut a patch release from the release checklist.
