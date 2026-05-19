# ClassNotes Roadmap

ClassNotes is pre-1.0. The roadmap is intentionally operational: each milestone
must improve whether an outside researcher can install, trust, verify, and keep
using the app.

## 0.1.x - Hardening and OSS Readiness

Goal: make early Windows users safe and supportable.

- Keep `npm audit` and `npm audit --omit=dev` at 0 known vulnerabilities.
- Maintain IPC capability separation for external files.
- Keep diagnostics local-only and redacted by default.
- Add recovery paths for Vault index corruption and stale search results.
- Publish release assets with checksums and release notes.
- Document threat model, operations, contribution flow, and research workflows.

Exit criteria:

- CI passes lint, tests, coverage, build, license check, and full audit.
- Release workflow builds installer + portable artifacts, smoke-tests them, and
  verifies checksums.
- User-facing docs cover backup, restore, diagnostics, AI data flow, and index
  recovery.

## 0.2.x - Research Workflow Stabilization

Goal: make ClassNotes reliable for individual graduate students and researchers.

- Stabilize Papers, Books, lecture notes, research dashboard, citations, and
  LaTeX export as the core workflow.
- Add sample Vault walkthroughs for literature review and experiment tracking.
- Expand regression tests for BibTeX import/export, LaTeX export, and dashboard
  aggregation.
- Improve empty states, error messages, and import failure recovery.
- Add compatibility tests for Obsidian-facing Markdown/frontmatter conventions.

Exit criteria:

- A fresh user can complete the documented literature-review workflow with the
  sample Vault.
- Main import/export workflows have automated regression coverage.
- Known data-loss risks have documented recovery or rollback behavior.

## 0.3.x - Cross-Platform Release Validation

Goal: move beyond Windows-only early releases.

- Validate macOS and Linux packaging in CI.
- Add platform-specific install and uninstall docs.
- Define code-signing and notarization requirements before public macOS release.
- Track platform-specific filesystem, safeStorage, and shell integration risks.

Exit criteria:

- At least one signed or notarized release path exists for every supported
  platform.
- Release smoke tests pass on each supported platform.

## 0.4.x - Ecosystem and Plugin Safety

Goal: let advanced users extend the app without weakening local-first security.

- Stabilize plugin manifest schema.
- Add plugin permission declarations and explicit user review.
- Document plugin API compatibility policy.
- Add sandbox regression tests for plugin assets and iframe isolation.

Exit criteria:

- Plugins cannot access Node/Electron APIs from renderer contexts.
- Plugin asset serving remains Vault-scoped and path-validated.

## 1.0 - Stable Individual Research Workspace

Goal: a researcher can depend on ClassNotes as a local-first personal research
workspace.

- Stable Vault data layout and migration policy.
- Signed releases and repeatable release process.
- Documented support window for security fixes.
- Clear governance and maintainer handoff process.
- Practical backup, restore, and diagnostics path for support.

Non-goals for 1.0:

- Multi-user collaboration.
- Enterprise RBAC.
- Hosted SaaS storage.
- Replacing Zotero or Obsidian.
