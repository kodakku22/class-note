// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock runPrompt before importing agents
vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn(),
}));

vi.mock('../../electron/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../electron/ipc/utils', () => ({
  sanitizeForPrompt: vi.fn((text: string, _max: number) => text),
}));

import {
  extractJSON,
  summarize,
  autoTag,
  optimizeMarkdown,
  learningCoach,
  generateCanvas,
  analyzeVault,
} from '../../electron/ai/agents';
import { runPrompt } from '../../electron/ai/provider';

const mockRunPrompt = runPrompt as ReturnType<typeof vi.fn>;

const CTX = { provider: 'anthropic' as const, apiKey: 'test-key' };

// --------------------------------------------------------------------------
// extractJSON
// --------------------------------------------------------------------------

describe('extractJSON', () => {
  it('parses bare JSON', () => {
    expect(extractJSON<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside ```json fences', () => {
    expect(extractJSON<{ x: number }>('```json\n{"x": 2}\n```')).toEqual({ x: 2 });
  });

  it('parses JSON inside generic ``` fences (no json label)', () => {
    expect(extractJSON<{ ok: boolean }>('```\n{"ok": true}\n```')).toEqual({ ok: true });
  });

  it('strips leading/trailing prose', () => {
    const text = 'Here is the result:\n\n{"answer": 42}\n\nHope this helps!';
    expect(extractJSON<{ answer: number }>(text)).toEqual({ answer: 42 });
  });

  it('returns null for empty string', () => {
    expect(extractJSON('')).toBeNull();
  });

  it('returns null when no braces exist', () => {
    expect(extractJSON('hello world')).toBeNull();
  });

  it('returns null for malformed JSON between braces', () => {
    expect(extractJSON('{not valid json}')).toBeNull();
  });

  it('returns null when } appears before {', () => {
    expect(extractJSON('} text {')).toBeNull();
  });

  it('handles nested objects', () => {
    const text = '```json\n{"a": {"b": [1, 2]}}\n```';
    expect(extractJSON<{ a: { b: number[] } }>(text)).toEqual({ a: { b: [1, 2] } });
  });
});

// --------------------------------------------------------------------------
// summarize
// --------------------------------------------------------------------------

describe('summarize', () => {
  beforeEach(() => {
    mockRunPrompt.mockReset();
  });

  it('returns structured summary on success', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'A brief summary',
        overview: 'Overview text',
        contributions: ['C1', 'C2'],
        openQuestions: ['Q1'],
      }),
    });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.oneLiner).toBe('A brief summary');
      expect(r.result.contributions).toEqual(['C1', 'C2']);
      expect(r.result.openQuestions).toEqual(['Q1']);
    }
  });

  it('returns error when provider fails', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'Provider down' });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Provider down');
  });

  it('returns error on malformed output (missing oneLiner)', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ overview: 'x' }),
    });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('normalizes non-array contributions to empty array', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'Sum',
        overview: 'OV',
        contributions: 'not an array',
        openQuestions: 42,
      }),
    });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.contributions).toEqual([]);
      expect(r.result.openQuestions).toEqual([]);
    }
  });

  it('uses 学術論文 role for paper kind', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'X',
        overview: '',
        contributions: [],
        openQuestions: [],
      }),
    });

    await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('学術論文');
  });

  it('uses 講義ノート role for lecture kind', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'X',
        overview: '',
        contributions: [],
        openQuestions: [],
      }),
    });

    await summarize(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('講義ノート');
  });

  it('uses ノート role for note kind', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'X',
        overview: '',
        contributions: [],
        openQuestions: [],
      }),
    });

    await summarize(CTX, { kind: 'note', title: 'T', body: 'B' });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('ノート');
    expect(prompt).not.toContain('学術論文');
    expect(prompt).not.toContain('講義ノート');
  });

  it('filters non-string entries from contributions', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'X',
        overview: '',
        contributions: ['valid', 42, null, 'also valid'],
        openQuestions: [],
      }),
    });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.contributions).toEqual(['valid', 'also valid']);
    }
  });

  it('truncates oneLiner to 200 chars', async () => {
    const long = 'x'.repeat(300);
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: long,
        overview: '',
        contributions: [],
        openQuestions: [],
      }),
    });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.oneLiner.length).toBe(200);
    }
  });

  it('caps contributions at 10 items', async () => {
    const many = Array.from({ length: 15 }, (_, i) => `C${i}`);
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        oneLiner: 'X',
        overview: '',
        contributions: many,
        openQuestions: [],
      }),
    });

    const r = await summarize(CTX, { kind: 'paper', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.contributions.length).toBe(10);
    }
  });
});

// --------------------------------------------------------------------------
// autoTag
// --------------------------------------------------------------------------

describe('autoTag', () => {
  beforeEach(() => {
    mockRunPrompt.mockReset();
  });

  it('returns tags on success', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ tags: ['ml', 'transformers'], reasoning: 'R' }),
    });

    const r = await autoTag(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.tags).toEqual(['ml', 'transformers']);
      expect(r.result.reasoning).toBe('R');
    }
  });

  it('returns error when provider fails', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'fail' });

    const r = await autoTag(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('returns error on malformed output', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: '{"notags": true}' });

    const r = await autoTag(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('lowercases tags', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ tags: ['ML', 'Deep-Learning'], reasoning: '' }),
    });

    const r = await autoTag(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.tags).toEqual(['ml', 'deep-learning']);
    }
  });

  it('limits to 7 tags', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ tags: many, reasoning: '' }),
    });

    const r = await autoTag(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.tags.length).toBe(7);
    }
  });

  it('includes existing tags in prompt when provided', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ tags: ['new-tag'], reasoning: '' }),
    });

    await autoTag(CTX, { title: 'T', body: 'B', existingTags: ['old-tag'] });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('old-tag');
  });

  it('filters empty-string and non-string tags', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ tags: ['good', '', '  ', 42, null, 'ok'], reasoning: '' }),
    });

    const r = await autoTag(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.tags).toEqual(['good', 'ok']);
    }
  });
});

// --------------------------------------------------------------------------
// optimizeMarkdown
// --------------------------------------------------------------------------

describe('optimizeMarkdown', () => {
  beforeEach(() => {
    mockRunPrompt.mockReset();
  });

  it('returns optimized text on success', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        optimized: '# Better\n\nOptimized body',
        changes: ['Added callout', 'Fixed heading'],
      }),
    });

    const r = await optimizeMarkdown(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.optimized).toContain('Optimized body');
      expect(r.result.changes).toHaveLength(2);
    }
  });

  it('returns error when provider fails', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'timeout' });

    const r = await optimizeMarkdown(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('returns error on malformed output (missing optimized)', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ changes: ['x'] }),
    });

    const r = await optimizeMarkdown(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('normalizes non-array changes to empty array', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ optimized: '# X', changes: 'not array' }),
    });

    const r = await optimizeMarkdown(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.changes).toEqual([]);
    }
  });

  it('caps changes at 20 items', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `change-${i}`);
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ optimized: '# X', changes: many }),
    });

    const r = await optimizeMarkdown(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.changes.length).toBe(20);
    }
  });

  it('uses double timeout', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ optimized: 'x', changes: [] }),
    });

    await optimizeMarkdown(CTX, { title: 'T', body: 'B' });
    const opts = mockRunPrompt.mock.calls[0][1];
    expect(opts.timeoutMs).toBe(180_000); // 90_000 * 2
  });
});

// --------------------------------------------------------------------------
// learningCoach
// --------------------------------------------------------------------------

describe('learningCoach', () => {
  beforeEach(() => {
    mockRunPrompt.mockReset();
  });

  const GOOD_RESULT = {
    diagnosis: 'Core diagnosis',
    keyConcepts: [{ term: 'Concept A', explanation: 'Explains A', confidence: 'high' }],
    misconceptions: ['M1'],
    quiz: [{ question: 'Q?', answer: 'A', difficulty: 'easy' }],
    nextActions: ['Read chapter 3'],
    suggestedNotes: [{ title: 'Note X', reason: 'Useful' }],
  };

  it('returns structured result on success', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: JSON.stringify(GOOD_RESULT) });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.diagnosis).toBe('Core diagnosis');
      expect(r.result.keyConcepts).toHaveLength(1);
      expect(r.result.quiz[0].difficulty).toBe('easy');
    }
  });

  it('returns error when provider fails', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'err' });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('returns error on malformed output (missing diagnosis)', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ keyConcepts: [] }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('uses book role for book kind', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: JSON.stringify(GOOD_RESULT) });

    await learningCoach(CTX, { kind: 'book', title: 'T', body: 'B' });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('読書コーチ');
    expect(prompt).toContain('著者の中心主張');
  });

  it('uses paper role for paper kind', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: JSON.stringify(GOOD_RESULT) });

    await learningCoach(CTX, { kind: 'paper', title: 'T', body: 'B' });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('研究メンター');
    expect(prompt).toContain('研究課題');
  });

  it('uses lecture role for lecture kind', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: JSON.stringify(GOOD_RESULT) });

    await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    const prompt = mockRunPrompt.mock.calls[0][1].prompt;
    expect(prompt).toContain('チューター');
  });

  it('strips invalid confidence values', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        ...GOOD_RESULT,
        keyConcepts: [{ term: 'A', explanation: 'B', confidence: 'super-high' }],
      }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.keyConcepts[0].confidence).toBeUndefined();
    }
  });

  it('strips invalid difficulty values', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        ...GOOD_RESULT,
        quiz: [{ question: 'Q', answer: 'A', difficulty: 'nightmare' }],
      }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.quiz[0].difficulty).toBeUndefined();
    }
  });

  it('caps keyConcepts at 10', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      term: `T${i}`,
      explanation: `E${i}`,
      confidence: 'low',
    }));
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ ...GOOD_RESULT, keyConcepts: many }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.keyConcepts.length).toBe(10);
    }
  });

  it('caps quiz at 8', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
      difficulty: 'medium',
    }));
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ ...GOOD_RESULT, quiz: many }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.quiz.length).toBe(8);
    }
  });

  it('normalizes non-array fields to empty arrays', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        diagnosis: 'D',
        keyConcepts: 'bad',
        misconceptions: 42,
        quiz: null,
        nextActions: {},
        suggestedNotes: false,
      }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.keyConcepts).toEqual([]);
      expect(r.result.misconceptions).toEqual([]);
      expect(r.result.quiz).toEqual([]);
      expect(r.result.nextActions).toEqual([]);
      expect(r.result.suggestedNotes).toEqual([]);
    }
  });

  it('filters keyConcepts with missing term or explanation', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        ...GOOD_RESULT,
        keyConcepts: [
          { term: 'Valid', explanation: 'Yes' },
          { term: 'No exp' },
          { explanation: 'No term' },
          null,
        ],
      }),
    });

    const r = await learningCoach(CTX, { kind: 'lecture', title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.keyConcepts).toHaveLength(1);
      expect(r.result.keyConcepts[0].term).toBe('Valid');
    }
  });
});

// --------------------------------------------------------------------------
// generateCanvas
// --------------------------------------------------------------------------

describe('generateCanvas', () => {
  beforeEach(() => {
    mockRunPrompt.mockReset();
  });

  const GOOD_CANVAS = {
    nodes: [
      { id: 'root', label: 'Root', level: 0 },
      { id: 'n1', label: 'Child', level: 1 },
    ],
    edges: [{ from: 'root', to: 'n1' }],
  };

  it('returns canvas result on success', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: JSON.stringify(GOOD_CANVAS) });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.nodes).toHaveLength(2);
      expect(r.result.edges).toHaveLength(1);
    }
  });

  it('returns error when provider fails', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'err' });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('returns error on malformed output', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: '{"data": "nope"}' });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
  });

  it('caps nodes at 30', async () => {
    const nodes = Array.from({ length: 40 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
      level: 1,
    }));
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ nodes, edges: [] }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.nodes.length).toBe(30);
    }
  });

  it('clamps level to 0-5 range', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        nodes: [
          { id: 'a', label: 'A', level: -2 },
          { id: 'b', label: 'B', level: 10 },
        ],
        edges: [],
      }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.nodes[0].level).toBe(0);
      expect(r.result.nodes[1].level).toBe(5);
    }
  });

  it('preserves url only when string', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        nodes: [
          { id: 'a', label: 'A', level: 0, url: 'https://example.com' },
          { id: 'b', label: 'B', level: 1, url: 42 },
          { id: 'c', label: 'C', level: 1 },
        ],
        edges: [],
      }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.nodes[0].url).toBe('https://example.com');
      expect(r.result.nodes[1].url).toBeUndefined();
      expect(r.result.nodes[2].url).toBeUndefined();
    }
  });

  it('filters edges with missing from/to', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        nodes: [{ id: 'root', label: 'R', level: 0 }],
        edges: [
          { from: 'root', to: 'n1' },
          { from: 'root' },
          { to: 'n1' },
          null,
          { from: 42, to: 'n1' },
        ],
      }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.edges).toHaveLength(1);
      expect(r.result.edges[0]).toEqual({ from: 'root', to: 'n1' });
    }
  });

  it('truncates labels to 80 chars', async () => {
    const longLabel = 'x'.repeat(120);
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        nodes: [{ id: 'a', label: longLabel, level: 0 }],
        edges: [],
      }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.nodes[0].label.length).toBe(80);
    }
  });

  it('defaults missing level to 1', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        nodes: [{ id: 'a', label: 'A' }],
        edges: [],
      }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.nodes[0].level).toBe(1);
    }
  });

  it('caps edges at 60', async () => {
    const edges = Array.from({ length: 70 }, (_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
    }));
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        nodes: [{ id: 'root', label: 'R', level: 0 }],
        edges,
      }),
    });

    const r = await generateCanvas(CTX, { title: 'T', body: 'B' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.edges.length).toBe(60);
    }
  });
});

// --------------------------------------------------------------------------
// analyzeVault
// --------------------------------------------------------------------------

describe('analyzeVault', () => {
  beforeEach(() => {
    mockRunPrompt.mockReset();
  });

  it('detects orphans (no outgoing links)', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: ['Link your notes'] }),
    });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'orphan.md', tags: [], outgoingLinks: [] },
        { fileName: 'linked.md', tags: [], outgoingLinks: ['orphan.md'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const orphanNames = r.result.orphans.map((o) => o.fileName);
      expect(orphanNames).toContain('orphan.md');
      expect(r.result.orphans.find((o) => o.fileName === 'orphan.md')?.reason).toContain(
        'リンクが 1 本も無い'
      );
    }
  });

  it('counts tags', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: [] }),
    });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'a.md', tags: ['ml', 'dl'], outgoingLinks: ['b.md'] },
        { fileName: 'b.md', tags: ['ml'], outgoingLinks: ['a.md'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mlTag = r.result.topTags.find((t) => t.tag === 'ml');
      expect(mlTag?.count).toBe(2);
    }
  });

  it('detects broken links', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: [] }),
    });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'a.md', tags: [], outgoingLinks: ['nonexistent'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const brokenLink = r.result.orphans.find((o) => o.reason.includes('nonexistent'));
      expect(brokenLink).toBeDefined();
    }
  });

  it('includes AI suggestions when provider succeeds', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: ['Create MOCs', 'Add tags'] }),
    });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'a.md', tags: ['ml'], outgoingLinks: [] },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.suggestions).toEqual(['Create MOCs', 'Add tags']);
    }
  });

  it('gracefully handles AI failure (still returns deterministic data)', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'timeout' });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'a.md', tags: ['ml'], outgoingLinks: [] },
      ],
    });
    // analyzeVault always returns ok: true (AI part is best-effort)
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.suggestions).toEqual([]);
      expect(r.result.orphans.length).toBeGreaterThan(0);
      expect(r.result.topTags[0].tag).toBe('ml');
    }
  });

  it('handles empty vault', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: [] }),
    });

    const r = await analyzeVault(CTX, { samples: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.orphans).toEqual([]);
      expect(r.result.topTags).toEqual([]);
    }
  });

  it('resolves broken links with .md extension fallback', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: [] }),
    });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'a.md', tags: [], outgoingLinks: ['b'] },
        { fileName: 'b.md', tags: [], outgoingLinks: ['a.md'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Link 'b' → 'b.md' exists, so it should NOT be flagged as broken
      const brokenForA = r.result.orphans.filter(
        (o) => o.fileName === 'a.md' && o.reason.includes('存在しない')
      );
      expect(brokenForA).toHaveLength(0);
    }
  });

  it('sorts tags by count descending', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: [] }),
    });

    const r = await analyzeVault(CTX, {
      samples: [
        { fileName: 'a.md', tags: ['rare'], outgoingLinks: ['b.md'] },
        { fileName: 'b.md', tags: ['common', 'rare'], outgoingLinks: ['a.md'] },
        { fileName: 'c.md', tags: ['common'], outgoingLinks: ['a.md'] },
        { fileName: 'd.md', tags: ['common'], outgoingLinks: ['a.md'] },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.topTags[0].tag).toBe('common');
      expect(r.result.topTags[0].count).toBe(3);
    }
  });

  it('caps suggestions at 5', async () => {
    const many = Array.from({ length: 8 }, (_, i) => `Suggestion ${i}`);
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: many }),
    });

    const r = await analyzeVault(CTX, {
      samples: [{ fileName: 'a.md', tags: [], outgoingLinks: [] }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.suggestions.length).toBe(5);
    }
  });

  it('caps orphans at 50', async () => {
    mockRunPrompt.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ suggestions: [] }),
    });

    const samples = Array.from({ length: 60 }, (_, i) => ({
      fileName: `note-${i}.md`,
      tags: [],
      outgoingLinks: [],
    }));

    const r = await analyzeVault(CTX, { samples });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.orphans.length).toBe(50);
    }
  });
});
