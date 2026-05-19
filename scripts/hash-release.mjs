import { createHash } from 'crypto';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const releaseDir = path.join(process.cwd(), 'release');
const entries = await readdir(releaseDir, { withFileTypes: true }).catch(() => []);
const exeFiles = entries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

if (exeFiles.length === 0) {
  console.error('No release/*.exe files found. Run npm run dist first.');
  process.exit(1);
}

const lines = [];
for (const fileName of exeFiles) {
  const bytes = await readFile(path.join(releaseDir, fileName));
  const hash = createHash('sha256').update(bytes).digest('hex');
  lines.push(`${hash}  ${fileName}`);
}

const output = `${lines.join('\n')}\n`;
await writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), output, 'utf-8');
process.stdout.write(output);
