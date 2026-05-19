// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote, fileExists } from './_vault-harness';
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

vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn(),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));

vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ aiProvider: 'claude', aiAuthMode: 'apiKey' }),
  loadSelectedAiApiKey: vi.fn().mockResolvedValue('test-key'),
  selectedAiModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
}));

import { createEpistemicHandlers, registerEpistemicHandlers } from '../../electron/ipc/epistemic';
import { runPrompt } from '../../electron/ai/provider';
import { ipcMain } from 'electron';

const mockRunPrompt = vi.mocked(runPrompt);

let h: ReturnType<typeof createEpistemicHandlers>;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createEpistemicHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

// --------------------------------------------------------------------------
// Coverage targets for epistemic.ts:
//   - asStringArray: array branch with mixed types, string branch with comma/semicolon/newline
//   - asStatus: falsified status, undefined for unknown value
//   - titleFrom: h1 fallback, basename fallback
//   - extractWikilinks: wikilinks with aliases, sections, empty target
//   - shouldSkipDir: all skip dirs
//   - buildConsistencyReport: missing deps, stale contradictions, logic islands, missingStatus
//   - peerReview error path (runPrompt fails)
//   - mapIsomorphism error path (runPrompt fails)
//   - registerEpistemicHandlers
//   - collectMarkdownNotes: depth limit, non-md files, unreadable files
// --------------------------------------------------------------------------

describe('epistemic:checkConsistency – branch coverage via frontmatter variations', () => {
  it('reports notes with array dependencies including non-string values', async () => {
    await addSubject(root, 'Math');
    // Dependencies as an array with mixed types — exercises asStringArray array branch
    await writeNote(
      root,
      'Math',
      'with-deps.md',
      '---\ntitle: Array Deps\nepistemic_status: hypothesis\ndependencies:\n  - Claim A\n  - ""\n  - Claim B\n---\n\nBody text with [[Claim A]] link.'
    );
    await writeNote(
      root,
      'Math',
      'claim-a.md',
      '---\ntitle: Claim A\nepistemic_status: verified\n---\n\n# Claim A\n\nVerified claim.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    expect(result.noteCount).toBeGreaterThanOrEqual(2);
  });

  it('reports notes with string comma-separated dependencies', async () => {
    await addSubject(root, 'Physics');
    // Dependencies as a comma-separated string — exercises asStringArray string branch
    await writeNote(
      root,
      'Physics',
      'string-deps.md',
      '---\ntitle: String Deps\nepistemic_status: conjecture\ndependencies: "Dep A, Dep B"\n---\n\nSome body.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    // Should detect missing dependencies since Dep A and Dep B don't exist
    const report = await fs.readFile(result.filePath, 'utf-8');
    expect(report).toContain('未解決の依存関係');
  });

  it('handles falsified epistemic_status', async () => {
    await addSubject(root, 'Bio');
    // Exercises asStatus with 'falsified'
    await writeNote(
      root,
      'Bio',
      'falsified-note.md',
      '---\ntitle: Falsified Claim\nepistemic_status: falsified\ncontradicts:\n  - Some Other Claim\n---\n\nThis claim was disproved.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    expect(result.noteCount).toBeGreaterThanOrEqual(1);
  });

  it('handles note without title in frontmatter (h1 fallback)', async () => {
    await addSubject(root, 'Chem');
    // No title in frontmatter, has h1 heading — exercises titleFrom h1 branch
    await writeNote(
      root,
      'Chem',
      'no-title.md',
      '---\nepistemic_status: conjecture\n---\n\n# Organic Chemistry\n\nBody text.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    expect(result.noteCount).toBeGreaterThanOrEqual(1);
  });

  it('handles note without title or h1 (basename fallback)', async () => {
    await addSubject(root, 'Hist');
    // No title, no h1 — exercises titleFrom basename fallback
    await writeNote(
      root,
      'Hist',
      'untitled-note.md',
      '---\nepistemic_status: hypothesis\ndependencies:\n  - NonExistent\n---\n\nSome body without heading.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    // Should be a logic island since it has no wikilinks and dependency is missing
    const report = await fs.readFile(result.filePath, 'utf-8');
    expect(report).toContain('論理の孤島');
  });

  it('handles notes with wikilinks with aliases and sections', async () => {
    await addSubject(root, 'Lit');
    // Wikilinks with alias and section — exercises extractWikilinks fully
    await writeNote(
      root,
      'Lit',
      'linked.md',
      '---\ntitle: Linked Note\nepistemic_status: hypothesis\n---\n\nSee [[Target Page#section|alias]] and [[Another Page]] for details.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    expect(result.noteCount).toBeGreaterThanOrEqual(1);
  });

  it('detects stale contradictions (old mtime)', async () => {
    await addSubject(root, 'Phil');
    const filePath = await writeNote(
      root,
      'Phil',
      'stale.md',
      '---\ntitle: Stale Note\nepistemic_status: hypothesis\ncontradicts:\n  - Other Claim\n---\n\nContradictory content.'
    );

    // Set mtime to 60 days ago to trigger stale contradiction detection
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await fs.utimes(filePath, sixtyDaysAgo, sixtyDaysAgo);

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    const report = await fs.readFile(result.filePath, 'utf-8');
    expect(report).toContain('長期放置の矛盾');
  });

  it('skips directories like node_modules, .history, dist', async () => {
    // Create directories that should be skipped by shouldSkipDir
    await fs.mkdir(path.join(root, 'node_modules', 'notes'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'node_modules', 'notes', 'skip.md'),
      '---\ntitle: Should Skip\n---\n\nSkipped.'
    );
    await fs.mkdir(path.join(root, '.history', 'notes'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.history', 'notes', 'old.md'),
      '---\ntitle: Old\n---\n\nHistory.'
    );
    await addSubject(root, 'Art');
    await writeNote(root, 'Art', 'real.md', '---\ntitle: Real Note\n---\n\nReal content.');

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    // Only the Art note should be counted, not node_modules or .history
    expect(result.noteCount).toBe(1);
  });

  it('handles notes with no epistemic_status (missingStatus)', async () => {
    await addSubject(root, 'Econ');
    await writeNote(
      root,
      'Econ',
      'no-status.md',
      '---\ntitle: No Status Note\n---\n\nContent without epistemic status.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    const report = await fs.readFile(result.filePath, 'utf-8');
    expect(report).toContain('epistemic_status 未設定');
  });
});

describe('epistemic:peerReview – error path', () => {
  it('returns error when runPrompt fails', async () => {
    await addSubject(root, 'Sci');
    const filePath = await writeNote(
      root,
      'Sci',
      'review-target.md',
      '---\ntitle: Review Target\nepistemic_status: conjecture\n---\n\nContent to review.'
    );

    mockRunPrompt.mockResolvedValueOnce({
      ok: false,
      error: 'API rate limit exceeded',
      text: '',
    });

    const result = await h['epistemic:peerReview'](null, root, filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('API rate limit exceeded');
  });
});

describe('epistemic:mapIsomorphism – error path', () => {
  it('returns error when runPrompt fails', async () => {
    await addSubject(root, 'CompSci');
    const left = await writeNote(
      root,
      'CompSci',
      'left.md',
      '---\ntitle: Left Note\n---\n\n# Left\n\nContent A.'
    );
    const right = await writeNote(
      root,
      'CompSci',
      'right.md',
      '---\ntitle: Right Note\n---\n\n# Right\n\nContent B.'
    );

    mockRunPrompt.mockResolvedValueOnce({
      ok: false,
      error: 'Model unavailable',
      text: '',
    });

    const result = await h['epistemic:mapIsomorphism'](null, root, left, right);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Model unavailable');
  });
});

describe('registerEpistemicHandlers', () => {
  it('registers all epistemic channels with ipcMain', () => {
    registerEpistemicHandlers();
    const mockHandle = ipcMain.handle as ReturnType<typeof vi.fn>;
    const channels = mockHandle.mock.calls.map((c: any[]) => c[0]);
    expect(channels).toContain('epistemic:bootstrap');
    expect(channels).toContain('epistemic:peerReview');
    expect(channels).toContain('epistemic:mapIsomorphism');
    expect(channels).toContain('epistemic:checkConsistency');
  });
});
