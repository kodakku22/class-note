// @vitest-environment node
import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, afterEach } from 'vitest';
import {
  auditVaultSafety,
  createVaultBackup,
  getResearchReproducibilityReport,
  setVaultSafetyBackupDirectoryForTests,
} from '../../electron/vault-safety';

async function makeVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'classnotes-safety-'));
  const vault = path.join(root, 'ClassVault');
  const backupDir = path.join(root, 'backups');
  await mkdir(path.join(vault, 'Papers'), { recursive: true });
  await mkdir(path.join(vault, 'Notes'), { recursive: true });
  await mkdir(path.join(vault, 'Experiments'), { recursive: true });
  await mkdir(path.join(vault, '.history'), { recursive: true });
  setVaultSafetyBackupDirectoryForTests(backupDir);
  return { root, vault, backupDir };
}

afterEach(() => {
  setVaultSafetyBackupDirectoryForTests(null);
});

describe('vault safety', () => {
  it('audits duplicate bibkeys, broken wikilinks, and invalid frontmatter', async () => {
    const { vault } = await makeVault();
    await writeFile(
      path.join(vault, 'Papers', 'A.md'),
      '---\ntype: paper\nbibkey: dup2026\ntitle: A\n---\n\nSee [[Missing Note]].',
      'utf-8'
    );
    await writeFile(
      path.join(vault, 'Papers', 'B.md'),
      '---\ntype: paper\nbibkey: dup2026\ntitle: B\n---\n\nBody',
      'utf-8'
    );
    await writeFile(path.join(vault, 'Notes', 'Bad.md'), '---\ntags: [oops\n---\nBody', 'utf-8');

    const audit = await auditVaultSafety(vault);

    expect(audit.fileCount).toBe(3);
    expect(audit.markdownCount).toBe(3);
    expect(audit.issues.map((issue) => issue.code)).toContain('duplicate_bibkey');
    expect(audit.issues.map((issue) => issue.code)).toContain('broken_wikilink');
    expect(audit.issues.map((issue) => issue.code)).toContain('invalid_frontmatter');
  });

  it('creates a manifest-backed backup and excludes local history', async () => {
    const { vault } = await makeVault();
    await writeFile(path.join(vault, 'Notes', 'Keep.md'), '# Keep', 'utf-8');
    await writeFile(path.join(vault, '.history', 'Old.md'), '# Old', 'utf-8');

    const result = await createVaultBackup(vault);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf-8')) as {
      fileCount: number;
      files: Array<{ relPath: string; sha256: string }>;
    };

    expect(result.ok).toBe(true);
    expect(manifest.fileCount).toBe(1);
    expect(manifest.files[0].relPath).toBe('Notes/Keep.md');
    expect(manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(readdir(path.join(result.backupDir, '.history'))).rejects.toThrow();
  });

  it('reports research reproducibility gaps for papers, citations, and experiments', async () => {
    const { vault } = await makeVault();
    await writeFile(
      path.join(vault, 'Papers', 'Cited.md'),
      '---\ntype: paper\nbibkey: cited2026\ntitle: Cited\n---\n\nBody',
      'utf-8'
    );
    await writeFile(
      path.join(vault, 'Papers', 'MissingKey.md'),
      '---\ntype: paper\ntitle: Missing Key\n---\n\nCites @unknown2026.',
      'utf-8'
    );
    await writeFile(
      path.join(vault, 'Experiments', 'Run.md'),
      '---\ntype: experiment\ndataset: tiny\nseed: 7\n---\n\nResult',
      'utf-8'
    );

    const report = await getResearchReproducibilityReport(vault);

    expect(report.score).toBeLessThan(100);
    expect(report.papers.total).toBe(2);
    expect(report.papers.missingBibkey).toContain('Papers/MissingKey.md');
    expect(report.citations.unresolvedCitationKeys).toContain('unknown2026');
    expect(report.experiments.incomplete[0].missingFields).toEqual(['code_commit', 'environment']);
  });
});
