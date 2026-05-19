# Performance

ClassNotes treats Vault performance as release evidence, not a one-off manual
claim. The main benchmark today focuses on the derived Vault index because
search, backlinks, and the research dashboard depend on it.

## Vault Index Benchmark

Run after building the Electron main process:

```bash
npm run build
npm run perf:vault
```

The default sizes are `100,1000,5000` synthetic Markdown notes. To run a larger
local benchmark:

```bash
npm run perf:vault -- --sizes=1000,10000,50000
```

The script creates temporary Vaults, indexes them, measures build time, performs
a simple in-memory search pass, and deletes all generated data. It does not use
or inspect any user Vault.

## Release Interpretation

Before calling a release stable for larger research Vaults, maintainers should
record:

- note count;
- indexed file count;
- index rebuild time;
- representative search latency;
- RSS memory delta;
- machine and OS used for the run.

If the 10k-note benchmark regresses by more than 25% from the previous release,
the release notes should call that out or the regression should be fixed before
publishing.

## Current Limits

The benchmark is synthetic and does not yet model:

- very large PDFs;
- OneDrive/Dropbox/network-drive latency;
- antivirus interference on Windows;
- concurrent edits from Obsidian while ClassNotes is indexing.

Those scenarios still require manual validation before a team depends on
ClassNotes for a large shared research archive.
