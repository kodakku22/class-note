// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

// Mock child_process execFile so we don't need real pandoc
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: unknown, cb?: Function) => {
    // If it's a "where" / "which" call for pandoc detection, simulate not found
    if (typeof cmd === 'string' && (cmd === 'where.exe' || cmd === 'which')) {
      if (typeof cb === 'function') {
        cb(new Error('not found'), '', '');
      }
      return { stdin: null };
    }
    // Default: not found
    if (typeof cb === 'function') {
      cb(new Error('not found'), '', '');
    }
    return { stdin: { end: vi.fn() } };
  }),
}));

import { createLatexHandlers } from '../../electron/ipc/latex';

type Handlers = ReturnType<typeof createLatexHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createLatexHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('latex:listStyles', () => {
  it('returns all available style names', async () => {
    const styles = await h['latex:listStyles'](null);
    expect(styles).toEqual(['neurips', 'acl', 'ieee', 'generic']);
  });
});

describe('latex:detectPandoc', () => {
  it('returns ok:false when pandoc is not installed', async () => {
    const result = await h['latex:detectPandoc'](null);
    expect(result.ok).toBe(false);
  });
});

describe('latex:exportNote', () => {
  it('returns error when file does not exist', async () => {
    const fakePath = path.join(root, 'Math', 'notes', 'nonexistent.md');
    const result = await h['latex:exportNote'](null, root, fakePath, 'generic');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ファイルが見つかりません');
  });

  it('returns error for invalid style', async () => {
    await addSubject(root, 'Math');
    const notePath = await writeNote(root, 'Math', 'test.md', '---\ntitle: Test\n---\n\n# Test\n\nHello world.');

    const result = await h['latex:exportNote'](null, root, notePath, 'invalid-style' as never);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('未対応のスタイルです');
  });

  it('exports a note to LaTeX using the fallback converter', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: My Paper\nauthors:\n  - Alice\n  - Bob\n---\n\n# Introduction\n\nThis is a test note with **bold** and *italic*.\n';
    const notePath = await writeNote(root, 'Math', 'paper.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);
    expect(result.usedPandoc).toBe(false);
    expect(result.outputDir).toBeDefined();
    expect(result.texPath).toBeDefined();

    // Verify the .tex file was created
    const texContent = await fs.readFile(result.texPath!, 'utf-8');
    expect(texContent).toContain('\\documentclass{article}');
    expect(texContent).toContain('\\title{My Paper}');
    expect(texContent).toContain('Alice, Bob');
    expect(texContent).toContain('\\section{Introduction}');
    expect(texContent).toContain('\\textbf{bold}');
    expect(texContent).toContain('\\textit{italic}');
    expect(texContent).toContain('\\begin{document}');
    expect(texContent).toContain('\\end{document}');
  });

  it('exports with neurips style', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: NeurIPS Paper\n---\n\n# Method\n\nContent here.\n';
    const notePath = await writeNote(root, 'Math', 'neurips.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'neurips');
    expect(result.ok).toBe(true);

    const texContent = await fs.readFile(result.texPath!, 'utf-8');
    expect(texContent).toContain('neurips_2024');
  });

  it('creates README.md in output directory', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: Test\n---\n\n# Hello\n';
    const notePath = await writeNote(root, 'Math', 'readme-test.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const readmePath = path.join(result.outputDir!, 'README.md');
    const readme = await fs.readFile(readmePath, 'utf-8');
    expect(readme).toContain('pdflatex main.tex');
    expect(readme).toContain('built-in fallback');
  });

  it('copies refs.bib when present in Papers directory', async () => {
    await addSubject(root, 'Math');
    const papersDir = path.join(root, 'Papers');
    await fs.mkdir(papersDir, { recursive: true });
    await fs.writeFile(path.join(papersDir, 'refs.bib'), '@article{test, title={Test}}');

    const md = '---\ntitle: With Refs\n---\n\n# Intro\n\nSee [@test].\n';
    const notePath = await writeNote(root, 'Math', 'with-refs.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const copiedBib = path.join(result.outputDir!, 'refs.bib');
    const bibContent = await fs.readFile(copiedBib, 'utf-8');
    expect(bibContent).toContain('@article{test');
  });

  it('uses title from frontmatter when available', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: Custom Title\n---\n\nBody text.\n';
    const notePath = await writeNote(root, 'Math', 'titled.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const texContent = await fs.readFile(result.texPath!, 'utf-8');
    expect(texContent).toContain('\\title{Custom Title}');
  });

  it('falls back to filename when no title in frontmatter', async () => {
    await addSubject(root, 'Math');
    const md = '# Just a heading\n\nNo frontmatter.\n';
    const notePath = await writeNote(root, 'Math', 'notitle.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const texContent = await fs.readFile(result.texPath!, 'utf-8');
    expect(texContent).toContain('\\title{notitle}');
  });
});
