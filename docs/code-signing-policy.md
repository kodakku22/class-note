# Code Signing Policy

This document describes how ClassNotes release binaries are signed, who is
authorized to sign them, and how end users can verify a downloaded build.
It is published as part of ClassNotes' obligations under the SignPath
Foundation Open Source program.

> **Free code signing provided by [SignPath.io](https://signpath.io),
> certificate by [SignPath Foundation](https://signpath.org).**

## Scope

This policy covers:

- Windows installer binaries produced by the project's release pipeline
  and uploaded to the GitHub Releases page at
  [`kodakku22/class-note`](https://github.com/kodakku22/class-note/releases).
- The auto-update manifest (`latest.yml`) consumed by `electron-updater`.

This policy does not cover community rebuilds, forks, or third-party
plugins loaded into ClassNotes at runtime.

## Project Team Roles

ClassNotes is currently maintained by a single individual. The maintainer
fulfills all three SignPath Foundation roles personally:

| Role          | Responsibility                                                            | Holder        |
|---------------|---------------------------------------------------------------------------|---------------|
| **Committer** | Modify source code in the main branch without additional review.          | `@kodakku22`  |
| **Reviewer**  | Review every external contribution (issue, pull request) before merge.    | `@kodakku22`  |
| **Approver**  | Approve each signing request submitted through the SignPath dashboard.    | `@kodakku22`  |

If additional maintainers join the project, this table will be updated in
the same commit that grants them repository write access, and the SignPath
project configuration will be updated accordingly.

## Account Security

All accounts used to release, sign, or distribute ClassNotes
(GitHub, SignPath, the maintainer's release e-mail address) have
**two-factor authentication enabled**, as required by the SignPath
Foundation terms.

API tokens used by GitHub Actions to communicate with SignPath are stored
exclusively as encrypted GitHub Actions Secrets on the
[`kodakku22/class-note`](https://github.com/kodakku22/class-note)
repository. They are never committed to source.

## Release & Signing Flow

1. The maintainer bumps `version` in `package.json` and pushes a `v*` tag.
2. The `Release` GitHub Actions workflow
   (`.github/workflows/release.yml`) runs on `windows-latest`.
3. The workflow installs dependencies, runs the full quality gate
   (`lint`, `test`, `coverage`, `license:check`, `security:evidence`,
   `npm audit`), then builds renderer and main process bundles.
4. The signing step is performed exclusively from inside GitHub Actions
   using SignPath. The maintainer has no access to the private key
   material outside the SignPath managed signing service.
5. `electron-builder` packages the NSIS installer, the portable EXE,
   `latest.yml`, and `*.blockmap` files, then uploads them as a draft
   GitHub Release.
6. The maintainer (acting as Approver) reviews the draft release, runs
   any final smoke tests, and publishes it.
7. `electron-updater` instances on user machines poll the published
   GitHub Releases feed and apply the new build only after validating
   the signature against the certificate that signed the currently
   installed build.

The signing step never runs from a maintainer's local machine. Source for
each release is fetched fresh by GitHub Actions from the public repository.

## What Gets Signed

- `ClassNotes-<version>-Setup.exe` — NSIS installer.
- `ClassNotes-<version>-Portable.exe` — portable build.
- `latest.yml` and `*.blockmap` — auto-update manifest and delta files.

All artifacts are accompanied by `SHA256SUMS.txt` for independent
cryptographic verification.

## What Does Not Get Signed

- Local development builds produced by `npm run dist` on a maintainer
  workstation (the CI signing secrets are not available locally).
- Forks of the repository or any community rebuild. Such rebuilds remain
  unsigned unless their authors obtain their own code-signing
  certificates.
- Plugins or extensions loaded by ClassNotes at runtime. Plugins run in
  sandboxed renderer iframes without access to the host certificate.

The SignPath Foundation certificate is used only for the
`kodakku22/class-note` repository's own release artifacts.

## Privacy

The signing pipeline transmits only the unsigned binary and its
metadata to SignPath. No Vault contents, end-user notes, API keys, or
personal data are involved. The auto-updater communicates only with
GitHub Releases.

See [privacy.md](privacy.md) for the project's full privacy policy.

## Reporting Concerns

- **Suspected misuse, compromise, or unauthorized signing**: please use
  GitHub Private Vulnerability Reporting on the
  [`kodakku22/class-note`](https://github.com/kodakku22/class-note)
  repository, or follow the channels described in
  [SECURITY.md](../SECURITY.md). Do not file a public issue for these.
- **Questions or clarifications** about this policy: open a regular
  GitHub issue with the `code-signing` label.

## End-User Verification

Users can verify a downloaded build via three independent checks
documented in [SECURITY.md](../SECURITY.md):

1. Windows Explorer **Properties → Digital Signatures** must show
   `SignPath Foundation` as the signer with a valid SHA-256 signature.
2. `signtool verify /pa /v <file>` from a Windows SDK install must
   report "Successfully verified" and the SignPath Foundation chain.
3. The SHA-256 hash from `Get-FileHash` must match the corresponding
   entry in the release's `SHA256SUMS.txt`.

If any of these checks fails, the binary should not be trusted.

## Acknowledgement

ClassNotes thanks SignPath for sponsoring code signing for Open Source
projects. Free code signing provided by
[SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org).
