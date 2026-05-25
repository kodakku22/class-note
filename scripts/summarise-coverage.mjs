// Read coverage/coverage-summary.json (produced by vitest's json-summary
// reporter) and print a one-line summary plus a markdown table. Designed
// for two consumers:
//
//   • Local: `npm run coverage:summary` prints to stdout.
//   • CI:    `npm run coverage:summary >> "$GITHUB_STEP_SUMMARY"` surfaces
//            the numbers on the PR check page (no external service needed).
//
// Exits 0 even on missing file so a missing coverage report does not fail
// the build — that's already enforced by vitest's own threshold gates.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const summaryPath = resolve(process.cwd(), 'coverage', 'coverage-summary.json');

if (!existsSync(summaryPath)) {
  console.log('## Coverage');
  console.log('_No `coverage/coverage-summary.json` found — run `npm run test:coverage` first._');
  process.exit(0);
}

const raw = JSON.parse(readFileSync(summaryPath, 'utf8'));
const total = raw.total ?? {};

function pct(metric) {
  const v = total[metric]?.pct;
  if (typeof v !== 'number') return 'n/a';
  return `${v.toFixed(1)} %`;
}

function badge(metric, threshold = 70) {
  const v = total[metric]?.pct;
  if (typeof v !== 'number') return '⚪️';
  if (v >= threshold + 15) return '🟢';
  if (v >= threshold) return '🟡';
  return '🔴';
}

const lines = pct('lines');
const branches = pct('branches');
const functions = pct('functions');
const statements = pct('statements');

console.log('## Coverage');
console.log('');
console.log('| metric | value | gate (70 %) |');
console.log('|---|---|---|');
console.log(`| lines | \`${lines}\` | ${badge('lines')} |`);
console.log(`| branches | \`${branches}\` | ${badge('branches')} |`);
console.log(`| functions | \`${functions}\` | ${badge('functions')} |`);
console.log(`| statements | \`${statements}\` | ${badge('statements')} |`);
console.log('');
console.log(`_oneline: lines ${lines} · branches ${branches} · functions ${functions} · statements ${statements}_`);
