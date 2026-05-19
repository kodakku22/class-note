// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote, readFile } from './_vault-harness';
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

const mockSummarize = vi.fn();
const mockAutoTag = vi.fn();
const mockOptimizeMarkdown = vi.fn();
const mockLearningCoach = vi.fn();
const mockGenerateCanvas = vi.fn();
const mockAnalyzeVault = vi.fn();

vi.mock('../../electron/ai/agents', () => ({
  summarize: (...args: unknown[]) => mockSummarize(...args),
  autoTag: (...args: unknown[]) => mockAutoTag(...args),
  optimizeMarkdown: (...args: unknown[]) => mockOptimizeMarkdown(...args),
  learningCoach: (...args: unknown[]) => mockLearningCoach(...args),
  generateCanvas: (...args: unknown[]) => mockGenerateCanvas(...args),
  analyzeVault: (...args: unknown[]) => mockAnalyzeVault(...args),
}));

import { createAgentsHandlers } from '../../electron/ipc/agents';

let h: ReturnType<typeof createAgentsHandlers>;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createAgentsHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('ai:summarize', () => {
  it('summarizes a note file', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'calculus.md',
      '---\ntitle: Calculus\n---\n\n# Calculus\n\nIntegration and differentiation.'
    );

    mockSummarize.mockResolvedValueOnce({
      ok: true,
      summary: 'A summary of calculus concepts.',
      keyContributions: ['Integration'],
      openQuestions: [],
    });

    const result = await h['ai:summarize'](null, filePath);
    expect(result.ok).toBe(true);
    expect(mockSummarize).toHaveBeenCalledOnce();
  });

  it('returns error when AI fails', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'test.md', '# Test\n\nContent.');

    mockSummarize.mockResolvedValueOnce({
      ok: false,
      error: 'API error',
    });

    const result = await h['ai:summarize'](null, filePath);
    expect(result.ok).toBe(false);
  });

  it('returns error when no active vault', async () => {
    setCurrentVaultPath(null);
    const result = await h['ai:summarize'](null, '/nonexistent.md');
    expect(result.ok).toBe(false);
  });
});

describe('ai:summarizeAndApply', () => {
  it('summarizes and writes summary to note', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'apply.md',
      '---\ntitle: Apply Test\n---\n\n# Apply Test\n\nSome content for summarization.'
    );

    mockSummarize.mockResolvedValueOnce({
      ok: true,
      result: {
        oneLiner: 'Generated summary text.',
        contributions: ['Contribution 1'],
        openQuestions: ['Question 1'],
      },
    });

    const result = await h['ai:summarizeAndApply'](null, filePath);
    expect(result.ok).toBe(true);

    const content = await readFile(filePath);
    expect(content).toContain('summary');
  });
});

describe('ai:autoTag', () => {
  it('suggests tags for a note', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'tags.md',
      '---\ntitle: Tagging\ntags: []\n---\n\n# Linear Algebra\n\nMatrix operations and vector spaces.'
    );

    mockAutoTag.mockResolvedValueOnce({
      ok: true,
      tags: ['linear-algebra', 'matrices', 'vectors'],
    });

    const result = await h['ai:autoTag'](null, filePath);
    expect(result.ok).toBe(true);
    expect(result.tags).toBeDefined();
    expect(Array.isArray(result.tags)).toBe(true);
  });
});

describe('ai:applyTags', () => {
  it('writes tags to note frontmatter', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'apply-tags.md',
      '---\ntitle: Apply Tags\ntags: []\n---\n\n# Content'
    );

    const result = await h['ai:applyTags'](null, filePath, ['tag1', 'tag2']);
    expect(result.ok).toBe(true);

    const content = await readFile(filePath);
    expect(content).toContain('tag1');
    expect(content).toContain('tag2');
  });
});

describe('ai:optimizeMarkdown', () => {
  it('optimizes markdown formatting', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'optimize.md',
      '---\ntitle: Optimize\n---\n\n# Badly formatted\n\nSome text  with  extra  spaces.'
    );

    mockOptimizeMarkdown.mockResolvedValueOnce({
      ok: true,
      optimized: '# Well formatted\n\nSome text with proper spacing.',
    });

    const result = await h['ai:optimizeMarkdown'](null, filePath);
    expect(result.ok).toBe(true);
    expect(mockOptimizeMarkdown).toHaveBeenCalledOnce();
  });
});

describe('ai:generateCanvas', () => {
  it('generates a canvas from note', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'canvas.md',
      '---\ntitle: Canvas Test\n---\n\n# Topics\n\n- Topic A\n- Topic B\n- Topic C'
    );

    mockGenerateCanvas.mockResolvedValueOnce({
      ok: true,
      canvas: { nodes: [], edges: [] },
    });

    const result = await h['ai:generateCanvas'](null, filePath);
    expect(result.ok).toBe(true);
    expect(mockGenerateCanvas).toHaveBeenCalledOnce();
  });
});

describe('ai:learningCoach', () => {
  it('generates learning suggestions', async () => {
    await addSubject(root, 'Math');
    const filePath = await writeNote(root, 'Math', 'learn.md',
      '---\ntitle: Learning\n---\n\n# Probability\n\nBayes theorem explanation.'
    );

    mockLearningCoach.mockResolvedValueOnce({
      ok: true,
      exercises: ['Exercise 1'],
      questions: ['Question 1'],
      keyTerms: ['Bayes'],
    });

    const result = await h['ai:learningCoach'](null, filePath, 'exercise');
    expect(result.ok).toBe(true);
  });
});

describe('ai:analyzeVault', () => {
  it('analyzes vault structure', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'note1.md', '---\ntitle: Note 1\n---\n\n# Note 1');
    await addSubject(root, 'Physics');
    await writeNote(root, 'Physics', 'note2.md', '---\ntitle: Note 2\n---\n\n# Note 2');

    mockAnalyzeVault.mockResolvedValueOnce({
      ok: true,
      analysis: 'Vault analysis: 2 subjects, well organized.',
    });

    const result = await h['ai:analyzeVault'](null, root);
    expect(result.ok).toBe(true);
    expect(mockAnalyzeVault).toHaveBeenCalledOnce();
  });
});
