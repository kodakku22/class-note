import { readdir, readFile } from 'fs/promises';
import path from 'path';

const root = process.cwd();
const nodeModules = path.join(root, 'node_modules');

const deniedPatterns = [
  /\bAGPL\b/i,
  /\bGPL\b/i,
  /\bLGPL\b/i,
  /\bSSPL\b/i,
  /BUSL/i,
  /UNLICENSED/i,
  /Proprietary/i,
];

const allowedMissing = new Set([
  '@esbuild/win32-x64',
  '@rollup/rollup-win32-x64-gnu',
  '@rollup/rollup-win32-x64-msvc',
  // These packages omit `license` in package.json but ship MIT license files.
  'khroma',
  'spawn-command',
]);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function packageDirs() {
  const entries = await readdir(nodeModules, { withFileTypes: true });
  const dirs = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    if (ent.name.startsWith('@')) {
      const scoped = await readdir(path.join(nodeModules, ent.name), { withFileTypes: true });
      for (const child of scoped) {
        if (child.isDirectory()) dirs.push(path.join(nodeModules, ent.name, child.name));
      }
    } else {
      dirs.push(path.join(nodeModules, ent.name));
    }
  }
  return dirs;
}

const failures = [];
const scanned = [];

for (const dir of await packageDirs()) {
  const pkg = await readJson(path.join(dir, 'package.json'));
  if (!pkg?.name) continue;
  const license =
    typeof pkg.license === 'string'
      ? pkg.license
      : Array.isArray(pkg.licenses)
        ? pkg.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean).join(' OR ')
        : '';
  scanned.push(pkg.name);
  if (!license && !allowedMissing.has(pkg.name)) {
    failures.push(`${pkg.name}: missing license`);
    continue;
  }
  if (deniedPatterns.some((pattern) => pattern.test(license))) {
    failures.push(`${pkg.name}: denied license "${license}"`);
  }
}

if (failures.length > 0) {
  console.error('License check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.info(`License check passed for ${scanned.length} packages.`);
