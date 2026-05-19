// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, readFile, fileExists } from './_vault-harness';
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
  net: { request: vi.fn() },
}));

vi.mock('../../electron/ai/provider', () => ({ runPrompt: vi.fn(),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));
vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ aiProvider: 'claude', aiAuthMode: 'apiKey' }),
  loadSelectedAiApiKey: vi.fn().mockResolvedValue('test-key'),
  selectedAiModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
}));

import { createPapersHandlers } from '../../electron/ipc/papers';

type Handlers = ReturnType<typeof createPapersHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createPapersHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

/** Helper: write a paper markdown file into <vault>/Papers/<title>.md */
async function writePaper(
  title: string,
  meta: Record<string, unknown> = {}
): Promise<string> {
  const dir = path.join(root, 'Papers');
  await fs.mkdir(dir, { recursive: true });
  const fm: Record<string, unknown> = {
    title,
    type: 'paper',
    status: 'to-read',
    ...meta,
  };
  const frontmatter = Object.entries(fm)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (v === null) return `${k}: null`;
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join('\n');
  const filePath = path.join(dir, `${title}.md`);
  await fs.writeFile(
    filePath,
    `---\n${frontmatter}\n---\n\n# ${title}\n\nPaper notes.`,
    'utf-8'
  );
  return filePath;
}

// ---------------------------------------------------------------------------
// papers:list
// ---------------------------------------------------------------------------
describe('papers:list', () => {
  it('returns empty when Papers dir does not exist', async () => {
    const result = await h['papers:list'](null, root);
    expect(result).toEqual([]);
  });

  it('lists paper files', async () => {
    await writePaper('Paper A', { authors: ['Author A'], year: 2024 });
    await writePaper('Paper B', { authors: ['Author B'], year: 2023 });

    const result = await h['papers:list'](null, root);
    expect(result).toHaveLength(2);
    const titles = result.map((p) => p.meta.title);
    expect(titles).toEqual(expect.arrayContaining(['Paper A', 'Paper B']));
  });

  it('skips files starting with underscore', async () => {
    const dir = path.join(root, 'Papers');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, '_template.md'),
      '---\ntitle: Template\ntype: paper\n---\nTemplate',
      'utf-8'
    );
    await writePaper('Real Paper');

    const result = await h['papers:list'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].meta.title).toBe('Real Paper');
  });

  it('skips reading-note sidecar files', async () => {
    const dir = path.join(root, 'Papers');
    await fs.mkdir(dir, { recursive: true });
    await writePaper('MyPaper');
    await fs.writeFile(path.join(dir, 'MyPaper_reading.md'), 'Reading notes', 'utf-8');

    const result = await h['papers:list'](null, root);
    expect(result).toHaveLength(1);
  });

  it('sorts by most recently modified first', async () => {
    await writePaper('Older Paper');
    // Small delay so mtime differs
    await new Promise((r) => setTimeout(r, 50));
    await writePaper('Newer Paper');

    const result = await h['papers:list'](null, root);
    expect(result[0].meta.title).toBe('Newer Paper');
  });
});

// ---------------------------------------------------------------------------
// papers:create
// ---------------------------------------------------------------------------
describe('papers:create', () => {
  it('creates a paper with title and metadata', async () => {
    const result = await h['papers:create'](null, root, {
      title: 'Attention Is All You Need',
      authors: ['Vaswani', 'Shazeer'],
      year: 2017,
      doi: '10.5555/3295222.3295349',
      tags: ['transformers', 'nlp'],
      status: 'to-read',
    });
    expect(result.ok).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(await fileExists(result.filePath!)).toBe(true);

    const content = await readFile(result.filePath!);
    expect(content).toContain('Attention Is All You Need');
    expect(content).toContain('Vaswani');
    expect(content).toContain('to-read');
  });

  it('rejects empty title', async () => {
    const result = await h['papers:create'](null, root, { title: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects whitespace-only title', async () => {
    const result = await h['papers:create'](null, root, { title: '   ' });
    expect(result.ok).toBe(false);
  });

  it('prevents duplicate filenames', async () => {
    const r1 = await h['papers:create'](null, root, { title: 'Same Title' });
    expect(r1.ok).toBe(true);
    const r2 = await h['papers:create'](null, root, { title: 'Same Title' });
    expect(r2.ok).toBe(false);
    expect(r2.error).toBeDefined();
  });

  it('defaults status to to-read when not specified', async () => {
    const result = await h['papers:create'](null, root, { title: 'Default Status' });
    expect(result.ok).toBe(true);
    const content = await readFile(result.filePath!);
    expect(content).toContain('to-read');
  });
});

// ---------------------------------------------------------------------------
// papers:updateMeta
// ---------------------------------------------------------------------------
describe('papers:updateMeta', () => {
  it('updates paper metadata', async () => {
    const filePath = await writePaper('Update Me', { status: 'to-read' });

    const result = await h['papers:updateMeta'](null, filePath, { status: 'reading' });
    expect(result.ok).toBe(true);

    const content = await readFile(filePath);
    expect(content).toContain('reading');
  });

  it('preserves body when updating meta', async () => {
    const filePath = await writePaper('Body Preserved');

    await h['papers:updateMeta'](null, filePath, { year: 2025 });
    const content = await readFile(filePath);
    expect(content).toContain('# Body Preserved');
    expect(content).toContain('Paper notes.');
  });

  it('returns error for non-existent paper', async () => {
    const fakePath = path.join(root, 'Papers', 'ghost.md');
    const result = await h['papers:updateMeta'](null, fakePath, { status: 'read' });
    expect(result.ok).toBe(false);
  });

  it('returns error when no vault is active', async () => {
    setCurrentVaultPath(null);
    const result = await h['papers:updateMeta'](null, '/any/path.md', { status: 'read' });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// papers:delete
// ---------------------------------------------------------------------------
describe('papers:delete', () => {
  it('soft-deletes a paper file to .trash', async () => {
    const filePath = await writePaper('Delete Me');

    const result = await h['papers:delete'](null, filePath);
    expect(result.ok).toBe(true);
    expect(result.trashedTo).toBeDefined();
    expect(await fileExists(filePath)).toBe(false);
    expect(await fileExists(result.trashedTo)).toBe(true);
  });

  it('also moves reading sidecar to trash', async () => {
    const filePath = await writePaper('With Sidecar');
    const readingPath = filePath.replace(/\.md$/, '_reading.md');
    await fs.writeFile(readingPath, 'reading notes content', 'utf-8');

    const result = await h['papers:delete'](null, filePath);
    expect(result.ok).toBe(true);
    expect(await fileExists(filePath)).toBe(false);
    expect(await fileExists(readingPath)).toBe(false);
  });

  it('returns error for non-existent file', async () => {
    const fakePath = path.join(root, 'Papers', 'nonexistent.md');
    const result = await h['papers:delete'](null, fakePath);
    expect(result.ok).toBe(false);
  });

  it('returns error when no vault is active', async () => {
    setCurrentVaultPath(null);
    const result = await h['papers:delete'](null, '/any/path.md');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// papers:getReadingNote
// ---------------------------------------------------------------------------
describe('papers:getReadingNote', () => {
  it('returns empty content when reading note does not exist', async () => {
    const filePath = await writePaper('NoNote');

    const result = await h['papers:getReadingNote'](null, filePath);
    expect(result.content).toBe('');
    expect(result.notePath).toBeTruthy();
  });

  it('returns content when reading note exists', async () => {
    const filePath = await writePaper('HasNote');
    const readingPath = filePath.replace(/\.md$/, '_reading.md');
    await fs.writeFile(readingPath, 'Existing reading notes', 'utf-8');

    const result = await h['papers:getReadingNote'](null, filePath);
    expect(result.content).toBe('Existing reading notes');
  });

  it('returns empty when no vault is active', async () => {
    setCurrentVaultPath(null);
    const result = await h['papers:getReadingNote'](null, '/any/path.md');
    expect(result.content).toBe('');
  });
});

// ---------------------------------------------------------------------------
// papers:appendReadingNote
// ---------------------------------------------------------------------------
describe('papers:appendReadingNote', () => {
  it('appends text to reading note', async () => {
    const filePath = await writePaper('WithNote');

    const result = await h['papers:appendReadingNote'](null, filePath, 'Section 3 was insightful.');
    expect(result.ok).toBe(true);

    const readResult = await h['papers:getReadingNote'](null, filePath);
    expect(readResult.content).toContain('Section 3 was insightful.');
  });

  it('includes timestamp in appended block', async () => {
    const filePath = await writePaper('Timestamped');

    await h['papers:appendReadingNote'](null, filePath, 'test entry');
    const readResult = await h['papers:getReadingNote'](null, filePath);
    // Expect a YYYY-MM-DD HH:MM timestamp
    expect(readResult.content).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('appends multiple entries', async () => {
    const filePath = await writePaper('Multi');

    await h['papers:appendReadingNote'](null, filePath, 'Entry one');
    await h['papers:appendReadingNote'](null, filePath, 'Entry two');

    const readResult = await h['papers:getReadingNote'](null, filePath);
    expect(readResult.content).toContain('Entry one');
    expect(readResult.content).toContain('Entry two');
  });

  it('returns error when no vault is active', async () => {
    setCurrentVaultPath(null);
    const result = await h['papers:appendReadingNote'](null, '/any/path.md', 'text');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// papers:exportBibtex
// ---------------------------------------------------------------------------
describe('papers:exportBibtex', () => {
  it('generates BibTeX output for papers with bibkeys', async () => {
    await writePaper('Attention Paper', {
      bibkey: 'vaswani2017attention',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
      year: 2017,
      venue: 'NeurIPS',
    });

    const result = await h['papers:exportBibtex'](null, root);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.filePath).toContain('refs.bib');

    const bibContent = await readFile(result.filePath);
    expect(bibContent).toContain('vaswani2017attention');
    expect(bibContent).toContain('Ashish Vaswani');
    expect(bibContent).toContain('2017');
  });

  it('skips papers without bibkey', async () => {
    await writePaper('No Bibkey Paper', { year: 2024 });
    await writePaper('Has Bibkey', { bibkey: 'test2024key', year: 2024 });

    const result = await h['papers:exportBibtex'](null, root);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('returns error when Papers dir does not exist', async () => {
    const result = await h['papers:exportBibtex'](null, root);
    expect(result.ok).toBe(false);
  });

  it('returns error when no papers have bibkeys', async () => {
    await writePaper('No Key', { year: 2024 });

    const result = await h['papers:exportBibtex'](null, root);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(1);
  });

  it('infers inproceedings type for conference venues', async () => {
    await writePaper('Conference Paper', {
      bibkey: 'smith2024deep',
      authors: ['John Smith'],
      year: 2024,
      venue: 'NeurIPS 2024',
    });

    const result = await h['papers:exportBibtex'](null, root);
    expect(result.ok).toBe(true);

    const bibContent = await readFile(result.filePath);
    expect(bibContent).toContain('@inproceedings{smith2024deep');
    expect(bibContent).toContain('booktitle');
  });

  it('infers article type for journal venues', async () => {
    await writePaper('Journal Paper', {
      bibkey: 'doe2024review',
      authors: ['Jane Doe'],
      year: 2024,
      venue: 'Nature',
    });

    const result = await h['papers:exportBibtex'](null, root);
    expect(result.ok).toBe(true);

    const bibContent = await readFile(result.filePath);
    expect(bibContent).toContain('@article{doe2024review');
    expect(bibContent).toContain('journal');
  });
});

// ---------------------------------------------------------------------------
// papers:listForCitation
// ---------------------------------------------------------------------------
describe('papers:listForCitation', () => {
  it('returns empty when Papers dir does not exist', async () => {
    const result = await h['papers:listForCitation'](null, root);
    expect(result).toEqual([]);
  });

  it('lists only papers with bibkeys', async () => {
    await writePaper('Has Key', { bibkey: 'key2024', authors: ['Alice'], year: 2024 });
    await writePaper('No Key', { authors: ['Bob'], year: 2023 });

    const result = await h['papers:listForCitation'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].bibkey).toBe('key2024');
    expect(result[0].title).toBe('Has Key');
  });

  it('returns authors in short format with et al.', async () => {
    await writePaper('Many Authors', {
      bibkey: 'team2024big',
      authors: ['Alpha', 'Beta', 'Gamma'],
      year: 2024,
    });

    const result = await h['papers:listForCitation'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].authors).toContain('Alpha');
    expect(result[0].authors).toContain('Beta');
    expect(result[0].authors).toContain('et al.');
  });

  it('sorts by year descending', async () => {
    await writePaper('Old Paper', { bibkey: 'old2020', year: 2020 });
    await writePaper('New Paper', { bibkey: 'new2024', year: 2024 });

    const result = await h['papers:listForCitation'](null, root);
    expect(result[0].year).toBe(2024);
    expect(result[1].year).toBe(2020);
  });

  it('skips reading-note sidecar files', async () => {
    const dir = path.join(root, 'Papers');
    await fs.mkdir(dir, { recursive: true });
    await writePaper('CitePaper', { bibkey: 'cite2024', year: 2024 });
    await fs.writeFile(path.join(dir, 'CitePaper_reading.md'), 'notes', 'utf-8');

    const result = await h['papers:listForCitation'](null, root);
    expect(result).toHaveLength(1);
  });
});
