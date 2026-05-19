// DocAI agents — document-grounded summary, Q&A, multi-doc analysis,
// and content generation. Sits next to electron/ai/agents.ts and follows the
// same conventions:
//   - AgentContext / runPrompt() from provider.ts
//   - extractJSON<T>() for defensive JSON parsing
//   - sanitizeForPrompt() guards on user input
//
// Each agent function returns the canonical
//   { ok: true; result: T } | { ok: false; error: string }
// envelope used elsewhere in the project.
import { runPrompt, type StreamEvent } from './provider';
import type { AgentContext } from './agents';
import { extractJSON } from './agents';
import type { DocumentChunk } from './chunker';
import { formatContextForPrompt, type RetrievedChunk } from './context-retriever';
import { sanitizeForPrompt } from '../ipc/utils';
import { logger } from '../logger';

const DOCAI_TIMEOUT_MS = 90_000;
const DOCAI_MULTI_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Shared citation type
// ---------------------------------------------------------------------------

export type Citation = {
  /** 1-based, matches the [出典 N] marker in the answer body. */
  id: number;
  /** Vault-relative path of the source document. */
  source: string;
  /** "Page 3" or "勾配降下法". */
  section: string;
  /** 50–120 character excerpt from the source chunk. */
  excerpt: string;
  pageNumber?: number;
  startLine?: number;
};

function chunkToCitation(retrieved: RetrievedChunk, id: number): Citation {
  return {
    id,
    source: retrieved.chunk.source,
    section: retrieved.chunk.section,
    excerpt: retrieved.chunk.content.slice(0, 120).replace(/\s+/g, ' ').trim(),
    pageNumber: retrieved.chunk.pageNumber,
    startLine: retrieved.chunk.startLine,
  };
}

// ---------------------------------------------------------------------------
// documentQA — features 2 + 3 (Q&A with citations)
// ---------------------------------------------------------------------------

export type DocumentQAResult = {
  /** Markdown answer body. Contains "[出典 N]" markers where supported. */
  answer: string;
  citations: Citation[];
  /** 3 follow-up question suggestions returned in the same call (cost-efficient). */
  suggestedFollowUps: string[];
};

type RawDocumentQA = {
  answer?: unknown;
  citations?: unknown;
  suggestedFollowUps?: unknown;
};

function buildDocumentQAPrompt(question: string, retrieved: RetrievedChunk[]): string {
  const context = retrieved.length > 0
    ? formatContextForPrompt(retrieved)
    : '(関連するコンテキストは見つかりませんでした)';
  return `あなたは文書分析の専門家です。提供されたコンテキストに基づいて質問に回答してください。

# ルール (厳守)
1. 回答は必ず提供されたコンテキスト内の情報に基づくこと
2. 各主張には [出典 N] 形式で根拠を示すこと
3. コンテキストに情報がなければ「この文書にはその情報が見つかりません」と回答すること
4. 推測・一般知識による補完は明示的に「(一般論として)」と書くこと

# コンテキスト
${context}

# 質問
${sanitizeForPrompt(question, 1000)}

以下の JSON 形式で **厳密に** 出力してください。説明文は付けないでください:

{
  "answer": "Markdown 形式の回答 ([出典 N] を含む)",
  "citations": [
    {"id": 1, "source": "...", "section": "...", "excerpt": "..."}
  ],
  "suggestedFollowUps": ["追問 1", "追問 2", "追問 3"]
}`;
}

export async function documentQA(
  ctx: AgentContext,
  args: {
    question: string;
    contextChunks: RetrievedChunk[];
    onEvent?: (e: StreamEvent) => void;
  }
): Promise<{ ok: true; result: DocumentQAResult } | { ok: false; error: string }> {
  const prompt = buildDocumentQAPrompt(args.question, args.contextChunks);
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: DOCAI_TIMEOUT_MS,
    onEvent: args.onEvent,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<RawDocumentQA>(r.text);
  if (!parsed || typeof parsed.answer !== 'string') {
    logger.warn('[docai.documentQA] malformed AI output', r.text.slice(0, 200));
    // Lenient fallback: if the model returned plain Markdown without JSON, surface it as the answer.
    if (r.text.trim().length > 0) {
      return {
        ok: true,
        result: {
          answer: r.text.trim(),
          citations: args.contextChunks.map((rc, i) => chunkToCitation(rc, i + 1)),
          suggestedFollowUps: [],
        },
      };
    }
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  // Normalize citations: prefer model-supplied IDs but fall back to retrieved chunks.
  const modelCitations = Array.isArray(parsed.citations)
    ? (parsed.citations as Array<Record<string, unknown>>)
        .map((c, i): Citation | null => {
          const id = typeof c.id === 'number' && Number.isFinite(c.id) ? c.id : i + 1;
          const source = typeof c.source === 'string' ? c.source : args.contextChunks[i]?.chunk.source ?? '';
          const section = typeof c.section === 'string' ? c.section : args.contextChunks[i]?.chunk.section ?? '';
          const excerpt =
            typeof c.excerpt === 'string'
              ? c.excerpt.slice(0, 240)
              : args.contextChunks[i]?.chunk.content.slice(0, 120) ?? '';
          if (!source) return null;
          const matchedChunk = args.contextChunks.find((rc) => rc.chunk.source === source && rc.chunk.section === section)?.chunk;
          return {
            id,
            source,
            section,
            excerpt,
            pageNumber: matchedChunk?.pageNumber,
            startLine: matchedChunk?.startLine,
          };
        })
        .filter((c): c is Citation => c !== null)
        .slice(0, 10)
    : args.contextChunks.map((rc, i) => chunkToCitation(rc, i + 1));

  const suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps)
    ? (parsed.suggestedFollowUps as unknown[])
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, 5)
    : [];

  return {
    ok: true,
    result: {
      answer: parsed.answer.trim(),
      citations: modelCitations,
      suggestedFollowUps,
    },
  };
}

// ---------------------------------------------------------------------------
// smartSummary — feature 1
// ---------------------------------------------------------------------------

export type SummaryMode = 'keypoints' | 'section' | 'exam-prep' | 'one-liner';

export type SmartSummaryKeyPoint = {
  point: string;
  citation: Citation;
  importance: 'critical' | 'important' | 'supplementary';
};

export type SmartSummaryResult = {
  headline: string;
  keyPoints: SmartSummaryKeyPoint[];
  structure: string;
  actionItems: string[];
  suggestedQuestions: string[];
};

type RawSmartSummary = {
  headline?: unknown;
  keyPoints?: unknown;
  structure?: unknown;
  actionItems?: unknown;
  suggestedQuestions?: unknown;
};

function modeInstructions(mode: SummaryMode, count?: number, targetSection?: string, audience?: string): string {
  switch (mode) {
    case 'keypoints':
      return `${count ?? 5} 件の重要ポイントを抽出し、各ポイントに出典を付与してください。`;
    case 'section':
      return `「${targetSection ?? ''}」セクションに絞り、${audience ?? 'general'} 向けに要約してください。`;
    case 'exam-prep':
      return `試験に出そうな重要ポイントを critical / important / supplementary の重要度別に整理してください。`;
    case 'one-liner':
      return `1 行 (50 文字以内) の超要約を headline に入れ、keyPoints は最大 3 件に絞ってください。`;
  }
}

function buildSmartSummaryPrompt(
  chunks: DocumentChunk[],
  mode: SummaryMode,
  count?: number,
  targetSection?: string,
  audience?: string
): string {
  // For summarize we present ALL chunks (or as many as fit) — not a retrieval.
  const context = chunks
    .slice(0, 30)
    .map((c, i) => `[出典 ${i + 1}] ${c.source}#${c.section}\n${c.content}`)
    .join('\n\n');
  return `あなたは文書要約の専門家です。以下のドキュメントを要約してください。

# モード
${modeInstructions(mode, count, targetSection, audience)}

# ドキュメント
${context}

以下の JSON 形式で **厳密に** 出力してください。説明文は付けないでください:

{
  "headline": "1 行要約",
  "keyPoints": [
    {
      "point": "ポイント本文",
      "citation": {"id": 1, "source": "...", "section": "...", "excerpt": "..."},
      "importance": "critical|important|supplementary"
    }
  ],
  "structure": "文書の論理構成 (Markdown、箇条書きで 3-7 行)",
  "actionItems": ["次にやること 1", "次にやること 2", "次にやること 3"],
  "suggestedQuestions": ["この文書について聞けそうな質問 1", "質問 2", "質問 3"]
}`;
}

export async function smartSummary(
  ctx: AgentContext,
  args: {
    chunks: DocumentChunk[];
    mode: SummaryMode;
    count?: number;
    targetSection?: string;
    audience?: 'beginner' | 'researcher' | 'general';
    onEvent?: (e: StreamEvent) => void;
  }
): Promise<{ ok: true; result: SmartSummaryResult } | { ok: false; error: string }> {
  if (args.chunks.length === 0) {
    return { ok: false, error: '要約対象のチャンクがありません' };
  }
  const prompt = buildSmartSummaryPrompt(
    args.chunks,
    args.mode,
    args.count,
    args.targetSection,
    args.audience
  );
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: DOCAI_TIMEOUT_MS,
    onEvent: args.onEvent,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<RawSmartSummary>(r.text);
  if (!parsed || typeof parsed.headline !== 'string') {
    logger.warn('[docai.smartSummary] malformed AI output', r.text.slice(0, 200));
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  const keyPoints: SmartSummaryKeyPoint[] = Array.isArray(parsed.keyPoints)
    ? (parsed.keyPoints as Array<Record<string, unknown>>)
        .map((kp, i): SmartSummaryKeyPoint | null => {
          if (typeof kp.point !== 'string') return null;
          const cit = kp.citation as Record<string, unknown> | undefined;
          const fallbackChunk = args.chunks[i] ?? args.chunks[0];
          const source = (cit && typeof cit.source === 'string' ? cit.source : fallbackChunk?.source) ?? '';
          const section = (cit && typeof cit.section === 'string' ? cit.section : fallbackChunk?.section) ?? '';
          const matched = args.chunks.find((c) => c.source === source && c.section === section);
          const citation: Citation = {
            id: typeof cit?.id === 'number' ? (cit.id as number) : i + 1,
            source,
            section,
            excerpt:
              cit && typeof cit.excerpt === 'string'
                ? (cit.excerpt as string).slice(0, 240)
                : matched?.content.slice(0, 120) ?? '',
            pageNumber: matched?.pageNumber,
            startLine: matched?.startLine,
          };
          const importance = ((): SmartSummaryKeyPoint['importance'] => {
            const v = kp.importance;
            if (v === 'critical' || v === 'important' || v === 'supplementary') return v;
            return 'important';
          })();
          return { point: (kp.point as string).trim(), citation, importance };
        })
        .filter((kp): kp is SmartSummaryKeyPoint => kp !== null)
        .slice(0, 12)
    : [];

  const actionItems = Array.isArray(parsed.actionItems)
    ? (parsed.actionItems as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 5)
    : [];
  const suggestedQuestions = Array.isArray(parsed.suggestedQuestions)
    ? (parsed.suggestedQuestions as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 5)
    : [];

  return {
    ok: true,
    result: {
      headline: parsed.headline.trim().slice(0, 200),
      keyPoints,
      structure: typeof parsed.structure === 'string' ? parsed.structure.trim() : '',
      actionItems,
      suggestedQuestions,
    },
  };
}

// ---------------------------------------------------------------------------
// multiDocAnalysis — feature 4 (Wave 2 surface, basic shape implemented now)
// ---------------------------------------------------------------------------

export type MultiDocAnalysisMode = 'compare' | 'synthesize' | 'presentation';

export type MultiDocAnalysisResult = {
  comparison: Array<{
    aspect: string;
    documents: Array<{ source: string; position: string; citation: Citation }>;
  }>;
  commonPoints: string[];
  differences: string[];
  synthesis: string;
  suggestedStructure?: string;
};

type RawMultiDoc = {
  comparison?: unknown;
  commonPoints?: unknown;
  differences?: unknown;
  synthesis?: unknown;
  suggestedStructure?: unknown;
};

function buildMultiDocPrompt(retrieved: RetrievedChunk[], mode: MultiDocAnalysisMode): string {
  const modeText = ({
    compare: '複数文書を比較し、研究手法・結果・限界点を整理してください。',
    synthesize: '複数文書から論点を統合し、レポートに使える構造化された結論を導いてください。',
    presentation: 'ゼミ発表用の構成案を含めて、複数文書の論点を整理してください。',
  } as const)[mode];
  return `あなたは学術文献の比較分析エキスパートです。${modeText}

# コンテキスト
${formatContextForPrompt(retrieved)}

以下の JSON 形式で **厳密に** 出力してください:

{
  "comparison": [
    {"aspect": "観点", "documents": [
      {"source": "...", "position": "その文書の立場", "citation": {"id": 1, "source": "...", "section": "...", "excerpt": "..."}}
    ]}
  ],
  "commonPoints": ["共通点 1", "共通点 2"],
  "differences": ["違い 1", "違い 2"],
  "synthesis": "統合的な結論 (Markdown)",
  "suggestedStructure": "発表/レポート構成案 (presentation モード時のみ)"
}`;
}

export async function multiDocAnalysis(
  ctx: AgentContext,
  args: {
    contextChunks: RetrievedChunk[];
    mode: MultiDocAnalysisMode;
    onEvent?: (e: StreamEvent) => void;
  }
): Promise<{ ok: true; result: MultiDocAnalysisResult } | { ok: false; error: string }> {
  if (args.contextChunks.length === 0) {
    return { ok: false, error: '比較対象のコンテキストがありません' };
  }
  const prompt = buildMultiDocPrompt(args.contextChunks, args.mode);
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: DOCAI_MULTI_TIMEOUT_MS,
    onEvent: args.onEvent,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<RawMultiDoc>(r.text);
  if (!parsed || typeof parsed.synthesis !== 'string') {
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  return {
    ok: true,
    result: {
      comparison: Array.isArray(parsed.comparison)
        ? (parsed.comparison as MultiDocAnalysisResult['comparison']).slice(0, 12)
        : [],
      commonPoints: Array.isArray(parsed.commonPoints)
        ? (parsed.commonPoints as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      differences: Array.isArray(parsed.differences)
        ? (parsed.differences as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      synthesis: parsed.synthesis.trim(),
      suggestedStructure:
        typeof parsed.suggestedStructure === 'string' ? parsed.suggestedStructure : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// contentGenerator — feature 5
// ---------------------------------------------------------------------------

export type ContentFormat = 'email' | 'presentation' | 'report' | 'memo' | 'general';

export type ContentGeneratorResult = {
  content: string;
  format: ContentFormat;
  citations: Citation[];
  wordCount: number;
};

const FORMAT_INSTRUCTIONS: Record<ContentFormat, string> = {
  email: 'メール文面として生成してください。宛先・敬語・簡潔さを重視。',
  presentation: '発表原稿として生成してください。スライド構成 (Markdown 見出し) と話し言葉を併記。',
  report: 'レポート構成案として生成してください。章立て・学術的文体。',
  memo: '議事録・メモとして生成してください。箇条書き中心・アクションアイテム明示。',
  general: 'ユーザー指示に忠実に、自由形式で生成してください。',
};

function buildContentGeneratorPrompt(
  retrieved: RetrievedChunk[],
  format: ContentFormat,
  instruction: string
): string {
  return `あなたは文書をベースにコンテンツを起草するアシスタントです。

# 出力形式
${FORMAT_INSTRUCTIONS[format]}

# ユーザー指示
${sanitizeForPrompt(instruction, 1000)}

# 参照ドキュメント
${formatContextForPrompt(retrieved)}

以下の JSON 形式で **厳密に** 出力してください:

{
  "content": "生成されたコンテンツ (Markdown)",
  "citations": [{"id": 1, "source": "...", "section": "...", "excerpt": "..."}]
}`;
}

export async function contentGenerator(
  ctx: AgentContext,
  args: {
    contextChunks: RetrievedChunk[];
    format: ContentFormat;
    instruction: string;
    onEvent?: (e: StreamEvent) => void;
  }
): Promise<{ ok: true; result: ContentGeneratorResult } | { ok: false; error: string }> {
  const prompt = buildContentGeneratorPrompt(args.contextChunks, args.format, args.instruction);
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: DOCAI_TIMEOUT_MS,
    onEvent: args.onEvent,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<{ content?: unknown; citations?: unknown }>(r.text);
  const content =
    parsed && typeof parsed.content === 'string' ? parsed.content : r.text.trim();
  if (!content) return { ok: false, error: 'AI 出力が空でした' };
  const citations: Citation[] = Array.isArray(parsed?.citations)
    ? (parsed.citations as Array<Record<string, unknown>>)
        .map((c, i): Citation | null => {
          if (typeof c.source !== 'string') return null;
          return {
            id: typeof c.id === 'number' ? c.id : i + 1,
            source: c.source,
            section: typeof c.section === 'string' ? c.section : '',
            excerpt: typeof c.excerpt === 'string' ? c.excerpt.slice(0, 240) : '',
          };
        })
        .filter((c): c is Citation => c !== null)
    : args.contextChunks.map((rc, i) => chunkToCitation(rc, i + 1));

  return {
    ok: true,
    result: {
      content: content.trim(),
      format: args.format,
      citations,
      wordCount: content.split(/\s+/).filter(Boolean).length,
    },
  };
}
