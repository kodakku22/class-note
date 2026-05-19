# External Audit Readiness

This checklist defines the evidence ClassNotes maintainers should prepare
before asking an external reviewer to assess a release.

## Required Packet

- Threat model: `docs/threat-model.md`
- Architecture: `docs/architecture.md`
- Security evidence guide: `docs/security-evidence.md`
- SBOM: `security/sbom.cdx.json`
- IPC surface: `security/ipc-surface.json`
- Release checksums: `release/SHA256SUMS.txt`
- Coverage report: `coverage/index.html`
- Performance evidence: output from `npm run perf:vault`
- Release artifact smoke result: `npm run test:release-smoke`

## Reviewer Questions

For every IPC handler:

- Is privileged filesystem access performed only in the main process?
- Are Vault paths validated in the main process?
- Does external file import use a one-use capability token?
- Does the handler avoid returning API keys, OAuth tokens, absolute paths, or
  note bodies unless the feature explicitly needs them?
- Is there a regression test for the negative path?

For every renderer feature that displays Markdown, HTML, Mermaid, plugin
content, or clipped web content:

- Is the content sanitized or sandboxed?
- Can the content trigger navigation, external protocol launch, or arbitrary
  file access?
- Is the CSP compatible with the intended behavior and no broader?

For release artifacts:

- Are installer and portable builds produced from CI?
- Are checksums generated after packaging?
- Is code signing enabled for public releases?
- Does the smoke test launch the packaged executable?

## Known Pre-1.0 Gaps

- Public releases still require completed Windows code-signing credentials.
- macOS and Linux release behavior requires platform-specific validation.
- Plugin permission declarations are not yet a stable public API.
- Large real-world Vault benchmarks should be collected from consenting test
  Vaults before claiming team-scale readiness.
