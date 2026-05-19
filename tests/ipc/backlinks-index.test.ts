// @vitest-environment node
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getBacklinkSources, refreshFile, removeFile } from '../../electron/ipc/backlinks';
import { setVaultIndexDirectoryForTests } from '../../electron/vault-index';

const roots: string[] = [];

async function tempVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'classnotes-backlinks-'));
  roots.push(root);
  const vault = path.join(root, 'vault');
  const indexDir = path.join(root, 'indexes');
  await mkdir(path.join(vault, 'Course', 'notes'), { recursive: true });
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

describe('backlinks index regression', () => {
  it('derives backlinks from the vault index and updates incrementally', async () => {
    const vault = await tempVault();
    const note = path.join(vault, 'Course', 'notes', 'Lecture.md');
    await writeFile(note, '# Lecture\n[[Target Note]]\n', 'utf-8');

    expect(await getBacklinkSources(vault, 'Target Note')).toEqual([note]);

    await writeFile(note, '# Lecture\n[[Other Note]]\n', 'utf-8');
    await refreshFile(vault, note);
    expect(await getBacklinkSources(vault, 'Target Note')).toEqual([]);
    expect(await getBacklinkSources(vault, 'Other Note')).toEqual([note]);

    await unlink(note);
    await removeFile(vault, note);
    expect(await getBacklinkSources(vault, 'Other Note')).toEqual([]);
  });
});
