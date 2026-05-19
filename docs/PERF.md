# ClassNotes Performance Log

`scripts/perf-smoke.mjs` appends one row per run. Compare across releases to
detect regressions in:

- **VaultIndex build**: time to index N synthetic Markdown notes
- **Search P50/P95**: full-text scan latency over 50 runs
- **Bundle sizes**: `dist-electron/{main, preload, pdf, provider}.js`

Goals (informal targets):
- VaultIndex build for 1000 notes: < 2 s
- Search P95 for 1000 notes: < 200 ms
- `main.js` bundle: < 1 MB

## Run

```bash
npm run build           # bundles must exist for bundle measurements
node scripts/perf-smoke.mjs
```

## Log

| Date | FileCount | IndexBuild | SearchP50 | SearchP95 | Bundles (main/preload/pdf/provider) |
|------|-----------|------------|-----------|-----------|-------------------------------------|
| 2026-05-17 | 1000 | 493.6 ms | 192.1 ms | 209.5 ms | 0.02 MB / 0.02 MB / 0.45 MB / 0.02 MB |
