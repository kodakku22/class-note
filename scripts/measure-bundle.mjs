import { stat, readdir } from 'fs/promises';
import path from 'path';

const root = process.cwd();

async function sizeOf(file) {
  try {
    const s = await stat(file);
    return s.size;
  } catch {
    return null;
  }
}

function fmt(bytes) {
  if (bytes == null) return 'missing';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

async function listAssets() {
  const dir = path.join(root, 'dist', 'assets');
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const full = path.join(dir, ent.name);
      const size = await sizeOf(full);
      files.push({ name: ent.name, size: size ?? 0 });
    }
    return files.sort((a, b) => b.size - a.size).slice(0, 12);
  } catch {
    return [];
  }
}

const appAsar = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
const portable = path.join(root, 'release', 'ClassNotes-0.1.0-Portable.exe');
const setup = path.join(root, 'release', 'ClassNotes-0.1.0-Setup.exe');
const assets = await listAssets();

console.info('ClassNotes bundle size report');
console.info(`app.asar: ${fmt(await sizeOf(appAsar))}`);
console.info(`portable exe: ${fmt(await sizeOf(portable))}`);
console.info(`setup exe: ${fmt(await sizeOf(setup))}`);
console.info('');
console.info('largest dist/assets files:');
for (const asset of assets) {
  console.info(`- ${asset.name}: ${fmt(asset.size)}`);
}
