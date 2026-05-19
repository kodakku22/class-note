# Security Policy

ClassNotes is a local-first desktop app that reads and writes user-selected
Vault folders. Security issues are treated seriously because the app handles
local files, AI prompts, attachments, and optional API keys.

## Supported Versions

ClassNotes is pre-1.0. Security fixes are provided for the latest released
version only.

## Reporting a Vulnerability

Please do not open a public GitHub issue for vulnerabilities.

Use one of these channels:

- GitHub Private Vulnerability Reporting, if enabled on the repository.
- Email: `security@classnotes.app` until the public repository defines a
  project-specific contact.

Please include:

- Affected version or commit.
- Operating system.
- Steps to reproduce.
- Expected and actual impact.
- Whether the issue involves Vault path access, AI prompt handling, API keys,
  updater behavior, or renderer security.

## Security Design

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- `app-file://` is restricted to the active Vault.
- File IPC must validate paths with `validateVaultPath`.
- External file imports use short-lived, one-use, purpose-specific picker grants.
- Anthropic API keys are stored with Electron `safeStorage`.
- Renderer code can set or clear an API key but cannot read it back.
- CSP is locked down in production.
- Sentry and telemetry are opt-in.
- Diagnostics are local-only and redact API keys, tokens, and absolute paths.

The detailed trust boundaries, attack paths, and reviewer checklist live in
[docs/threat-model.md](docs/threat-model.md).

## Out of Scope

- Issues requiring physical access to an unlocked user account.
- Vulnerabilities in unsupported modified builds.
- Reports against development-only dependencies unless they affect release
  artifacts.
