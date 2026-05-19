// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { queryVaultSearch } from '../../electron/ipc/search';
import { setVaultIndexDirectoryForTests } from '../../electron/vault-index';

const roots: string[] = [];

async function tempVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'classnotes-search-'));
  roots.push(root);
  const vault = path.join(root, 'vault');
  const indexDir = path.join(root, 'indexes');
  await mkdir(path.join(vault, 'Course', 'notes'), { recursive: true });
  await mkdir(path.join(vault, 'Course', 'materials'), { recursive: true });
  await mkdir(indexDir, { recursive: true });
  setVaultIndexDirectoryForTests(indexDir);
  return vault;
}

afterEach(async () => {
  setVaultIndexDirectoryForTests(null);
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('search index regression', () => {
  it('matches filename, body, tags, and frontmatter through the vault index', async () => {
    const vault = await tempVault();
    await writeFile(
      path.join(vault, 'Course', 'notes', 'Lecture.md'),
      `---\ntitle: Week One\ntags: [ml, systems]\nprofessor: Ada\n---\nThis body mentions attention and caches.\n`,
      'utf-8'
    );
    await writeFile(path.join(vault, 'Course', 'materials', 'Syllabus.pdf'), 'pdf', 'utf-8');

    await expect(queryVaultSearch(vault, 'Syllabus')).resolves.toMatchObject([
      { matchType: 'filename', fileName: 'Syllabus.pdf' },
    ]);
    await expect(queryVaultSearch(vault, 'attention')).resolves.toMatchObject([
      { matchType: 'body', fileName: 'Lecture.md' },
    ]);
    await expect(queryVaultSearch(vault, 'Ada')).resolves.toMatchObject([
      { matchType: 'frontmatter', snippet: 'professor: Ada' },
    ]);
    await expect(queryVaultSearch(vault, '#ml')).resolves.toMatchObject([
      { matchType: 'tag', matchedTag: 'ml' },
    ]);
  });
});
