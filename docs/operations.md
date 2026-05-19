# Operations Guide

This guide explains how to keep a ClassNotes Vault usable, recover from common
local failures, and collect support information without exposing private notes.

## Data Locations

| Data | Location |
|---|---|
| Notes, papers, books, outputs | User-selected Vault folder |
| Settings | `<userData>/settings.json` |
| Encrypted API keys | `<userData>/openai-api-key.bin`, `<userData>/gemini-api-key.bin`, `<userData>/anthropic-api-key.bin` |
| Logs | `<userData>/logs/` |
| Vault index cache | `<userData>/indexes/` |
| Diagnostics reports | `<userData>/diagnostics/` |

The Vault is the source of truth. `userData/indexes/` is a derived cache and can
be deleted or rebuilt.

## Backup

Recommended baseline:

- Back up the entire Vault folder with your normal file backup system.
- Use Settings -> `データ保護` -> `バックアップを作成` before large imports,
  bulk renames, or release testing.
- Include hidden Vault folders such as `.classnotes/` if you use plugins.
- Do not rely on `userData/indexes/`; it is rebuilt from the Vault.
- Keep separate backups before large import, rename, or delete operations.

For research projects, include:

- `Papers/` Markdown metadata and generated `refs.bib`.
- `Outputs/` if you depend on generated LaTeX/HTML/PDF artifacts.
- Experiment notes with commit hash, dataset version, seed, and environment.

## Restore

1. Install ClassNotes.
2. Select the restored Vault folder.
3. Open Settings.
4. Use `データ保護` -> `安全性チェック`.
5. Use `Vault インデックス` -> `インデックスを再構築`.
6. Run a search and open the research dashboard to confirm the cache is fresh.

If settings are lost, reconfigure AI mode and telemetry preferences. The Vault
files remain usable in Obsidian or any Markdown editor.

## Vault Index Recovery

Symptoms:

- Search misses notes that exist on disk.
- Backlinks look stale.
- Research dashboard counts are wrong.
- Diagnostics show `index.ready: false`.

Recovery:

1. Open Settings.
2. Check `Vault インデックス`.
3. Click `インデックスを再構築`.
4. If the issue persists, close the app and delete `<userData>/indexes/`.
5. Reopen the app and rebuild again.

The rebuild operation reads Vault files and rewrites only the derived JSON cache.
It does not mutate note bodies.

## Vault Safety Audit

Use Settings -> `データ保護` -> `安全性チェック` to check:

- Unreadable files.
- Invalid YAML frontmatter.
- Missing or duplicate paper `bibkey` values.
- Broken wikilinks by filename/title lookup.

Use Settings -> `データ保護` -> `バックアップを作成` to create a local
snapshot under `<userData>/vault-backups/`. The backup includes Vault files but
excludes generated/build directories, `.history`, `.trash`, `.obsidian`, and
plugin executable assets under `.classnotes/plugins/`.

Large files over 100 MB are skipped and listed in the backup manifest.

## Diagnostics Export

Use Settings -> `診断レポートを書き出す` when filing a support issue.

The report includes:

- App version and platform.
- Safe settings summary.
- Vault index status.
- Recent redacted logs, capped at 500 lines.
- Recent error count.

The report must not include:

- Note bodies.
- API keys.
- Bearer tokens.
- Absolute Vault paths.
- Absolute `userData` paths.

Open the report before attaching it to an issue if your research context is
sensitive.

## Logs

Use Settings -> `ログフォルダを開く` to inspect local logs. Logs are redacted, but
manual review is still recommended before sharing.

When reporting a bug, include:

- ClassNotes version.
- Operating system.
- AI provider/auth mode/model (`openai`, `gemini`, `claude`, or `none`; `api-key` or `login`).
- Steps to reproduce.
- Diagnostics report if relevant.

Do not paste private note contents into public issues.

## Common Failure Modes

| Failure | Likely cause | Recovery |
|---|---|---|
| Search is stale | Derived index is stale or corrupt | Rebuild Vault index |
| Import fails after choosing a file | Picker token expired or was reused | Pick the file again |
| AI call fails | Missing CLI login, invalid API key, model mismatch, network error | Use Settings connection test |
| Bulk change feels risky | Large import, rename, or delete operation | Create a local backup first |
| Reproducibility score is low | Missing bibkeys, unresolved citations, or incomplete experiment metadata | Run Research reproducibility check and fix listed notes |
| App starts but release looks broken | Packaging regression | Run release smoke and artifact verification |
| A note changed in Obsidian while open | mtime conflict | Choose reload or overwrite in the conflict prompt |

## Release Operations

Before publishing:

```bash
npm run lint
npm test -- --run
npm run test:coverage
npm run build
npm run dist
npm run test:release-smoke
npm run hash:release
npm run test:release-artifacts
npm run security:evidence
npm audit
npm audit --omit=dev
npm run license:check
```

Release notes should state:

- What changed.
- Any Vault data-layout impact.
- Security and privacy impact.
- Known limitations.
- Artifact hashes.
