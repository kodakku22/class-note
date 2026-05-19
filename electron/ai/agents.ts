// Task-specific AI agents.
//
// All agents route through `runPrompt` (electron/ai/provider.ts) so they
// transparently support GPT / Gemini / Claude / none. Each agent has
// a focused system-style prompt + a single output contract.
//
// Cross-cutting design intent:
//  - Lectures, papers, books, and free-form notes share the same agents.
//    The agent doesn't care what the source is, only what *task* the user
//    invoked. This is what enables the "授業 ↔ 論文 横断的 AI" requirement.
//  - Output is always a small JSON object (parsed defensively) so the UI
//    can apply structured edits to the note's frontmatter / body.
//
// Implemented agents (Phase 1):
//   summarize       — 3-pass paper-style summary (overview / contributions / open questions)
//   autoTag         — propose 3-7 frontmatter tags
//   optimizeMarkdown — Obsidian-Skill #1: callouts + frontmatter + wikilinks
//   generateCanvas  — Obsidian-Skill #4: produce a Canvas JSON from text
//   analyzeVault    — Obsidian-Skill #5: orphans + tag frequency + suggestions
import { runPrompt, type ProviderKind } from './provider';
import { sanitizeForPrompt } from '../ipc/utils';
import { logger } from '../logger';

const AGENT_TIMEOUT_MS = 90_000;

export type AgentContext = {
  provider: ProviderKind;
  authMode?: 'api-key' | 'login';
  apiKey?: string;
  model?: string;
};

export type LearningSourceKind = 'book' | 'paper' | 'lecture';

export type LearningCoachResult = {
  diagnosis: string;
  keyConcepts: Array<{
    term: string;
    explanation: string;
    confidence?: 'low' | 'medium' | 'high';
  }>;
  misconceptions: string[];
  quiz: Array<{
    question: string;
    answer: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
  nextActions: string[];
  suggestedNotes: Array<{ title: string; reason: string }>;
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Try to extract a JSON object from a model response. Models often wrap JSON
 * in ```json fences or include leading/trailing prose; we strip these and
 * fall back to a permissive {} on failure (the caller will surface that as
 * "AI 出力を解釈できませんでした").
 */
export function extractJSON<T>(text: string): T | null {
  if (!text) return null;
  // Strip code fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fence ? fence[1] : text).trim();
  // Find the first { and last } to handle prose wrappers.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// 1. summarize — 3-pass paper-style summary
// --------------------------------------------------------------------------

export type SummaryResult = {
  overview: string;
  contributions: string[];
  openQuestions: string[];
  /** 1-line description suitable for frontmatter. */
  oneLiner: string;
};

export async function summarize(
  ctx: AgentContext,
  source: { kind: 'paper' | 'lecture' | 'note'; title: string; body: string }
): Promise<{ ok: true; result: SummaryResult } | { ok: false; error: string }> {
  const safeBody = sanitizeForPrompt(source.body, 12_000);
  const role =
    source.kind === 'paper'
      ? '学術論文'
      : source.kind === 'lecture'
        ? '講義ノート'
        : 'ノート';
  const prompt = `あなたは大学院生の研究をサポートする AI です。以下の${role}を 3 パス読法で要約してください。

タイトル: ${source.title}

本文:
${safeBody}

以下の JSON 形式で **厳密に** 出力してください。説明文は付けないでください:

{
  "oneLiner": "1 行 (50 文字以内) の超要約",
  "overview": "概要 (3 文以内、何が新しいかと結論)",
  "contributions": ["主要貢献 1", "主要貢献 2", "..."],
  "openQuestions": ["未解決の問い 1", "未解決の問い 2", "..."]
}`;

  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<SummaryResult>(r.text);
  if (!parsed || typeof parsed.oneLiner !== 'string') {
    logger.warn('[agents.summarize] malformed AI output', r.text.slice(0, 200));
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  // Defensive normalization
  return {
    ok: true,
    result: {
      oneLiner: parsed.oneLiner.trim().slice(0, 200),
      overview: (parsed.overview ?? '').trim(),
      contributions: Array.isArray(parsed.contributions)
        ? parsed.contributions.filter((s) => typeof s === 'string').slice(0, 10)
        : [],
      openQuestions: Array.isArray(parsed.openQuestions)
        ? parsed.openQuestions.filter((s) => typeof s === 'string').slice(0, 10)
        : [],
    },
  };
}

// --------------------------------------------------------------------------
// 2. autoTag — propose frontmatter tags
// --------------------------------------------------------------------------

export type AutoTagResult = {
  tags: string[];
  reasoning: string;
};

export async function autoTag(
  ctx: AgentContext,
  source: { title: string; body: string; existingTags?: string[] }
): Promise<{ ok: true; result: AutoTagResult } | { ok: false; error: string }> {
  const safeBody = sanitizeForPrompt(source.body, 8_000);
  const existing = source.existingTags?.length
    ? `既存のタグ: ${source.existingTags.join(', ')}\n`
    : '';
  const prompt = `あなたは知識管理の専門家です。以下のノートに最適な frontmatter タグ (kebab-case 推奨) を 3〜7 個提案してください。

${existing}タイトル: ${source.title}

本文:
${safeBody}

以下の JSON 形式で **厳密に** 出力してください:

{
  "tags": ["tag-1", "tag-2", "tag-3"],
  "reasoning": "なぜこれらのタグを選んだか 1〜2 文"
}`;
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<AutoTagResult>(r.text);
  if (!parsed || !Array.isArray(parsed.tags)) {
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  return {
    ok: true,
    result: {
      tags: parsed.tags
        .filter((t) => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim().toLowerCase())
        .slice(0, 7),
      reasoning: (parsed.reasoning ?? '').trim(),
    },
  };
}

// --------------------------------------------------------------------------
// 3. optimizeMarkdown — Obsidian-Skill #1
// --------------------------------------------------------------------------

export type OptimizeResult = {
  optimized: string;
  changes: string[];
};

export async function optimizeMarkdown(
  ctx: AgentContext,
  source: { title: string; body: string }
): Promise<{ ok: true; result: OptimizeResult } | { ok: false; error: string }> {
  const safeBody = sanitizeForPrompt(source.body, 12_000);
  const prompt = `あなたは Obsidian / Markdown のフォーマット最適化エキスパートです。以下のノートを読みやすく整えてください:

整える際のルール:
1. 重要なポイントは Obsidian コールアウト記法で目立たせる ( > [!note], > [!warning], > [!tip] )
2. 関連トピックは [[wikilink]] 形式で書く (新規でも既存でも)
3. 見出し構造を整える (H1 を 1 つ、H2 で大セクション、H3 で小セクション)
4. 元の内容・順序は変えない (整形のみ、要約しない)

タイトル: ${source.title}

元の本文:
\`\`\`
${safeBody}
\`\`\`

以下の JSON 形式で **厳密に** 出力してください:

{
  "optimized": "整形後の Markdown 全文",
  "changes": ["変更点 1", "変更点 2", "..."]
}`;
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: AGENT_TIMEOUT_MS * 2, // longer for full-text rewrite
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<OptimizeResult>(r.text);
  if (!parsed || typeof parsed.optimized !== 'string') {
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  return {
    ok: true,
    result: {
      optimized: parsed.optimized,
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 20) : [],
    },
  };
}

// --------------------------------------------------------------------------
// 3.5 learningCoach — source-specific comprehension support
// --------------------------------------------------------------------------

function learningRole(kind: LearningSourceKind): string {
  if (kind === 'book') {
    return `あなたは読書コーチです。章・主張・著者の意図・読書メモを、ユーザー自身の行動や問いに接続して理解を深めます。`;
  }
  if (kind === 'paper') {
    return `あなたは研究メンターです。研究課題・手法・証拠・限界・再現性・引用価値を切り分け、論文を研究活動に接続します。`;
  }
  return `あなたは授業理解のチューターです。前提知識・定義・例題・理解確認・復習順を整理し、講義内容を段階的に定着させます。`;
}

function learningFocus(kind: LearningSourceKind): string {
  if (kind === 'book') {
    return `- 著者の中心主張と、それを支える章/節の関係を抽出する
- 読書メモから、ユーザーが次に考えるべき問いを作る
- 実生活・研究・授業への接続を提案する`;
  }
  if (kind === 'paper') {
    return `- 研究課題、仮説、手法、データ、評価、限界を分離する
- 引用すべき理由と、引用しない方がよい条件を明確にする
- 再現性や追試の観点から次の読み方を提案する`;
  }
  return `- つまずきやすい前提知識を先に補う
- 定義、例、反例、簡単な確認問題を作る
- 次回復習すべき順番を具体的に提案する`;
}

export async function learningCoach(
  ctx: AgentContext,
  source: { kind: LearningSourceKind; title: string; body: string }
): Promise<{ ok: true; result: LearningCoachResult } | { ok: false; error: string }> {
  const safeBody = sanitizeForPrompt(source.body, 14_000);
  const prompt = `${learningRole(source.kind)}

以下の素材について、理解度を上げるための診断と次アクションを作成してください。

素材タイプ: ${source.kind}
タイトル: ${source.title}

重点:
${learningFocus(source.kind)}

本文:
${safeBody}

以下の JSON 形式で **厳密に** 出力してください。説明文は付けないでください:

{
  "diagnosis": "現在の理解を深めるための診断。何が核で、どこが曖昧になりやすいかを3文以内で書く",
  "keyConcepts": [
    { "term": "重要概念", "explanation": "短い説明", "confidence": "medium" }
  ],
  "misconceptions": ["誤解しやすい点 1", "誤解しやすい点 2"],
  "quiz": [
    { "question": "理解確認の質問", "answer": "模範回答", "difficulty": "easy" }
  ],
  "nextActions": ["次にやること 1", "次にやること 2"],
  "suggestedNotes": [
    { "title": "作るとよい関連ノート名", "reason": "なぜ必要か" }
  ]
}`;

  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!r.ok) return { ok: false, error: r.error };

  const parsed = extractJSON<LearningCoachResult>(r.text);
  if (!parsed || typeof parsed.diagnosis !== 'string') {
    logger.warn('[agents.learningCoach] malformed AI output', r.text.slice(0, 200));
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }

  const confidenceValues = new Set(['low', 'medium', 'high']);
  const difficultyValues = new Set(['easy', 'medium', 'hard']);
  return {
    ok: true,
    result: {
      diagnosis: parsed.diagnosis.trim(),
      keyConcepts: Array.isArray(parsed.keyConcepts)
        ? parsed.keyConcepts
            .filter((c) => c && typeof c.term === 'string' && typeof c.explanation === 'string')
            .map((c) => ({
              term: c.term.trim().slice(0, 80),
              explanation: c.explanation.trim().slice(0, 500),
              confidence: confidenceValues.has(String(c.confidence))
                ? c.confidence
                : undefined,
            }))
            .slice(0, 10)
        : [],
      misconceptions: Array.isArray(parsed.misconceptions)
        ? parsed.misconceptions.filter((s) => typeof s === 'string').slice(0, 8)
        : [],
      quiz: Array.isArray(parsed.quiz)
        ? parsed.quiz
            .filter((q) => q && typeof q.question === 'string' && typeof q.answer === 'string')
            .map((q) => ({
              question: q.question.trim().slice(0, 500),
              answer: q.answer.trim().slice(0, 800),
              difficulty: difficultyValues.has(String(q.difficulty))
                ? q.difficulty
                : undefined,
            }))
            .slice(0, 8)
        : [],
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions.filter((s) => typeof s === 'string').slice(0, 8)
        : [],
      suggestedNotes: Array.isArray(parsed.suggestedNotes)
        ? parsed.suggestedNotes
            .filter((n) => n && typeof n.title === 'string' && typeof n.reason === 'string')
            .map((n) => ({
              title: n.title.trim().slice(0, 80),
              reason: n.reason.trim().slice(0, 300),
            }))
            .slice(0, 6)
        : [],
    },
  };
}

// --------------------------------------------------------------------------
// 4. generateCanvas — Obsidian-Skill #4 (mind-map / canvas JSON)
// --------------------------------------------------------------------------

export type CanvasNode = {
  id: string;
  label: string;
  url?: string;
  /** 0-based depth from the root, used by the renderer to layout. */
  level: number;
};

export type CanvasEdge = { from: string; to: string };

export type CanvasResult = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export async function generateCanvas(
  ctx: AgentContext,
  source: { title: string; body: string }
): Promise<{ ok: true; result: CanvasResult } | { ok: false; error: string }> {
  const safeBody = sanitizeForPrompt(source.body, 8_000);
  const prompt = `以下のテキストから、マインドマップ風のキャンバス構造を生成してください。
中心に「タイトル」を root として、概念を 2〜3 階層に分解します。

タイトル: ${source.title}

本文:
${safeBody}

以下の JSON 形式で出力してください ( level は 0=root, 1=主要分岐, 2=詳細 ):

{
  "nodes": [
    { "id": "root", "label": "<タイトル>", "level": 0 },
    { "id": "n1", "label": "概念 A", "level": 1, "url": "https://..." },
    { "id": "n2", "label": "詳細 a-1", "level": 2 }
  ],
  "edges": [
    { "from": "root", "to": "n1" },
    { "from": "n1", "to": "n2" }
  ]
}

URL は本文に出てきた場合のみ含めてください。ノードは最大 30 個。`;
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = extractJSON<CanvasResult>(r.text);
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    return { ok: false, error: 'AI 出力を解釈できませんでした' };
  }
  return {
    ok: true,
    result: {
      nodes: parsed.nodes.slice(0, 30).map((n, i) => ({
        id: String(n.id ?? `n${i}`),
        label: String(n.label ?? '').slice(0, 80),
        url: typeof n.url === 'string' ? n.url : undefined,
        level: Number.isFinite(n.level) ? Math.max(0, Math.min(5, n.level as number)) : 1,
      })),
      edges: parsed.edges
        .filter((e) => e && typeof e.from === 'string' && typeof e.to === 'string')
        .slice(0, 60),
    },
  };
}

// --------------------------------------------------------------------------
// 5. analyzeVault — Obsidian-Skill #5 (orphan + tag frequency analysis)
// --------------------------------------------------------------------------

export type VaultAnalysis = {
  orphans: { fileName: string; reason: string }[];
  topTags: { tag: string; count: number }[];
  suggestions: string[];
};

export async function analyzeVault(
  ctx: AgentContext,
  vault: { samples: { fileName: string; tags: string[]; outgoingLinks: string[] }[] }
): Promise<{ ok: true; result: VaultAnalysis } | { ok: false; error: string }> {
  // We do the deterministic part locally (orphans + tag frequency) and ask
  // the AI only for the qualitative "suggestions" part. This keeps the API
  // call short and the deterministic output reproducible.
  const allFileNames = new Set(vault.samples.map((s) => s.fileName));
  const orphans = vault.samples
    .filter((s) => s.outgoingLinks.length === 0)
    .map((s) => ({ fileName: s.fileName, reason: 'リンクが 1 本も無い' }));
  // Also flag links that point to non-existent files
  for (const s of vault.samples) {
    for (const link of s.outgoingLinks) {
      if (!allFileNames.has(link) && !allFileNames.has(`${link}.md`)) {
        orphans.push({
          fileName: s.fileName,
          reason: `リンク先 [[${link}]] が存在しない`,
        });
      }
    }
  }
  const tagCounts = new Map<string, number>();
  for (const s of vault.samples) {
    for (const tag of s.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Ask the AI for suggestions based on the structural digest.
  const digest = topTags
    .map((t) => `${t.tag}: ${t.count}`)
    .join(', ');
  const prompt = `以下は研究者の Vault のタグ使用頻度トップです:

${digest}

孤立ノート (リンクが無い or リンク先が無い) は ${orphans.length} 件あります。

このパターンから、知識ベースを改善するための具体的な提案を 3〜5 個ください。

JSON 形式で:
{
  "suggestions": ["提案 1", "提案 2", "提案 3"]
}`;
  const r = await runPrompt(ctx.provider, {
    authMode: ctx.authMode,
    prompt,
    apiKey: ctx.apiKey,
    model: ctx.model,
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  let suggestions: string[] = [];
  if (r.ok) {
    const parsed = extractJSON<{ suggestions: string[] }>(r.text);
    if (parsed && Array.isArray(parsed.suggestions)) {
      suggestions = parsed.suggestions
        .filter((s) => typeof s === 'string')
        .slice(0, 5);
    }
  }
  return { ok: true, result: { orphans: orphans.slice(0, 50), topTags, suggestions } };
}
