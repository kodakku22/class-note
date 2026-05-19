// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getVaultIndex,
  rebuildVaultIndex,
  removeVaultIndexFile,
  setVaultIndexDirectoryForTests,
  updateVaultIndexFile,
} from '../../electron/vault-index';

const roots: string[] = [];

async function tempWorkspace(): Promise<{ vault: string; indexDir: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'classnotes-index-'));
  const vault = path.join(root, 'vault');
  const indexDir = path.join(root, 'indexes');
  await mkdir(vault, { recursive: true });
  await mkdir(indexDir, { recursive: true });
  roots.push(root);
  setVaultIndexDirectoryForTests(indexDir);
  return { vault, indexDir };
}

afterEach(async () => {
  setVaultIndexDirectoryForTests(null);
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('vault index', () => {
  it('builds markdown metadata and excludes reserved directories', async () => {
    const { vault } = await tempWorkspace();
    await mkdir(path.join(vault, 'Course', 'notes'), { recursive: true });
    await mkdir(path.join(vault, 'Course', 'materials'), { recursive: true });
    await mkdir(path.join(vault, '.obsidian'), { recursive: true });
    await mkdir(path.join(vault, '.classnotes', 'plugins'), { recursive: true });
    await mkdir(path.join(vault, 'Outputs'), { recursive: true });
    await writeFile(
      path.join(vault, 'Course', 'notes', 'Lecture.md'),
      `---\ntitle: Lecture One\ntags: [ml, ai]\nweek: 1\n---\n# Lecture\nTransformer body [[Paper One]]\n`,
      'utf-8'
    );
    await writeFile(path.join(vault, 'Course', 'materials', 'slides.pdf'), 'pdf', 'utf-8');
    await writeFile(path.join(vault, '.obsidian', 'Secret.md'), 'secret', 'utf-8');
    await writeFile(path.join(vault, '.classnotes', 'plugins', 'Plugin.md'), 'plugin', 'utf-8');
    await writeFile(path.join(vault, 'Outputs', 'Generated.md'), 'output', 'utf-8');

    const index = await rebuildVaultIndex(vault);
    const rels = index.files.map((file) => file.relPath);
    expect(rels).toContain('Course/notes/Lecture.md');
    expect(rels).toContain('Course/materials/slides.pdf');
    expect(rels).not.toContain('.obsidian/Secret.md');
    expect(rels).not.toContain('.classnotes/plugins/Plugin.md');
    expect(rels).not.toContain('Outputs/Generated.md');

    const lecture = index.files.find((file) => file.relPath === 'Course/notes/Lecture.md');
    expect(lecture).toMatchObject({
      kind: 'note',
      title: 'Lecture One',
      tags: ['ml', 'ai'],
      wikilinks: ['Paper One'],
    });
    expect(lecture?.frontmatter.week).toBe(1);
    expect(lecture?.searchText).toContain('Transformer body');
  });

  it('updates and removes single files incrementally', async () => {
    const { vault } = await tempWorkspace();
    const note = path.join(vault, 'Course', 'notes', 'Lecture.md');
    await mkdir(path.dirname(note), { recursive: true });
    await rebuildVaultIndex(vault);

    await writeFile(note, '---\ntitle: First\n---\nBody', 'utf-8');
    await updateVaultIndexFile(vault, note);
    expect((await getVaultIndex(vault)).files.find((file) => file.title === 'First')).toBeTruthy();

    await writeFile(note, '---\ntitle: Second\n---\nBody', 'utf-8');
    await updateVaultIndexFile(vault, note);
    const changed = (await getVaultIndex(vault)).files.find(
      (file) => file.relPath === 'Course/notes/Lecture.md'
    );
    expect(changed?.title).toBe('Second');

    await unlink(note);
    await removeVaultIndexFile(vault, note);
    expect(
      (await getVaultIndex(vault)).files.find((file) => file.relPath === 'Course/notes/Lecture.md')
    ).toBeUndefined();
  });

  it('rebuilds automatically when the cache JSON is corrupt', async () => {
    const { vault, indexDir } = await tempWorkspace();
    await mkdir(path.join(vault, 'Course', 'notes'), { recursive: true });
    await writeFile(path.join(vault, 'Course', 'notes', 'Lecture.md'), '# Body', 'utf-8');
    await rebuildVaultIndex(vault);
    const [cacheFile] = await readdir(indexDir);
    await writeFile(path.join(indexDir, cacheFile), '{not json', 'utf-8');

    const index = await getVaultIndex(vault);
    expect(index.files.map((file) => file.relPath)).toContain('Course/notes/Lecture.md');
  });
});
