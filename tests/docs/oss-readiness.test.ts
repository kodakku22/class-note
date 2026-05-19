import { readFile } from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function read(relPath: string) {
  return readFile(path.join(root, relPath), 'utf-8');
}

describe('OSS readiness documentation', () => {
  it('keeps governance, roadmap, citation, operations, and threat model documents discoverable', async () => {
    const readme = await read('README.md');

    for (const link of [
      'ROADMAP.md',
      'GOVERNANCE.md',
      'CITATION.cff',
      'docs/threat-model.md',
      'docs/security-evidence.md',
      'docs/operations.md',
      'docs/research-workflows.md',
    ]) {
      expect(readme).toContain(link);
      await expect(read(link)).resolves.toMatch(/\S/);
    }
  });

  it('documents release, security, and operations gates used for public readiness', async () => {
    const [governance, operations, threatModel, securityEvidence, distribution] = await Promise.all([
      read('GOVERNANCE.md'),
      read('docs/operations.md'),
      read('docs/threat-model.md'),
      read('docs/security-evidence.md'),
      read('docs/distribution.md'),
    ]);

    expect(governance).toContain('npm audit');
    expect(governance).toContain('npm run test:release-artifacts');
    expect(operations).toContain('インデックスを再構築');
    expect(operations).toContain('診断レポート');
    expect(threatModel).toContain('FileAccessGrant');
    expect(threatModel).toContain('Diagnostics');
    expect(securityEvidence).toContain('security:sbom');
    expect(securityEvidence).toContain('ipc-surface.json');
    expect(distribution).toContain('SHA256SUMS.txt');
    expect(distribution).toContain('test:release-artifacts');
  });
});
