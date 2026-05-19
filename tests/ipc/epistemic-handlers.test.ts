// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote, readFile, fileExists } from './_vault-harness';
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

import { createEpistemicHandlers } from '../../electron/ipc/epistemic';
import { runPrompt } from '../../electron/ai/provider';

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

describe('epistemic:bootstrap', () => {
  it('creates epistemic directory structure', async () => {
    const result = await h['epistemic:bootstrap'](null, root);
    expect(result.ok).toBe(true);
    expect(result.created).toBeDefined();
    expect(result.created.length).toBeGreaterThan(0);
    // Verify directories were created
    expect(await fileExists(path.join(root, 'raw'))).toBe(true);
    expect(await fileExists(path.join(root, 'questions'))).toBe(true);
    expect(await fileExists(path.join(root, 'Wiki'))).toBe(true);
    expect(await fileExists(path.join(root, 'Outputs'))).toBe(true);
  });

  it('creates CLAUDE.md', async () => {
    const result = await h['epistemic:bootstrap'](null, root);
    expect(result.claudePath).toContain('CLAUDE.md');
    expect(await fileExists(result.claudePath)).toBe(true);
  });

  it('is idempotent', async () => {
    await h['epistemic:bootstrap'](null, root);
    const result2 = await h['epistemic:bootstrap'](null, root);
    expect(result2.ok).toBe(true);
    // Second run should create fewer (or zero) new directories
    expect(result2.created.length).toBe(0);
  });
});

describe('epistemic:peerReview', () => {
  it('generates peer review for a note', async () => {
    await addSubject(root, 'Physics');
    const filePath = await writeNote(root, 'Physics', 'quantum.md',
      '---\ntitle: Quantum Mechanics\nepistemic_status: conjecture\n---\n\n# Quantum Mechanics\n\nQuantum entanglement is a physical phenomenon.'
    );

    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        verdict: 'conjecture',
        confidence: 0.7,
        issues: ['Needs more citations'],
        suggestions: ['Add references'],
      }),
    });

    const result = await h['epistemic:peerReview'](null, root, filePath);
    expect(result.ok).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(mockRunPrompt).toHaveBeenCalledOnce();
  });

  it('returns error for non-existent file', async () => {
    const fakePath = path.join(root, 'nonexistent.md');
    await expect(h['epistemic:peerReview'](null, root, fakePath)).rejects.toThrow();
  });
});

describe('epistemic:mapIsomorphism', () => {
  it('maps isomorphisms between two notes', async () => {
    await addSubject(root, 'Math');
    await addSubject(root, 'Physics');
    const left = await writeNote(root, 'Math', 'groups.md',
      '---\ntitle: Group Theory\n---\n\n# Group Theory\n\nA group is a set with an operation.'
    );
    const right = await writeNote(root, 'Physics', 'symmetry.md',
      '---\ntitle: Symmetry\n---\n\n# Symmetry\n\nSymmetry groups in physics.'
    );

    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        mappings: [
          { left: 'group operation', right: 'symmetry transformation', explanation: 'Both represent transformations' },
        ],
      }),
    });

    const result = await h['epistemic:mapIsomorphism'](null, root, left, right);
    expect(result.ok).toBe(true);
    expect(mockRunPrompt).toHaveBeenCalledOnce();
  });
});

describe('epistemic:checkConsistency', () => {
  it('checks consistency across notes', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'claim1.md',
      '---\ntitle: Claim 1\nepistemic_status: hypothesis\n---\n\nAll primes are odd.'
    );
    await writeNote(root, 'Math', 'claim2.md',
      '---\ntitle: Claim 2\nepistemic_status: verified\n---\n\n2 is a prime number and it is even.'
    );

    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result.ok).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(result.noteCount).toBeGreaterThanOrEqual(2);
  });

  it('handles empty vault', async () => {
    const result = await h['epistemic:checkConsistency'](null, root);
    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
    expect(result.noteCount).toBe(0);
  });
});
