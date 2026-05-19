// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetFileAccessGrantsForTests,
  consumeFileAccessGrant,
  createFileAccessGrant,
} from '../../electron/ipc/file-access';

const roots: string[] = [];

async function tempFile(name: string, content = 'data'): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'classnotes-grant-'));
  roots.push(root);
  const file = path.join(root, name);
  await writeFile(file, content, 'utf-8');
  return file;
}

beforeEach(() => {
  __resetFileAccessGrantsForTests();
});

afterEach(async () => {
  __resetFileAccessGrantsForTests();
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('FileAccessGrant registry', () => {
  it('rejects missing tokens', async () => {
    await expect(consumeFileAccessGrant('missing', 'paper-pdf', 1)).rejects.toThrow(/invalid/i);
  });

  it('rejects expired grants', async () => {
    const file = await tempFile('paper.pdf');
    const grant = await createFileAccessGrant(file, 'paper-pdf', 1, -1);
    await expect(consumeFileAccessGrant(grant.token, 'paper-pdf', 1)).rejects.toThrow(/expired/i);
  });

  it('rejects purpose mismatches', async () => {
    const file = await tempFile('paper.pdf');
    const grant = await createFileAccessGrant(file, 'paper-pdf', 1);
    await expect(consumeFileAccessGrant(grant.token, 'paper-bibtex', 1)).rejects.toThrow(
      /purpose/i
    );
  });

  it('rejects sender mismatches', async () => {
    const file = await tempFile('paper.pdf');
    const grant = await createFileAccessGrant(file, 'paper-pdf', 1);
    await expect(consumeFileAccessGrant(grant.token, 'paper-pdf', 2)).rejects.toThrow(/sender/i);
  });

  it('allows a grant to be used only once', async () => {
    const file = await tempFile('paper.pdf');
    const grant = await createFileAccessGrant(file, 'paper-pdf', 1);
    await expect(consumeFileAccessGrant(grant.token, 'paper-pdf', 1)).resolves.toBe(file);
    await expect(consumeFileAccessGrant(grant.token, 'paper-pdf', 1)).rejects.toThrow(/invalid/i);
  });

  it('separates PDF and BibTeX picker purposes', async () => {
    const pdf = await tempFile('paper.pdf');
    const bib = await tempFile('refs.bib');
    const pdfGrant = await createFileAccessGrant(pdf, 'paper-pdf', 1);
    const bibGrant = await createFileAccessGrant(bib, 'paper-bibtex', 1);

    await expect(consumeFileAccessGrant(pdfGrant.token, 'paper-pdf', 1)).resolves.toBe(pdf);
    await expect(consumeFileAccessGrant(bibGrant.token, 'paper-bibtex', 1)).resolves.toBe(bib);
  });
});
