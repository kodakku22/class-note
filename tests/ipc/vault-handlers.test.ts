// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote, writeMaterial, readFile, fileExists } from './_vault-harness';
import { createVaultHandlers } from '../../electron/ipc/vault';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

type Handlers = ReturnType<typeof createVaultHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createVaultHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('vault:init', () => {
  it('creates ClassVault directory and .obsidian', async () => {
    const tmpDir = path.join(root, '..', 'init-test');
    await fs.mkdir(tmpDir, { recursive: true });
    const result = await h['vault:init'](null, tmpDir);
    expect(result.vaultPath).toContain('ClassVault');
    expect(await fileExists(result.vaultPath)).toBe(true);
    expect(await fileExists(path.join(result.vaultPath, '.obsidian'))).toBe(true);
  });
});

describe('vault:listSubjects', () => {
  it('returns sorted subjects excluding reserved and hidden dirs', async () => {
    await addSubject(root, '数学');
    await addSubject(root, '物理');
    await fs.mkdir(path.join(root, 'Books'), { recursive: true });
    await fs.mkdir(path.join(root, 'Memos'), { recursive: true });
    await fs.mkdir(path.join(root, '.hidden'), { recursive: true });

    const subjects = await h['vault:listSubjects'](null, root);
    expect(subjects).toEqual(['数学', '物理']);
  });

  it('returns empty array for nonexistent vault', async () => {
    const result = await h['vault:listSubjects'](null, '/nonexistent/path');
    expect(result).toEqual([]);
  });
});

describe('vault:createSubject', () => {
  it('creates subject with notes/materials/qa dirs and overview file', async () => {
    const result = await h['vault:createSubject'](null, root, '化学');
    expect(result).toEqual({ ok: true });
    expect(await fileExists(path.join(root, '化学', 'notes'))).toBe(true);
    expect(await fileExists(path.join(root, '化学', 'materials'))).toBe(true);
    expect(await fileExists(path.join(root, '化学', 'qa'))).toBe(true);
    const overview = await readFile(path.join(root, '化学', '_概要.md'));
    expect(overview).toContain('化学');
  });

  it('rejects empty name', async () => {
    const result = await h['vault:createSubject'](null, root, '   ');
    expect(result).toEqual({ ok: false, error: '科目名が空です' });
  });

  it('rejects duplicate subject', async () => {
    await addSubject(root, 'English');
    const result = await h['vault:createSubject'](null, root, 'English');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('すでに存在します');
  });

  it('sanitizes unsafe characters in name', async () => {
    const result = await h['vault:createSubject'](null, root, 'test<>name');
    expect(result.ok).toBe(true);
    expect(await fileExists(path.join(root, 'test__name', 'notes'))).toBe(true);
  });
});

describe('vault:listFiles', () => {
  it('returns notes and materials sorted by mtime descending', async () => {
    await addSubject(root, '数学');
    const n1 = await writeNote(root, '数学', 'first.md', '# First');
    await new Promise((r) => setTimeout(r, 20));
    const n2 = await writeNote(root, '数学', 'second.md', '# Second');
    await writeMaterial(root, '数学', 'doc.pdf', Buffer.from('fake-pdf'));

    const result = await h['vault:listFiles'](null, root, '数学');
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].name).toBe('second.md');
    expect(result.notes[1].name).toBe('first.md');
    expect(result.materials).toHaveLength(1);
    expect(result.materials[0].kind).toBe('pdf');
  });

  it('excludes dot files', async () => {
    await addSubject(root, '数学');
    await writeNote(root, '数学', '.hidden.md', '# Hidden');
    await writeNote(root, '数学', 'visible.md', '# Visible');

    const result = await h['vault:listFiles'](null, root, '数学');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].name).toBe('visible.md');
  });

  it('returns empty arrays for nonexistent subject dirs', async () => {
    await addSubject(root, '空の科目');
    await fs.rm(path.join(root, '空の科目', 'notes'), { recursive: true });
    await fs.rm(path.join(root, '空の科目', 'materials'), { recursive: true });
    const result = await h['vault:listFiles'](null, root, '空の科目');
    expect(result.notes).toEqual([]);
    expect(result.materials).toEqual([]);
  });
});

describe('vault:listFilesEnriched', () => {
  it('extracts frontmatter and body preview for notes', async () => {
    await addSubject(root, '数学');
    await writeNote(root, '数学', 'enriched.md', '---\ntitle: テスト\ntags: [math]\n---\n\n# テスト\n\nこれは本文です。');

    const result = await h['vault:listFilesEnriched'](null, root, '数学');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].meta).toEqual({ title: 'テスト', tags: ['math'] });
    expect(result.notes[0].preview).toContain('これは本文です');
  });

  it('handles corrupted frontmatter gracefully', async () => {
    await addSubject(root, '数学');
    await writeNote(root, '数学', 'broken.md', '---\n[invalid\n---\n\nBody');

    const result = await h['vault:listFilesEnriched'](null, root, '数学');
    expect(result.notes).toHaveLength(1);
    // meta should be an empty object when YAML parse produces non-object
    expect(result.notes[0].meta).toEqual({});
  });
});

describe('vault:readNote / readNoteWithMtime', () => {
  it('reads note content', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'read-test.md', '# Hello');
    const content = await h['vault:readNote'](null, fp);
    expect(content).toBe('# Hello');
  });

  it('reads note with mtime', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'mtime-test.md', '# Mtime');
    const result = await h['vault:readNoteWithMtime'](null, fp);
    expect(result.content).toBe('# Mtime');
    expect(typeof result.mtime).toBe('number');
    expect(result.mtime).toBeGreaterThan(0);
  });

  it('throws when no active vault', async () => {
    setCurrentVaultPath(null);
    await expect(h['vault:readNote'](null, '/some/path.md')).rejects.toThrow('no active vault');
  });

  it('throws for path outside vault', async () => {
    await expect(h['vault:readNote'](null, path.join(root, '..', '..', 'etc', 'passwd'))).rejects.toThrow('outside vault');
  });
});

describe('vault:writeNote', () => {
  it('writes note content and returns mtime', async () => {
    await addSubject(root, '数学');
    const fp = path.join(root, '数学', 'notes', 'new.md');
    const result = await h['vault:writeNote'](null, fp, '# New note');
    expect(result.ok).toBe(true);
    expect(typeof result.currentMtime).toBe('number');
    expect(await readFile(fp)).toBe('# New note');
  });

  it('detects mtime conflict', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'conflict.md', '# Original');
    const result = await h['vault:writeNote'](null, fp, '# Modified', 1);
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.currentContent).toBe('# Original');
  });

  it('skips conflict check when expectedMtime is undefined', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'no-conflict.md', '# Original');
    const result = await h['vault:writeNote'](null, fp, '# Overwritten');
    expect(result.ok).toBe(true);
    expect(await readFile(fp)).toBe('# Overwritten');
  });
});

describe('vault:createTodaysNote', () => {
  it('creates a daily note with template', async () => {
    await addSubject(root, '数学');
    const result = await h['vault:createTodaysNote'](null, root, '数学');
    expect(result.created).toBe(true);
    expect(result.filePath).toContain('notes');
    const content = await readFile(result.filePath);
    expect(content).toContain('数学');
  });

  it('is idempotent - returns existing note', async () => {
    await addSubject(root, '数学');
    const first = await h['vault:createTodaysNote'](null, root, '数学');
    expect(first.created).toBe(true);
    const second = await h['vault:createTodaysNote'](null, root, '数学');
    expect(second.created).toBe(false);
    expect(second.filePath).toBe(first.filePath);
  });
});

describe('vault:createTypedNote', () => {
  it('creates a typed note in subject notes dir', async () => {
    await addSubject(root, '数学');
    const result = await h['vault:createTypedNote'](null, root, '数学', 'lecture', 'Test Lecture', '# Default');
    expect(result.created).toBe(true);
    expect(result.filePath).toContain('notes');
  });

  it('creates memo in Memos dir when subject is null', async () => {
    const result = await h['vault:createTypedNote'](null, root, null, 'memo', 'Quick memo', '# Memo');
    expect(result.created).toBe(true);
    expect(result.filePath).toContain('Memos');
  });

  it('auto-increments filename on collision', async () => {
    await addSubject(root, '数学');
    const r1 = await h['vault:createTypedNote'](null, root, '数学', 'lecture', 'Same Title', 'body');
    const r2 = await h['vault:createTypedNote'](null, root, '数学', 'lecture', 'Same Title', 'body');
    expect(r1.filePath).not.toBe(r2.filePath);
    expect(r2.filePath).toContain('(1)');
  });
});

describe('vault:templates CRUD', () => {
  it('lists, writes, reads, and deletes templates', async () => {
    const list0 = await h['vault:listTemplates'](null, root);
    expect(list0).toEqual([]);

    await h['vault:writeTemplate'](null, root, 'lecture', '# {{title}}\nDate: {{date}}');
    const list1 = await h['vault:listTemplates'](null, root);
    expect(list1).toHaveLength(1);
    expect(list1[0].name).toBe('lecture');

    const content = await h['vault:readTemplate'](null, root, 'lecture');
    expect(content).toContain('{{title}}');

    const delResult = await h['vault:deleteTemplate'](null, root, 'lecture');
    expect(delResult.ok).toBe(true);

    const list2 = await h['vault:listTemplates'](null, root);
    expect(list2).toEqual([]);
  });

  it('rejects empty template name', async () => {
    const result = await h['vault:writeTemplate'](null, root, '   ', 'content');
    expect(result.ok).toBe(false);
  });

  it('returns empty string for nonexistent template', async () => {
    const content = await h['vault:readTemplate'](null, root, 'nonexistent');
    expect(content).toBe('');
  });
});

describe('vault:renameNote', () => {
  it('renames note and updates wikilinks', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'OldName.md', '# Old');
    await writeNote(root, '数学', 'Linker.md', 'See [[OldName]] for details');

    const result = await h['vault:renameNote'](null, root, fp, 'NewName');
    expect(result.ok).toBe(true);
    expect(result.newPath).toContain('NewName.md');
    expect(result.updatedFiles).toBeGreaterThanOrEqual(1);

    const linkerContent = await readFile(path.join(root, '数学', 'notes', 'Linker.md'));
    expect(linkerContent).toContain('[[NewName]]');
    expect(linkerContent).not.toContain('[[OldName]]');
  });

  it('rejects empty name', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'dummy.md', '# Dummy');
    const result = await h['vault:renameNote'](null, root, fp, '  ');
    expect(result.ok).toBe(false);
  });

  it('rejects rename to existing file', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'A.md', '# A');
    await writeNote(root, '数学', 'B.md', '# B');
    const result = await h['vault:renameNote'](null, root, fp, 'B');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('既に存在');
  });

  it('returns noop when renaming to same name', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'Same.md', '# Same');
    const result = await h['vault:renameNote'](null, root, fp, 'Same');
    expect(result.ok).toBe(true);
    expect(result.updatedFiles).toBe(0);
  });
});

describe('vault:deleteSubject', () => {
  it('soft-deletes subject to .trash', async () => {
    await addSubject(root, '削除対象');
    await writeNote(root, '削除対象', 'note.md', '# Note');

    const result = await h['vault:deleteSubject'](null, root, '削除対象');
    expect(result.ok).toBe(true);
    expect(result.trashedTo).toContain('.trash');
    expect(await fileExists(path.join(root, '削除対象'))).toBe(false);
    expect(await fileExists(result.trashedTo!)).toBe(true);
  });

  it('rejects deleting vault root', async () => {
    const result = await h['vault:deleteSubject'](null, root, '');
    expect(result.ok).toBe(false);
  });
});

describe('vault:deleteNote', () => {
  it('soft-deletes note preserving relative path', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'delete-me.md', '# Delete');

    const result = await h['vault:deleteNote'](null, fp);
    expect(result.ok).toBe(true);
    expect(result.trashedTo).toContain('.trash');
    expect(await fileExists(fp)).toBe(false);
  });

  it('returns error for nonexistent file', async () => {
    const result = await h['vault:deleteNote'](null, path.join(root, '数学', 'notes', 'nope.md'));
    expect(result.ok).toBe(false);
  });

  it('returns error when no vault set', async () => {
    setCurrentVaultPath(null);
    const result = await h['vault:deleteNote'](null, '/any/path.md');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no active vault');
  });
});

describe('vault:duplicateNote', () => {
  it('creates copy with (copy) suffix', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'original.md', '# Original');

    const result = await h['vault:duplicateNote'](null, fp);
    expect(result.ok).toBe(true);
    expect(result.newPath).toContain('(copy)');
    expect(await readFile(result.newPath!)).toBe('# Original');
  });

  it('increments copy number on repeated duplication', async () => {
    await addSubject(root, '数学');
    const fp = await writeNote(root, '数学', 'dup.md', '# Dup');

    const r1 = await h['vault:duplicateNote'](null, fp);
    expect(r1.newPath).toContain('(copy)');
    const r2 = await h['vault:duplicateNote'](null, fp);
    expect(r2.newPath).toContain('(copy 2)');
  });
});

describe('vault:renameSubject', () => {
  it('renames subject directory', async () => {
    await addSubject(root, 'OldSubject');
    const result = await h['vault:renameSubject'](null, root, 'OldSubject', 'NewSubject');
    expect(result.ok).toBe(true);
    expect(await fileExists(path.join(root, 'NewSubject'))).toBe(true);
    expect(await fileExists(path.join(root, 'OldSubject'))).toBe(false);
  });

  it('rejects rename to existing subject', async () => {
    await addSubject(root, 'A');
    await addSubject(root, 'B');
    const result = await h['vault:renameSubject'](null, root, 'A', 'B');
    expect(result.ok).toBe(false);
  });

  it('returns noop for same name', async () => {
    await addSubject(root, 'Same');
    const result = await h['vault:renameSubject'](null, root, 'Same', 'Same');
    expect(result.ok).toBe(true);
  });
});

describe('vault:board', () => {
  it('reads/writes board JSON', async () => {
    await addSubject(root, '数学');
    const board = { nodes: [{ id: '1' }], edges: [{ source: '1', target: '2' }] };
    await h['vault:writeBoard'](null, root, '数学', board);
    const result = await h['vault:readBoard'](null, root, '数学');
    expect(result.nodes).toEqual([{ id: '1' }]);
    expect(result.edges).toEqual([{ source: '1', target: '2' }]);
  });

  it('returns empty board for nonexistent file', async () => {
    await addSubject(root, '数学');
    const result = await h['vault:readBoard'](null, root, '数学');
    expect(result).toEqual({ nodes: [], edges: [] });
  });
});

describe('vault:graphData', () => {
  it('builds node/edge graph from wikilinks', async () => {
    await addSubject(root, '数学');
    await writeNote(root, '数学', 'A.md', '# A\n\nSee [[B]]');
    await writeNote(root, '数学', 'B.md', '# B\n\nSee [[A]]');

    const result = await h['vault:graphData'](null, root);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for nonexistent vault', async () => {
    const result = await h['vault:graphData'](null, '/nonexistent');
    expect(result).toEqual({ nodes: [], edges: [] });
  });
});

describe('vault:listDailyNotes', () => {
  it('lists daily notes across subjects', async () => {
    await addSubject(root, '数学');
    await addSubject(root, '物理');
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await writeNote(root, '数学', `${today}.md`, `# ${today} 数学`);

    const result = await h['vault:listDailyNotes'](null, root);
    expect(result.date).toBe(today);
    expect(result.entries.length).toBe(2);
    const mathEntry = result.entries.find((e: { subject: string }) => e.subject === '数学');
    expect(mathEntry?.exists).toBe(true);
    expect(mathEntry?.preview).toContain('数学');
  });

  it('accepts custom date override', async () => {
    await addSubject(root, '数学');
    await writeNote(root, '数学', '2024-01-15.md', '# Custom date');

    const result = await h['vault:listDailyNotes'](null, root, '2024-01-15');
    expect(result.date).toBe('2024-01-15');
  });
});

describe('vault:installSample', () => {
  it('creates sample notes and overviews', async () => {
    const result = await h['vault:installSample'](null, root);
    expect(result.ok).toBe(true);
    expect(result.created).toBeGreaterThan(0);
    expect(await fileExists(path.join(root, '論文ノート', 'notes'))).toBe(true);
    expect(await fileExists(path.join(root, '研究計画', 'notes'))).toBe(true);
    expect(await fileExists(path.join(root, '統計手法', 'notes'))).toBe(true);
  });

  it('is idempotent - skips existing files', async () => {
    await h['vault:installSample'](null, root);
    const result2 = await h['vault:installSample'](null, root);
    expect(result2.ok).toBe(true);
    expect(result2.created).toBe(0);
  });
});

describe('path traversal prevention', () => {
  it('rejects path traversal in listFiles', async () => {
    await expect(
      h['vault:listFiles'](null, root, '../../../etc')
    ).rejects.toThrow('outside vault');
  });

  it('rejects path traversal in readNote', async () => {
    await expect(
      h['vault:readNote'](null, path.join(root, '..', '..', 'etc', 'passwd'))
    ).rejects.toThrow('outside vault');
  });
});
