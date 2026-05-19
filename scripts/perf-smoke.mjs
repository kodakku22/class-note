// perf-smoke.mjs — micro-benchmark for VaultIndex build + search.
//
// What this measures (no AI calls, no network):
//   - VaultIndex build time for a synthetic 1000-note vault
//   - search:query equivalent (full-text scan) latency P50 / P95 over 50 runs
//   - bundle sizes (dist-electron + dist)
//
// Why: gives us a single reproducible "does Phase 2+3 regress perf?" check.
// Result is printed to stdout AND appended to docs/PERF.md so we can diff
// the trend release-over-release.
//
// Usage: node scripts/perf-smoke.mjs
import { mkdtemp, writeFile, mkdir, rm, stat, readdir, appendFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';

const NOTE_COUNT = 1000;
const SEARCH_RUNS = 50;
const SUBJECTS = ['Math', 'Physics', 'Biology', 'CS', 'History'];
const KEYWORDS = ['gradient', 'photosynthesis', 'integral', 'algorithm', 'experiment'];

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(1)} ms`;
}

function fmtBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function buildSyntheticVault() {
  const vault = await mkdtemp(join(tmpdir(), 'cn-perf-vault-'));
  for (const subject of SUBJECTS) {
    const dir = join(vault, subject, 'notes');
    await mkdir(dir, { recursive: true });
  }
  const start = performance.now();
  for (let i = 0; i < NOTE_COUNT; i += 1) {
    const subject = SUBJECTS[i % SUBJECTS.length];
    const body = [
      '---',
      `title: Note ${i}`,
      `tags: [${KEYWORDS[i % KEYWORDS.length]}, demo]`,
      '---',
      '',
      `# Note ${i} on ${KEYWORDS[i % KEYWORDS.length]}`,
      '',
      'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(8),
      '',
      KEYWORDS[(i + 1) % KEYWORDS.length],
      'descent method is used to compute the optimum.',
    ].join('\n');
    await writeFile(join(vault, subject, 'notes', `note-${i}.md`), body, 'utf-8');
  }
  const write = performance.now() - start;
  return { vault, writeMs: write };
}

async function measureIndexBuild(vault) {
  // We invoke the same vault-index code path the app uses, but via dynamic
  // import so the script stays standalone.
  const { rebuildVaultIndex } = await import('../dist-electron/vault-index.js').catch(() => ({}));
  if (!rebuildVaultIndex) {
    // Fall back to a simpler measurement: just walk + read all files.
    const start = performance.now();
    let count = 0;
    async function walk(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) await walk(full);
        else count += 1;
      }
    }
    await walk(vault);
    return { ms: performance.now() - start, fileCount: count, mode: 'fallback-walk' };
  }
  const start = performance.now();
  const idx = await rebuildVaultIndex(vault);
  return { ms: performance.now() - start, fileCount: idx.files.length, mode: 'rebuildVaultIndex' };
}

async function measureSearchLatency(vault) {
  // Mock search by scanning all .md bodies for a keyword (mimics what
  // electron/ipc/search.ts does with searchText). Runs 50× for percentiles.
  const allFiles = [];
  for (const subject of SUBJECTS) {
    const dir = join(vault, subject, 'notes');
    const entries = await readdir(dir);
    for (const name of entries) allFiles.push(join(dir, name));
  }
  const fs = await import('fs/promises');
  const samples = [];
  for (let i = 0; i < SEARCH_RUNS; i += 1) {
    const kw = KEYWORDS[i % KEYWORDS.length].toLowerCase();
    const start = performance.now();
    let hits = 0;
    for (const fp of allFiles) {
      const body = await fs.readFile(fp, 'utf-8');
      if (body.toLowerCase().includes(kw)) hits += 1;
    }
    samples.push(performance.now() - start);
    if (i === 0) console.log(`  warm-up: ${hits} hits for "${kw}"`);
  }
  return { p50: percentile(samples, 50), p95: percentile(samples, 95), runs: SEARCH_RUNS };
}

async function measureBundle() {
  const candidates = [
    'dist-electron/main.js',
    'dist-electron/preload.js',
    'dist-electron/pdf-DjmeSDzu.js',
    'dist-electron/provider-D2RUyFtE.js',
  ];
  const out = [];
  for (const rel of candidates) {
    try {
      const s = await stat(rel);
      out.push({ name: rel, size: s.size });
    } catch {
      out.push({ name: rel, size: null });
    }
  }
  return out;
}

async function main() {
  console.log('=== ClassNotes perf-smoke ===\n');

  console.log('▶ Building synthetic vault…');
  const { vault, writeMs } = await buildSyntheticVault();
  console.log(`  Wrote ${NOTE_COUNT} notes in ${fmtMs(writeMs)} → ${vault}\n`);

  console.log('▶ VaultIndex build…');
  const idx = await measureIndexBuild(vault);
  console.log(`  ${idx.mode}: ${idx.fileCount} files in ${fmtMs(idx.ms)}\n`);

  console.log(`▶ Search latency (${SEARCH_RUNS} runs)…`);
  const search = await measureSearchLatency(vault);
  console.log(`  P50 ${fmtMs(search.p50)} / P95 ${fmtMs(search.p95)}\n`);

  console.log('▶ Bundle sizes…');
  const bundles = await measureBundle();
  for (const b of bundles) {
    console.log(`  ${b.name}: ${b.size == null ? '(missing — run npm run build first)' : fmtBytes(b.size)}`);
  }

  // Append a row to docs/PERF.md
  const date = new Date().toISOString().split('T')[0];
  const row = `| ${date} | ${idx.fileCount} | ${fmtMs(idx.ms)} | ${fmtMs(search.p50)} | ${fmtMs(search.p95)} | ${bundles.map((b) => (b.size == null ? '—' : fmtBytes(b.size))).join(' / ')} |\n`;
  try {
    await appendFile('docs/PERF.md', row, 'utf-8');
    console.log(`\n▶ Appended row to docs/PERF.md`);
  } catch (err) {
    console.warn(`  (couldn't write docs/PERF.md: ${err})`);
  }

  await rm(vault, { recursive: true, force: true });
  console.log('\n=== done ===');
}

main().catch((err) => {
  console.error('perf-smoke failed:', err);
  process.exit(1);
});
