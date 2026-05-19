// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createInteropReport } from '../../electron/skills/interop-report';

async function tempVault() {
  const root = await mkdtemp(path.join(tmpdir(), 'cn-interop-'));
  await mkdir(path.join(root, '.obsidian'), { recursive: true });
  await mkdir(path.join(root, 'Math', 'notes'), { recursive: true });
  await mkdir(path.join(root, 'Papers'), { recursive: true });
  return root;
}

describe('createInteropReport', () => {
  it('reports healthy Zotero and Obsidian compatibility signals', async () => {
    const root = await tempVault();
    await writeFile(
      path.join(root, 'Math', 'notes', 'Calc.md'),
      '---\ntags: [math]\n---\n# Calc\n[[Paper]] #lecture',
      'utf-8'
    );
    await writeFile(
      path.join(root, 'Papers', 'Paper.md'),
      '---\ntitle: Paper\nbibkey: smith2024\ndoi: 10.1000/example\n---\n# Paper',
      'utf-8'
    );
    await writeFile(path.join(root, 'Papers', 'refs.bib'), '@article{smith2024, title={Paper}}', 'utf-8');

    const report = await createInteropReport(root);

    expect(report.obsidian).toMatchObject({
      hasConfigDir: true,
      markdownFiles: 2,
      filesWithFrontmatter: 2,
      wikilinkCount: 1,
      tagCount: 2,
      notesMissingFrontmatter: [],
      brokenWikilinks: [],
    });
    expect(report.zotero).toMatchObject({
      hasRefsBib: true,
      refsBibEntries: 1,
      paperFiles: 1,
      papersWithBibkey: 1,
      papersWithDoi: 1,
      papersMissingBibkey: [],
      duplicateBibkeys: [],
    });
    expect(report.recommendations).toContain('Obsidian / Zotero 互換性の主要チェックは良好です');
    expect(report.repairActions).toEqual([]);
  });

  it('flags missing refs.bib, missing bibkeys, and duplicate bibkeys', async () => {
    const root = await tempVault();
    await writeFile(path.join(root, 'Math', 'notes', 'A.md'), '# A\nNo links', 'utf-8');
    await writeFile(
      path.join(root, 'Papers', 'One.md'),
      '---\ntitle: One\nbibkey: dup\n---\n# One',
      'utf-8'
    );
    await writeFile(
      path.join(root, 'Papers', 'Two.md'),
      '---\ntitle: Two\nbibkey: dup\n---\n# Two',
      'utf-8'
    );
    await writeFile(path.join(root, 'Papers', 'Three.md'), '---\ntitle: Three\n---\n# Three', 'utf-8');

    const report = await createInteropReport(root);

    expect(report.zotero.hasRefsBib).toBe(false);
    expect(report.zotero.paperFiles).toBe(3);
    expect(report.zotero.papersWithBibkey).toBe(2);
    expect(report.zotero.papersMissingBibkey).toEqual(['Papers/Three.md']);
    expect(report.zotero.duplicateBibkeys).toEqual(['dup']);
    expect(report.recommendations.join('\n')).toContain('Papers/refs.bib がありません');
    expect(report.recommendations.join('\n')).toContain('bibkey が無いPaperがあります');
    expect(report.repairActions.some((action) => action.id === 'zotero-bibkey-Papers/Three.md')).toBe(true);
  });

  it('flags paper bibkeys missing from refs.bib and returns dry-run repair actions', async () => {
    const root = await tempVault();
    await writeFile(
      path.join(root, 'Papers', 'One.md'),
      '---\ntitle: One\nbibkey: one2026\ndoi: 10.1000/one\n---\n# One',
      'utf-8'
    );
    await writeFile(path.join(root, 'Papers', 'refs.bib'), '@article{other2026, title={Other}}', 'utf-8');

    const report = await createInteropReport(root);

    expect(report.zotero.refsBibEntries).toBe(1);
    expect(report.zotero.bibkeysMissingFromRefsBib).toEqual(['one2026']);
    expect(report.recommendations.join('\n')).toContain('refs.bibに見つかりません');
    expect(report.repairActions).toContainEqual(
      expect.objectContaining({
        id: 'zotero-refresh-refs-bib',
        dryRunOnly: true,
      })
    );
  });
});
