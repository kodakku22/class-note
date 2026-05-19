import { createHash } from 'crypto';
import { access, readdir, readFile } from 'fs/promises';
import path from 'path';

const releaseDir = path.join(process.cwd(), 'release');
const unpackedExe = path.join(releaseDir, 'win-unpacked', 'ClassNotes.exe');
const asar = path.join(releaseDir, 'win-unpacked', 'resources', 'app.asar');
const latestYml = path.join(releaseDir, 'latest.yml');
const sumsPath = path.join(releaseDir, 'SHA256SUMS.txt');

async function mustExist(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

await mustExist(unpackedExe, 'unpacked executable');
await mustExist(asar, 'app.asar');
await mustExist(latestYml, 'latest.yml');
await mustExist(sumsPath, 'SHA256SUMS.txt');

const entries = await readdir(releaseDir, { withFileTypes: true });
const exeFiles = entries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

if (!exeFiles.some((name) => /Setup\.exe$/i.test(name))) {
  throw new Error('NSIS setup executable is missing from release/.');
}
if (!exeFiles.some((name) => /Portable\.exe$/i.test(name))) {
  throw new Error('Portable executable is missing from release/.');
}

const sums = await readFile(sumsPath, 'utf-8');
const expected = new Map();
for (const line of sums.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const match = line.match(/^([a-f0-9]{64})\s+(.+\.exe)$/i);
  if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`);
  expected.set(match[2], match[1].toLowerCase());
}

for (const fileName of exeFiles) {
  const wanted = expected.get(fileName);
  if (!wanted) throw new Error(`Missing checksum for ${fileName}`);
  const bytes = await readFile(path.join(releaseDir, fileName));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== wanted) {
    throw new Error(`Checksum mismatch for ${fileName}: expected ${wanted}, got ${actual}`);
  }
}

console.info(`Release artifact verification passed for ${exeFiles.length} executable(s).`);
