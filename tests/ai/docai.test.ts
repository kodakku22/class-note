// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock runPrompt before importing the agents.
vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn(),
}));

vi.mock('../../electron/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../electron/ipc/utils', () => ({
  sanitizeForPrompt: vi.fn((text: string) => text),
}));

import {
  contentGenerator,
  documentQA,
  multiDocAnalysis,
  smartSummary,
} from '../../electron/ai/docai';
import { runPrompt } from '../../electron/ai/provider';
import type { DocumentChunk } from '../../electron/ai/chunker';
import type { RetrievedChunk } from '../../electron/ai/context-retriever';

const mockRunPrompt = runPrompt as ReturnType<typeof vi.fn>;
const CTX = { provider: 'claude' as const, authMode: 'api-key' as const, apiKey: 'sk-test' };

function makeChunk(overrides: Partial<DocumentChunk> = {}): DocumentChunk {
  return {
    id: 'doc.md#section:A',
    source: 'doc.md',
    section: 'A',
    content: 'sample content body for chunk used in tests',
    pageNumber: 3,
    metadata: { title: 'doc', kind: 'pdf', tags: [] },
    ...overrides,
  };
}

function makeRetrieved(chunk?: Partial<DocumentChunk>): RetrievedChunk {
  return {
    chunk: makeChunk(chunk),
    score: 1.0,
    citationLabel: '[出典 1]',
  };
}

beforeEach(() => {
  mockRunPrompt.mockReset();
});

// ---------------------------------------------------------------------------
// documentQA
// ---------------------------------------------------------------------------

describe('documentQA', () => {
  it('returns a parsed answer with citations + follow-ups on well-formed output', async () => {
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        answer: 'The gradient descent updates parameters [出典 1].',
        citations: [{ id: 1, source: 'doc.md', section: 'A', excerpt: 'updates parameters' }],
        suggestedFollowUps: ['追問1', '追問2', '追問3'],
      }),
    });
    const out = await documentQA(CTX, {
      question: 'How does gradient descent work?',
      contextChunks: [makeRetrieved()],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toContain('gradient descent');
    expect(out.result.citations).toHaveLength(1);
    expect(out.result.citations[0].pageNumber).toBe(3); // backfilled from chunk
    expect(out.result.suggestedFollowUps).toHaveLength(3);
  });

  it('falls back to plain-text answer if model omits JSON', async () => {
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: 'Just a plain Markdown answer with no JSON wrapper.',
    });
    const out = await documentQA(CTX, {
      question: 'question?',
      contextChunks: [makeRetrieved()],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toMatch(/plain Markdown answer/);
    expect(out.result.citations).toHaveLength(1);
    expect(out.result.suggestedFollowUps).toEqual([]);
  });

  it('returns an error when the model call fails', async () => {
    mockRunPrompt.mockResolvedValueOnce({ ok: false, error: 'rate limit' });
    const out = await documentQA(CTX, {
      question: 'q',
      contextChunks: [makeRetrieved()],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe('rate limit');
  });

  it('returns error when both JSON parse fails and model output is empty', async () => {
    mockRunPrompt.mockResolvedValueOnce({ ok: true, text: '' });
    const out = await documentQA(CTX, {
      question: 'q',
      contextChunks: [makeRetrieved()],
    });
    expect(out.ok).toBe(false);
  });

  it('passes onEvent through to runPrompt for streaming', async () => {
    const onEvent = vi.fn();
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ answer: 'x', citations: [], suggestedFollowUps: [] }),
    });
    await documentQA(CTX, { question: 'q', contextChunks: [makeRetrieved()], onEvent });
    const callOpts = mockRunPrompt.mock.calls[0][1] as { onEvent: unknown };
    expect(callOpts.onEvent).toBe(onEvent);
  });
});

// ---------------------------------------------------------------------------
// smartSummary
// ---------------------------------------------------------------------------

describe('smartSummary', () => {
  it('returns structured key points + actions', async () => {
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        headline: '1 行要約',
        keyPoints: [
          {
            point: 'first point',
            citation: { id: 1, source: 'doc.md', section: 'A', excerpt: 'sample' },
            importance: 'critical',
          },
        ],
        structure: '- intro\n- body',
        actionItems: ['act 1', 'act 2', 'act 3'],
        suggestedQuestions: ['q1', 'q2', 'q3'],
      }),
    });
    const out = await smartSummary(CTX, { chunks: [makeChunk()], mode: 'keypoints', count: 1 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.headline).toBe('1 行要約');
    expect(out.result.keyPoints).toHaveLength(1);
    expect(out.result.keyPoints[0].importance).toBe('critical');
    expect(out.result.keyPoints[0].citation.pageNumber).toBe(3);
    expect(out.result.actionItems).toEqual(['act 1', 'act 2', 'act 3']);
    expect(out.result.suggestedQuestions).toEqual(['q1', 'q2', 'q3']);
  });

  it('defaults invalid importance to "important"', async () => {
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        headline: 'h',
        keyPoints: [
          {
            point: 'p',
            citation: { id: 1, source: 'doc.md', section: 'A', excerpt: '' },
            importance: 'bogus-value',
          },
        ],
      }),
    });
    const out = await smartSummary(CTX, { chunks: [makeChunk()], mode: 'keypoints' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.keyPoints[0].importance).toBe('important');
  });

  it('refuses to call AI when chunks are empty', async () => {
    const out = await smartSummary(CTX, { chunks: [], mode: 'keypoints' });
    expect(out.ok).toBe(false);
    expect(mockRunPrompt).not.toHaveBeenCalled();
  });

  it('returns error when AI output cannot be parsed', async () => {
    mockRunPrompt.mockResolvedValueOnce({ ok: true, text: 'not json' });
    const out = await smartSummary(CTX, { chunks: [makeChunk()], mode: 'one-liner' });
    expect(out.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// multiDocAnalysis
// ---------------------------------------------------------------------------

describe('multiDocAnalysis', () => {
  it('parses comparison + common + differences + synthesis', async () => {
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        comparison: [
          {
            aspect: '手法',
            documents: [
              {
                source: 'A.md',
                position: '勾配法',
                citation: { id: 1, source: 'A.md', section: 'Intro', excerpt: 'x' },
              },
            ],
          },
        ],
        commonPoints: ['学習率'],
        differences: ['初期化'],
        synthesis: 'まとめ',
      }),
    });
    const out = await multiDocAnalysis(CTX, {
      contextChunks: [makeRetrieved({ source: 'A.md' }), makeRetrieved({ source: 'B.md' })],
      mode: 'compare',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.comparison).toHaveLength(1);
    expect(out.result.commonPoints).toEqual(['学習率']);
    expect(out.result.differences).toEqual(['初期化']);
    expect(out.result.synthesis).toBe('まとめ');
  });

  it('refuses when context is empty', async () => {
    const out = await multiDocAnalysis(CTX, { contextChunks: [], mode: 'compare' });
    expect(out.ok).toBe(false);
    expect(mockRunPrompt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// contentGenerator
// ---------------------------------------------------------------------------

describe('contentGenerator', () => {
  it('returns content + format + word count', async () => {
    mockRunPrompt.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        content: 'Generated email body with several words.',
        citations: [{ id: 1, source: 'a.md', section: 'S', excerpt: 'src' }],
      }),
    });
    const out = await contentGenerator(CTX, {
      contextChunks: [makeRetrieved()],
      format: 'email',
      instruction: '送信用メールを作って',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.format).toBe('email');
    expect(out.result.content).toMatch(/Generated email/);
    expect(out.result.wordCount).toBeGreaterThan(0);
    expect(out.result.citations[0].source).toBe('a.md');
  });

  it('falls back to raw text if JSON missing', async () => {
    mockRunPrompt.mockResolvedValueOnce({ ok: true, text: 'plain reply text' });
    const out = await contentGenerator(CTX, {
      contextChunks: [makeRetrieved()],
      format: 'memo',
      instruction: 'メモ作って',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.content).toBe('plain reply text');
  });
});
