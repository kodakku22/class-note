// TF-IDF + bi-gram context retriever for DocAI.
//
// Given a query and a set of DocumentChunks, returns the top-K most relevant
// chunks ranked by a BM25-flavored TF-IDF score with Japanese bi-gram support.
//
// Why TF-IDF (not embeddings) for Wave 1:
//   - Zero extra API cost / latency
//   - Deterministic, debuggable, no model drift
//   - For research-vault scale (≤ 50 chunks per single document, ≤ 300 across
//     a multi-doc query) the recall is comparable to embeddings
//
// The interface (retrieveContext) is stable so that swapping in an embedding
// backend later is internal to this file.
import type { DocumentChunk } from './chunker';

export type RetrievedChunk = {
  chunk: DocumentChunk;
  score: number;
  /** Score normalized to [0, 1] relative to the best match in this query. */
  normalizedScore: number;
  /** Bucketed match strength for UI display. */
  confidence: 'high' | 'medium' | 'low';
  /** "[出典 N]" — N is 1-based and matches the order in the returned array. */
  citationLabel: string;
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at',
  'for', 'with', 'by', 'from', 'as', 'it', 'this', 'that', 'these', 'those', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may',
  'no', 'not', 'so', 'if', 'then',
  // Japanese particles + frequent fillers (extended in Phase 2-G)
  'の', 'に', 'は', 'を', 'が', 'と', 'で', 'も', 'や', 'へ', 'から', 'まで', 'こと', 'もの', 'これ', 'それ', 'あれ',
  'ある', 'ない', 'する', 'した', 'して', 'できる', 'ため', 'よう', 'いる', 'なる', 'なっ', 'です', 'ます',
]);

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const ASCII_WORD_RE = /[A-Za-z0-9][A-Za-z0-9_-]*/g;

/**
 * Strip content that is bad signal for relevance ranking:
 *   - fenced code blocks (``` … ```)
 *   - indented code blocks (4-space prefix lines)
 *   - inline code (`…`)
 *   - LaTeX math ($…$ / $$…$$)
 * Applied before tokenization in both queries and chunk content so symbol
 * runs ("dx", "nabla") don't pollute term frequencies.
 */
export function stripNoise(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/(^|\n)( {4,})[^\n]*/g, '\n')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ');
}

/**
 * Tokenize text with mixed-language strategy:
 *   - ASCII / digits → lowercase word tokens (length ≥ 2)
 *   - CJK runs → character bi-grams (2-char sliding window)
 *   - Stopwords filtered out
 *   - Code blocks and math stripped first
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const cleaned = stripNoise(text);
  const tokens: string[] = [];
  // ASCII words first.
  const asciiMatches = cleaned.toLowerCase().match(ASCII_WORD_RE);
  if (asciiMatches) {
    for (const w of asciiMatches) {
      if (w.length >= 2 && !STOPWORDS.has(w)) tokens.push(w);
    }
  }
  // CJK bi-grams.
  let cjkRun = '';
  const flushRun = () => {
    if (cjkRun.length === 0) return;
    if (cjkRun.length === 1) {
      tokens.push(cjkRun);
    } else {
      for (let i = 0; i < cjkRun.length - 1; i += 1) {
        const bigram = cjkRun.slice(i, i + 2);
        if (!STOPWORDS.has(bigram)) tokens.push(bigram);
      }
    }
    cjkRun = '';
  };
  for (const ch of cleaned) {
    if (CJK_RE.test(ch)) {
      cjkRun += ch;
    } else {
      flushRun();
    }
  }
  flushRun();
  return tokens;
}

type TermStats = {
  /** Term-frequency of the term in this chunk. */
  tf: number;
};

type ChunkIndex = {
  termStats: Map<string, TermStats>;
  /** Token count (denominator for normalization). */
  length: number;
};

function buildChunkIndex(chunk: DocumentChunk): ChunkIndex {
  const tokens = tokenize(chunk.content);
  const termStats = new Map<string, TermStats>();
  for (const tok of tokens) {
    const existing = termStats.get(tok);
    if (existing) existing.tf += 1;
    else termStats.set(tok, { tf: 1 });
  }
  return { termStats, length: tokens.length };
}

function buildDfMap(indices: ChunkIndex[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const idx of indices) {
    for (const term of idx.termStats.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * BM25-style score (Robertson). Constants chosen for short technical chunks:
 *   k1 = 1.2 (term saturation), b = 0.5 (length penalty)
 */
const K1 = 1.2;
const B = 0.5;

function scoreChunk(
  queryTokens: string[],
  index: ChunkIndex,
  df: Map<string, number>,
  totalChunks: number,
  avgLen: number
): number {
  if (queryTokens.length === 0 || index.length === 0) return 0;
  let score = 0;
  for (const term of queryTokens) {
    const tf = index.termStats.get(term)?.tf ?? 0;
    if (tf === 0) continue;
    const dfn = df.get(term) ?? 1;
    const idf = Math.log(1 + (totalChunks - dfn + 0.5) / (dfn + 0.5));
    const lengthNorm = 1 - B + B * (index.length / Math.max(avgLen, 1));
    const tfNorm = (tf * (K1 + 1)) / (tf + K1 * lengthNorm);
    score += idf * tfNorm;
  }
  return score;
}

/**
 * Rank chunks against `query`. Returns up to `topK` matches with the citation
 * labels "[出典 1]", "[出典 2]", … assigned in result order.
 *
 * Chunks with a zero score are dropped — if every chunk scores zero, an empty
 * array is returned (the caller should fall back to "no context").
 */
export function retrieveContext(
  query: string,
  chunks: DocumentChunk[],
  topK: number = 5
): RetrievedChunk[] {
  if (chunks.length === 0) return [];
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) return [];

  const indices = chunks.map(buildChunkIndex);
  const df = buildDfMap(indices);
  const avgLen = indices.reduce((acc, idx) => acc + idx.length, 0) / Math.max(indices.length, 1);

  const scored = chunks
    .map((chunk, i) => ({
      chunk,
      score: scoreChunk(queryTokens, indices[i], df, chunks.length, avgLen),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK));

  const maxScore = scored[0]?.score ?? 0;
  const bucket = (n: number): 'high' | 'medium' | 'low' => {
    if (n >= 0.66) return 'high';
    if (n >= 0.33) return 'medium';
    return 'low';
  };

  return scored.map((entry, i) => {
    const normalized = maxScore > 0 ? entry.score / maxScore : 0;
    return {
      chunk: entry.chunk,
      score: entry.score,
      normalizedScore: normalized,
      confidence: bucket(normalized),
      citationLabel: `[出典 ${i + 1}]`,
    };
  });
}

/**
 * Multi-document retrieval. Flattens all chunks across the map (keeping
 * provenance via chunk.source) then runs the standard ranker with a larger
 * default topK so each document gets a chance at representation.
 */
export function retrieveMultiDocContext(
  query: string,
  documentChunks: Map<string, DocumentChunk[]>,
  topK: number = 8
): RetrievedChunk[] {
  const all: DocumentChunk[] = [];
  for (const chunks of documentChunks.values()) {
    all.push(...chunks);
  }
  return retrieveContext(query, all, topK);
}

/**
 * Format a retrieved-context block ready to be embedded into a prompt:
 *
 *   [出典 1] {source}#{section}
 *   {content}
 *
 *   [出典 2] ...
 */
export function formatContextForPrompt(retrieved: RetrievedChunk[]): string {
  return retrieved
    .map((r) => {
      const header = `${r.citationLabel} ${r.chunk.source}#${r.chunk.section}`;
      return `${header}\n${r.chunk.content}`;
    })
    .join('\n\n');
}
