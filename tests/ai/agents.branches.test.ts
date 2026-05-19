// @vitest-environment node
// --------------------------------------------------------------------------
// Coverage targets for electron/ipc/agents.ts:
//   - classifyKind: all branches (paper path, meta type=paper, type=lecture, default note)
//   - classifyLearningKind: all branches (requested overrides, path-based, meta-based)
//   - learningResultToMarkdown: full output formatting
//   - createAgentsHandlers: handler branches (no vault, file not found, summarize error, etc.)
//   - buildAgentContext: settings loading
//   - registerAgentsHandlers: ipcMain registration
// --------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

// Mock fs/promises
const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
  readdir: (...args: any[]) => mockReaddir(...args),
}));

// Mock path — use real path
vi.mock('path', async () => {
  return await vi.importActual('path');
});

// Mock IPC utils
const mockValidateVaultPath = vi.fn();
const mockGetCurrentVaultPath = vi.fn();
const mockAtomicWrite = vi.fn();
const mockExists = vi.fn();
vi.mock('../../electron/ipc/utils', () => ({
  validateVaultPath: (...args: any[]) => mockValidateVaultPath(...args),
  getCurrentVaultPath: () => mockGetCurrentVaultPath(),
  atomicWrite: (...args: any[]) => mockAtomicWrite(...args),
  exists: (...args: any[]) => mockExists(...args),
}));

// Mock frontmatter
const mockParseFrontmatter = vi.fn();
const mockStringifyFrontmatter = vi.fn();
vi.mock('../../electron/ipc/frontmatter', () => ({
  parseFrontmatter: (...args: any[]) => mockParseFrontmatter(...args),
  stringifyFrontmatter: (...args: any[]) => mockStringifyFrontmatter(...args),
}));

// Mock settings
const mockLoadSettings = vi.fn();
const mockLoadSelectedAiApiKey = vi.fn();
const mockSelectedAiModel = vi.fn();
vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: () => mockLoadSettings(),
  loadSelectedAiApiKey: (...args: any[]) => mockLoadSelectedAiApiKey(...args),
  selectedAiModel: (...args: any[]) => mockSelectedAiModel(...args),
}));

// Mock agents (the AI functions)
const mockSummarize = vi.fn();
const mockAutoTag = vi.fn();
const mockOptimizeMarkdown = vi.fn();
const mockLearningCoach = vi.fn();
const mockGenerateCanvas = vi.fn();
const mockAnalyzeVault = vi.fn();
vi.mock('../../electron/ai/agents', () => ({
  summarize: (...args: any[]) => mockSummarize(...args),
  autoTag: (...args: any[]) => mockAutoTag(...args),
  optimizeMarkdown: (...args: any[]) => mockOptimizeMarkdown(...args),
  learningCoach: (...args: any[]) => mockLearningCoach(...args),
  generateCanvas: (...args: any[]) => mockGenerateCanvas(...args),
  analyzeVault: (...args: any[]) => mockAnalyzeVault(...args),
}));

import {
  classifyLearningKind,
  createAgentsHandlers,
  registerAgentsHandlers,
} from '../../electron/ipc/agents';
import { ipcMain } from 'electron';

describe('classifyLearningKind', () => {
  it('returns requested kind when explicitly "book"', () => {
    expect(classifyLearningKind('/any/path', {}, 'book')).toBe('book');
  });

  it('returns requested kind when explicitly "paper"', () => {
    expect(classifyLearningKind('/any/path', {}, 'paper')).toBe('paper');
  });

  it('returns requested kind when explicitly "lecture"', () => {
    expect(classifyLearningKind('/any/path', {}, 'lecture')).toBe('lecture');
  });

  it('classifies as book from path containing Books (backslash)', () => {
    expect(classifyLearningKind('C:\\vault\\Books\\chapter1.md', {})).toBe('book');
  });

  it('classifies as book from path containing Books (forward slash)', () => {
    expect(classifyLearningKind('/vault/Books/chapter1.md', {})).toBe('book');
  });

  it('classifies as paper from path containing Papers (backslash)', () => {
    expect(classifyLearningKind('C:\\vault\\Papers\\study.md', {})).toBe('paper');
  });

  it('classifies as paper from path containing Papers (forward slash)', () => {
    expect(classifyLearningKind('/vault/Papers/study.md', {})).toBe('paper');
  });

  it('classifies as book from meta type', () => {
    expect(classifyLearningKind('/vault/notes/note.md', { type: 'book' })).toBe('book');
  });

  it('classifies as paper from meta type', () => {
    expect(classifyLearningKind('/vault/notes/note.md', { type: 'paper' })).toBe('paper');
  });

  it('defaults to lecture when no match', () => {
    expect(classifyLearningKind('/vault/notes/note.md', {})).toBe('lecture');
  });

  it('prefers path-based classification over meta when both match', () => {
    // Path says Books, meta says paper => path wins (Books check comes first)
    expect(classifyLearningKind('/vault/Books/note.md', { type: 'paper' })).toBe('book');
  });

  it('ignores non-matching requested kind and falls through', () => {
    // requested is not one of the valid kinds
    expect(classifyLearningKind('/vault/notes/note.md', {}, 'unknown')).toBe('lecture');
  });
});

describe('createAgentsHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockResolvedValue({ aiProvider: 'claude' });
    mockLoadSelectedAiApiKey.mockResolvedValue('test-key');
    mockSelectedAiModel.mockReturnValue('claude-3-opus');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'test body' });
    mockStringifyFrontmatter.mockReturnValue('---\n---\ntest body');
    mockAtomicWrite.mockResolvedValue(undefined);
  });

  it('returns an object with all expected handler keys', () => {
    const handlers = createAgentsHandlers();
    expect(handlers).toHaveProperty('ai:summarize');
    expect(handlers).toHaveProperty('ai:summarizeAndApply');
    expect(handlers).toHaveProperty('ai:autoTag');
    expect(handlers).toHaveProperty('ai:applyTags');
    expect(handlers).toHaveProperty('ai:optimizeMarkdown');
    expect(handlers).toHaveProperty('ai:generateCanvas');
    expect(handlers).toHaveProperty('ai:learningCoach');
    expect(handlers).toHaveProperty('ai:learningCoachAndSave');
    expect(handlers).toHaveProperty('ai:analyzeVault');
  });

  // --- ai:summarize ---

  it('ai:summarize returns error when no active vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarize'](null, '/path/to/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:summarize returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarize'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  it('ai:summarize calls summarize agent on success', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('---\ntitle: Test\n---\nbody');
    mockParseFrontmatter.mockReturnValue({ meta: { title: 'Test' }, body: 'body' });
    mockSummarize.mockResolvedValue({ ok: true, result: { oneLiner: 'Summary' } });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarize'](null, '/vault/file.md');
    expect(result).toEqual({ ok: true, result: { oneLiner: 'Summary' } });
    expect(mockSummarize).toHaveBeenCalled();
  });

  it('ai:summarize uses filename as title when meta.title is missing', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body' });
    mockSummarize.mockResolvedValue({ ok: true, result: {} });

    const handlers = createAgentsHandlers();
    await handlers['ai:summarize'](null, '/vault/my-note.md');
    // The title should be the filename without extension
    const callArgs = mockSummarize.mock.calls[0];
    expect(callArgs[1].title).toBe('my-note');
  });

  // --- ai:summarizeAndApply ---

  it('ai:summarizeAndApply returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarizeAndApply'](null, '/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:summarizeAndApply returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarizeAndApply'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  it('ai:summarizeAndApply returns error when summarize fails', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body' });
    mockSummarize.mockResolvedValue({ ok: false, error: 'AI failed' });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarizeAndApply'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'AI failed' });
  });

  it('ai:summarizeAndApply writes result to file on success', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body text' });
    mockSummarize.mockResolvedValue({
      ok: true,
      result: {
        oneLiner: 'Brief',
        overview: 'Overview text',
        contributions: ['C1'],
        openQuestions: ['Q1'],
      },
    });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:summarizeAndApply'](null, '/vault/file.md');
    expect(result.ok).toBe(true);
    expect(mockAtomicWrite).toHaveBeenCalled();
    expect(mockStringifyFrontmatter).toHaveBeenCalled();
    // Check that summary is added to meta
    const newMeta = mockStringifyFrontmatter.mock.calls[0][0];
    expect(newMeta.summary).toBe('Brief');
  });

  // --- ai:autoTag ---

  it('ai:autoTag returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:autoTag'](null, '/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:autoTag returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:autoTag'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  it('ai:autoTag extracts existing tags from meta', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: { tags: ['existing'] }, body: 'body' });
    mockAutoTag.mockResolvedValue({ ok: true, result: { tags: ['new'], reasoning: '' } });

    const handlers = createAgentsHandlers();
    await handlers['ai:autoTag'](null, '/vault/file.md');
    const callArgs = mockAutoTag.mock.calls[0];
    expect(callArgs[1].existingTags).toEqual(['existing']);
  });

  it('ai:autoTag uses empty array when meta.tags is not an array', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: { tags: 'not-array' }, body: 'body' });
    mockAutoTag.mockResolvedValue({ ok: true, result: { tags: ['new'], reasoning: '' } });

    const handlers = createAgentsHandlers();
    await handlers['ai:autoTag'](null, '/vault/file.md');
    const callArgs = mockAutoTag.mock.calls[0];
    expect(callArgs[1].existingTags).toEqual([]);
  });

  // --- ai:applyTags ---

  it('ai:applyTags returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:applyTags'](null, '/file.md', ['tag']);
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:applyTags returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:applyTags'](null, '/vault/file.md', ['tag']);
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  it('ai:applyTags merges new tags with existing', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: { tags: ['old'] }, body: 'body' });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:applyTags'](null, '/vault/file.md', ['new', 'old']);
    expect(result.ok).toBe(true);
    expect(result.tags).toEqual(['old', 'new']);
    expect(mockAtomicWrite).toHaveBeenCalled();
  });

  it('ai:applyTags filters non-string tags', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body' });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:applyTags'](null, '/vault/file.md', ['valid', 42 as any, null as any]);
    expect(result.ok).toBe(true);
    expect(result.tags).toEqual(['valid']);
  });

  // --- ai:optimizeMarkdown ---

  it('ai:optimizeMarkdown returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:optimizeMarkdown'](null, '/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:optimizeMarkdown returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:optimizeMarkdown'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  // --- ai:generateCanvas ---

  it('ai:generateCanvas returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:generateCanvas'](null, '/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:generateCanvas returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:generateCanvas'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  // --- ai:learningCoach ---

  it('ai:learningCoach returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoach'](null, '/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:learningCoach returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoach'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  it('ai:learningCoach passes requestedKind to classifyLearningKind', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body' });
    mockLearningCoach.mockResolvedValue({ ok: true, result: {} });

    const handlers = createAgentsHandlers();
    await handlers['ai:learningCoach'](null, '/vault/file.md', 'book');
    const callArgs = mockLearningCoach.mock.calls[0];
    expect(callArgs[1].kind).toBe('book');
  });

  // --- ai:learningCoachAndSave ---

  it('ai:learningCoachAndSave returns error when no vault', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoachAndSave'](null, '/file.md');
    expect(result).toEqual({ ok: false, error: 'no active vault' });
  });

  it('ai:learningCoachAndSave returns error when file not found', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(false);
    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoachAndSave'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'file not found' });
  });

  it('ai:learningCoachAndSave returns error when learningCoach fails', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body' });
    mockLearningCoach.mockResolvedValue({ ok: false, error: 'AI error' });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoachAndSave'](null, '/vault/file.md');
    expect(result).toEqual({ ok: false, error: 'AI error' });
  });

  it('ai:learningCoachAndSave writes result to file on success', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'existing body' });
    mockLearningCoach.mockResolvedValue({
      ok: true,
      result: {
        diagnosis: 'Diagnosis',
        keyConcepts: [{ term: 'A', explanation: 'B', confidence: 'high' }],
        misconceptions: ['M1'],
        quiz: [{ question: 'Q?', answer: 'A', difficulty: 'easy' }],
        nextActions: ['Do X'],
        suggestedNotes: [{ title: 'Note', reason: 'Reason' }],
      },
    });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoachAndSave'](null, '/vault/file.md', 'lecture');
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('lecture');
    expect(mockAtomicWrite).toHaveBeenCalled();
    // Verify the markdown block was generated
    const writtenBody = mockStringifyFrontmatter.mock.calls[0][1];
    expect(writtenBody).toContain('ai:learning:start');
    expect(writtenBody).toContain('AI理解支援');
    expect(writtenBody).toContain('Diagnosis');
    expect(writtenBody).toContain('**A**');
    expect(writtenBody).toContain('(high)');
    expect(writtenBody).toContain('Q?');
    expect(writtenBody).toContain('[[Note]]');
  });

  it('ai:learningCoachAndSave handles concepts without confidence', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockExists.mockResolvedValue(true);
    mockReadFile.mockResolvedValue('body');
    mockParseFrontmatter.mockReturnValue({ meta: {}, body: 'body' });
    mockLearningCoach.mockResolvedValue({
      ok: true,
      result: {
        diagnosis: 'D',
        keyConcepts: [{ term: 'T', explanation: 'E' }],
        misconceptions: [],
        quiz: [{ question: 'Q', answer: 'A' }],
        nextActions: [],
        suggestedNotes: [],
      },
    });

    const handlers = createAgentsHandlers();
    const result = await handlers['ai:learningCoachAndSave'](null, '/vault/file.md');
    expect(result.ok).toBe(true);
    const writtenBody = mockStringifyFrontmatter.mock.calls[0][1];
    // No confidence in parentheses
    expect(writtenBody).toContain('- **T**: E');
    expect(writtenBody).not.toContain('()');
    // No difficulty
    expect(writtenBody).toContain('1. Q');
    expect(writtenBody).not.toContain(' / ');
  });
});

describe('registerAgentsHandlers', () => {
  it('registers all handlers with ipcMain.handle', () => {
    registerAgentsHandlers();
    const mockHandle = ipcMain.handle as ReturnType<typeof vi.fn>;
    expect(mockHandle).toHaveBeenCalled();
    const channels = mockHandle.mock.calls.map((c: any[]) => c[0]);
    expect(channels).toContain('ai:summarize');
    expect(channels).toContain('ai:summarizeAndApply');
    expect(channels).toContain('ai:autoTag');
    expect(channels).toContain('ai:applyTags');
    expect(channels).toContain('ai:optimizeMarkdown');
    expect(channels).toContain('ai:generateCanvas');
    expect(channels).toContain('ai:learningCoach');
    expect(channels).toContain('ai:learningCoachAndSave');
    expect(channels).toContain('ai:analyzeVault');
  });
});
