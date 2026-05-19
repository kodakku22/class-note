// @vitest-environment node
// Tests for uncovered branches in latex.ts: pandoc detection, user templates, author handling
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

const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
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
  // Default: pandoc not found
  mockExecFile.mockImplementation((cmd: string, args: string[], opts: unknown, cb?: Function) => {
    if (typeof cb === 'function') {
      cb(new Error('not found'), '', '');
    }
    return { stdin: { end: vi.fn() } };
  });
  h = createLatexHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('latex:detectPandoc', () => {
  it('returns ok:true when pandoc is found', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: unknown, cb?: Function) => {
      if ((cmd === 'where.exe' || cmd === 'which') && args[0] === 'pandoc') {
        cb?.(null, 'C:\\pandoc\\pandoc.exe\n', '');
      } else {
        cb?.(new Error('not found'), '', '');
      }
      return { stdin: { end: vi.fn() } };
    });

    const result = await h['latex:detectPandoc'](null);
    expect(result.ok).toBe(true);
    expect(result.path).toContain('pandoc');
  });

  it('prefers .exe path on windows', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: unknown, cb?: Function) => {
      if ((cmd === 'where.exe' || cmd === 'which') && args[0] === 'pandoc') {
        cb?.(null, 'C:\\pandoc\\pandoc.cmd\nC:\\pandoc\\pandoc.exe\n', '');
      } else {
        cb?.(new Error('not found'), '', '');
      }
      return { stdin: { end: vi.fn() } };
    });

    const result = await h['latex:detectPandoc'](null);
    expect(result.ok).toBe(true);
    expect(result.path).toContain('.exe');
  });
});

describe('latex:exportNote with pandoc', () => {
  it('uses pandoc when available', async () => {
    // Simulate pandoc found
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: unknown, cb?: Function) => {
      if ((cmd === 'where.exe' || cmd === 'which') && args?.[0] === 'pandoc') {
        cb?.(null, '/usr/bin/pandoc\n', '');
      } else if (cmd === '/usr/bin/pandoc') {
        // Pandoc conversion
        cb?.(null, '\\section{Hello}\n\nConverted content.\n', '');
      } else {
        cb?.(new Error('not found'), '', '');
      }
      return { stdin: { end: vi.fn() } };
    });

    await addSubject(root, 'Math');
    const md = '---\ntitle: Pandoc Test\n---\n\n# Hello\n\nContent.\n';
    const notePath = await writeNote(root, 'Math', 'pandoc-test.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);
    expect(result.usedPandoc).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('Converted content');
  });

  it('falls back to builtin when pandoc errors', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: unknown, cb?: Function) => {
      if ((cmd === 'where.exe' || cmd === 'which') && args?.[0] === 'pandoc') {
        cb?.(null, '/usr/bin/pandoc\n', '');
      } else if (cmd === '/usr/bin/pandoc') {
        cb?.(new Error('pandoc conversion failed'), '', '');
      } else {
        cb?.(new Error('not found'), '', '');
      }
      return { stdin: { end: vi.fn() } };
    });

    await addSubject(root, 'Math');
    const md = '---\ntitle: Fallback Test\n---\n\n# Heading\n\nBody text.\n';
    const notePath = await writeNote(root, 'Math', 'fallback.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);
    expect(result.usedPandoc).toBe(false);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('\\section{Heading}');
  });
});

describe('latex:exportNote author handling', () => {
  it('handles string author (not array)', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: Single Author\nauthors: Jane Doe\n---\n\n# Intro\n';
    const notePath = await writeNote(root, 'Math', 'single-author.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('Jane Doe');
  });

  it('handles no authors', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: No Author\n---\n\n# Body\n';
    const notePath = await writeNote(root, 'Math', 'no-author.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('\\author{}');
  });
});

describe('latex:exportNote user templates', () => {
  it('uses user-provided template when present', async () => {
    await addSubject(root, 'Math');
    const templateDir = path.join(root, '_templates', 'latex');
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(
      path.join(templateDir, 'generic.tex'),
      '\\documentclass{custom}\n\\begin{document}\n%%TITLE%%\n%%AUTHORS%%\n%%DATE%%\n%%CONTENT%%\n\\end{document}\n',
      'utf-8',
    );

    const md = '---\ntitle: Custom Template\n---\n\n# Custom\n\nUsing user template.\n';
    const notePath = await writeNote(root, 'Math', 'custom-tmpl.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('\\documentclass{custom}');
    expect(tex).toContain('Custom Template');
  });
});

describe('latex:exportNote with all styles', () => {
  it('exports with acl style', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: ACL Paper\n---\n\n# Method\n';
    const notePath = await writeNote(root, 'Math', 'acl.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'acl');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('\\usepackage{acl}');
  });

  it('exports with ieee style', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: IEEE Paper\n---\n\n# Abstract\n';
    const notePath = await writeNote(root, 'Math', 'ieee.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'ieee');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('IEEEtran');
  });
});

describe('latex:exportNote edge cases', () => {
  it('handles refs.bib copy failure gracefully', async () => {
    await addSubject(root, 'Math');
    const papersDir = path.join(root, 'Papers');
    await fs.mkdir(papersDir, { recursive: true });
    // Create a directory named refs.bib so copyFile will fail
    await fs.mkdir(path.join(papersDir, 'refs.bib'), { recursive: true });

    const md = '---\ntitle: Bib Fail\n---\n\n# Test\n';
    const notePath = await writeNote(root, 'Math', 'bib-fail.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    // Should still succeed — refs.bib copy failure is not fatal
    expect(result.ok).toBe(true);
  });

  it('escapes special chars in title', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: "Test {with} \\special chars"\n---\n\n# Body\n';
    const notePath = await writeNote(root, 'Math', 'special.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('\\title{');
  });

  it('converts markdown with mixed list types', async () => {
    await addSubject(root, 'Math');
    const md = '---\ntitle: Lists\n---\n\n- bullet 1\n- bullet 2\n\n1. num 1\n2. num 2\n';
    const notePath = await writeNote(root, 'Math', 'lists.md', md);

    const result = await h['latex:exportNote'](null, root, notePath, 'generic');
    expect(result.ok).toBe(true);

    const tex = await fs.readFile(result.texPath!, 'utf-8');
    expect(tex).toContain('\\begin{itemize}');
    expect(tex).toContain('\\begin{enumerate}');
  });
});
