// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { DocumentChunk } from '../../electron/ai/chunker';
import {
  formatContextForPrompt,
  retrieveContext,
  retrieveMultiDocContext,
  stripNoise,
  tokenize,
} from '../../electron/ai/context-retriever';

function makeChunk(
  id: string,
  content: string,
  overrides: Partial<DocumentChunk> = {}
): DocumentChunk {
  return {
    id,
    source: overrides.source ?? 'doc.md',
    section: overrides.section ?? 'X',
    content,
    metadata: { title: 't', kind: 'note', tags: [] },
    ...overrides,
  };
}

describe('context-retriever / tokenize', () => {
  it('lowercases ASCII words and drops stopwords', () => {
    expect(tokenize('The QUICK brown Fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('drops 1-char ASCII tokens', () => {
    expect(tokenize('a b cd ef')).toEqual(['cd', 'ef']);
  });

  it('emits CJK bi-grams', () => {
    // "勾配降下法" → 勾配 / 配降 / 降下 / 下法
    const toks = tokenize('勾配降下法');
    expect(toks).toEqual(['勾配', '配降', '降下', '下法']);
  });

  it('handles mixed Japanese / English text', () => {
    const toks = tokenize('Adam勾配');
    expect(toks).toContain('adam');
    expect(toks).toContain('勾配');
  });

  it('returns empty for blank input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('context-retriever / retrieveContext', () => {
  it('ranks chunks containing query terms higher', () => {
    const chunks = [
      makeChunk('a', 'unrelated cooking recipe with no math'),
      makeChunk('b', 'gradient descent is an optimization algorithm'),
      makeChunk('c', 'the chain rule helps compute the gradient'),
    ];
    const out = retrieveContext('gradient descent', chunks, 3);
    expect(out[0].chunk.id).toBe('b');
    // 'a' has no overlap → dropped
    expect(out.map((r) => r.chunk.id)).not.toContain('a');
  });

  it('assigns 1-based citation labels in result order', () => {
    const chunks = [
      makeChunk('a', 'foo bar baz'),
      makeChunk('b', 'foo qux'),
      makeChunk('c', 'bar baz'),
    ];
    const out = retrieveContext('foo', chunks, 3);
    expect(out[0].citationLabel).toBe('[出典 1]');
    if (out[1]) expect(out[1].citationLabel).toBe('[出典 2]');
  });

  it('caps results to topK', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => makeChunk(`c${i}`, 'shared keyword token'));
    const out = retrieveContext('shared', chunks, 3);
    expect(out).toHaveLength(3);
  });

  it('returns empty array when query has no overlap with any chunk', () => {
    const chunks = [makeChunk('a', 'completely different content')];
    const out = retrieveContext('xyzzyxyzzy', chunks);
    expect(out).toEqual([]);
  });

  it('returns empty array on empty input', () => {
    expect(retrieveContext('q', [])).toEqual([]);
    expect(retrieveContext('', [makeChunk('a', 'x')])).toEqual([]);
  });

  it('works on Japanese queries via bi-grams', () => {
    const chunks = [
      makeChunk('a', '勾配降下法は最適化アルゴリズムです'),
      makeChunk('b', '夕食のレシピを書きました'),
    ];
    const out = retrieveContext('勾配降下', chunks, 2);
    expect(out[0].chunk.id).toBe('a');
  });
});

describe('context-retriever / retrieveMultiDocContext', () => {
  it('flattens multiple documents and ranks across them', () => {
    const docA = [makeChunk('a1', 'gradient descent definition', { source: 'A.md' })];
    const docB = [
      makeChunk('b1', 'unrelated content', { source: 'B.md' }),
      makeChunk('b2', 'momentum gradient methods are improvements', { source: 'B.md' }),
    ];
    const map = new Map([
      ['A.md', docA],
      ['B.md', docB],
    ]);
    const out = retrieveMultiDocContext('gradient', map, 8);
    // Both gradient-mentioning chunks should be present
    const ids = out.map((r) => r.chunk.id);
    expect(ids).toContain('a1');
    expect(ids).toContain('b2');
    expect(ids).not.toContain('b1');
  });
});

describe('context-retriever / formatContextForPrompt', () => {
  it('emits "[出典 N] source#section\\ncontent" per chunk', () => {
    const retrieved = [
      {
        chunk: makeChunk('a', 'alpha body', { source: 'A.md', section: 'Intro' }),
        score: 1,
        normalizedScore: 1,
        confidence: 'high' as const,
        citationLabel: '[出典 1]',
      },
      {
        chunk: makeChunk('b', 'beta body', { source: 'B.pdf', section: 'Page 2' }),
        score: 0.5,
        normalizedScore: 0.5,
        confidence: 'medium' as const,
        citationLabel: '[出典 2]',
      },
    ];
    const text = formatContextForPrompt(retrieved);
    expect(text).toContain('[出典 1] A.md#Intro');
    expect(text).toContain('alpha body');
    expect(text).toContain('[出典 2] B.pdf#Page 2');
    expect(text).toContain('beta body');
  });
});

describe('context-retriever / stripNoise (Phase 2-G)', () => {
  it('removes fenced code blocks', () => {
    const text = 'before\n```js\nlet x = 1;\n```\nafter';
    const out = stripNoise(text);
    expect(out).not.toContain('let x');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('removes inline code', () => {
    const out = stripNoise('hello `world` foo');
    expect(out).not.toContain('world');
    expect(out).toContain('hello');
    expect(out).toContain('foo');
  });

  it('removes block + inline LaTeX math', () => {
    const out = stripNoise('intro $a + b$ middle $$\\nabla L$$ end');
    expect(out).not.toContain('nabla');
    expect(out).not.toContain('a + b');
    expect(out).toContain('intro');
    expect(out).toContain('middle');
    expect(out).toContain('end');
  });

  it('removes indented code blocks', () => {
    const out = stripNoise('para\n    indented_code()\nrest');
    expect(out).not.toContain('indented_code');
    expect(out).toContain('para');
    expect(out).toContain('rest');
  });
});

describe('context-retriever / normalizedScore + confidence (Phase 2-G)', () => {
  it('top hit has normalizedScore === 1 and confidence === "high"', () => {
    const chunks = [
      makeChunk('a', 'gradient descent gradient gradient'),
      makeChunk('b', 'unrelated content'),
    ];
    const out = retrieveContext('gradient', chunks);
    expect(out[0].normalizedScore).toBeCloseTo(1, 5);
    expect(out[0].confidence).toBe('high');
  });

  it('buckets confidence into high/medium/low', () => {
    const chunks = [
      makeChunk('a', 'foo foo foo foo'),
      makeChunk('b', 'foo'),
      makeChunk('c', 'foo bar'),
    ];
    const out = retrieveContext('foo', chunks, 3);
    expect(out.every((r) => ['high', 'medium', 'low'].includes(r.confidence))).toBe(true);
  });

  it('extended Japanese stopwords reduce noise', () => {
    // "する" and "ある" are now stopwords and should NOT be retrieved as tokens.
    const toks = tokenize('文書を分析する');
    expect(toks).not.toContain('する');
  });
});
