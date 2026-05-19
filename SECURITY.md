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

## Verifying a Release

Windows release builds are produced by the GitHub Actions release workflow
and (once SignPath Foundation code signing is active) signed by the
SignPath Foundation certificate. Three independent checks are recommended
on every download. They are listed in increasing order of strictness — run
at least the SHA-256 check today, and run all three once signed releases
ship.

### 1. Windows Explorer — Digital Signatures

Right-click the EXE → **Properties** → **Digital Signatures** tab.

- The tab must be present and the signature must report as valid.
- The signer (Name of signer) should be **SignPath Foundation**.
- The hash algorithm should be **sha256**.
- "Details" → "View Certificate" → "Certification Path" should reach a
  trusted root.

If the tab is missing, the build is unsigned. If the signature is invalid,
the file should not be trusted.

### 2. signtool (Windows SDK)

```powershell
signtool verify /pa /v .\ClassNotes-<version>-Setup.exe
```

The output should end with `Successfully verified` and show the SignPath
Foundation certificate chain. `signtool` ships with the Windows 10/11
SDK; if you do not have it, the Digital Signatures dialog from step 1 is
equivalent.

### 3. SHA-256 cross-check

The GitHub Release page publishes `SHA256SUMS.txt` alongside each EXE.
Compute the hash locally and compare:

```powershell
Get-FileHash .\ClassNotes-<version>-Setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The hash printed by `Get-FileHash` must match the corresponding line in
`SHA256SUMS.txt`. A mismatch means the file is corrupt or tampered with
and must be discarded.

The same verification approach is applied automatically by
`electron-updater` before any auto-update is installed; if the signature
chain or hash does not match, the update is refused.

For the project's full code-signing policy (team roles, signing scope,
SignPath acknowledgement, reporting concerns), see
[docs/code-signing-policy.md](docs/code-signing-policy.md).

## Out of Scope

- Issues requiring physical access to an unlocked user account.
- Vulnerabilities in unsupported modified builds.
- Reports against development-only dependencies unless they affect release
  artifacts.
