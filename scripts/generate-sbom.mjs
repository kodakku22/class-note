import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf-8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf-8'));
const outPath = path.join(root, 'security', 'sbom.cdx.json');

function packageNameFromLockPath(lockPath) {
  if (!lockPath.startsWith('node_modules/')) return null;
  return lockPath.replace(/^node_modules\//, '');
}

function purl(name, version) {
  const encoded = name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `pkg:npm/${encoded}@${encodeURIComponent(version)}`;
}

const components = Object.entries(lock.packages ?? {})
  .filter(([lockPath, meta]) => lockPath && meta?.version)
  .map(([lockPath, meta]) => {
    const name = meta.name ?? packageNameFromLockPath(lockPath);
    return name
      ? {
          type: 'library',
          name,
          version: String(meta.version),
          purl: purl(name, String(meta.version)),
          scope: meta.dev ? 'optional' : 'required',
          licenses: meta.license ? [{ license: { id: String(meta.license) } }] : undefined,
        }
      : null;
  })
  .filter(Boolean)
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: 'ClassNotes', name: 'scripts/generate-sbom.mjs' }],
    component: {
      type: 'application',
      name: packageJson.name,
      version: packageJson.version,
      licenses: [{ license: { id: packageJson.license } }],
    },
  },
  components,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(sbom, null, 2) + '\n', 'utf-8');
console.info(`Wrote ${path.relative(root, outPath)} with ${components.length} component(s).`);
