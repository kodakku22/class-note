// IPC bindings for the AI agents (electron/ai/agents.ts).
//
// Each handler:
//   1. Loads provider settings + API key from the main-process settings store
//   2. Calls the corresponding agent function
//   3. For agents that produce structured output, optionally applies the
//      result to the note's frontmatter / body (see ai:summarizeAndApply).
//
// Renderer never needs to know about provider / API keys — it just calls
// `window.api.ai.summarize(filePath)` etc.
import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  validateVaultPath,
  getCurrentVaultPath,
  atomicWrite,
  exists,
} from './utils';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import {
  summarize,
  autoTag,
  optimizeMarkdown,
  learningCoach,
  generateCanvas,
  analyzeVault,
} from '../ai/agents';
import type { AgentContext, LearningCoachResult, LearningSourceKind } from '../ai/agents';

const PAPERS_DIR = 'Papers';
const BOOKS_DIR = 'Books';

async function buildAgentContext(): Promise<AgentContext> {
  const settings = await loadSettings();
  const provider = settings.aiProvider ?? 'claude';
  const apiKey = await loadSelectedAiApiKey(settings);
  return {
    provider,
    authMode: settings.aiAuthMode,
    apiKey: apiKey ?? undefined,
    model: selectedAiModel(settings),
  };
}

/**
 * Heuristic: a note is treated as a "paper" if its path is under `Papers/`
 * OR its frontmatter has `type: paper`. Lectures (科目別 ノート) are anything
 * else under a subject directory. The agent uses this to pick the right
 * tone (academic vs lecture summary).
 */
function classifyKind(filePath: string, meta: Record<string, unknown>): 'paper' | 'lecture' | 'note' {
  const lower = filePath.toLowerCase();
  if (lower.includes(`\\${PAPERS_DIR.toLowerCase()}\\`) || lower.includes(`/${PAPERS_DIR.toLowerCase()}/`)) {
    return 'paper';
  }
  if (meta && (meta as { type?: string }).type === 'paper') return 'paper';
  if (meta && (meta as { type?: string }).type === 'lecture') return 'lecture';
  return 'note';
}

export function classifyLearningKind(
  filePath: string,
  meta: Record<string, unknown>,
  requested?: string
): LearningSourceKind {
  if (requested === 'book' || requested === 'paper' || requested === 'lecture') return requested;
  const lower = filePath.toLowerCase();
  if (lower.includes(`\\${BOOKS_DIR.toLowerCase()}\\`) || lower.includes(`/${BOOKS_DIR.toLowerCase()}/`)) {
    return 'book';
  }
  if (lower.includes(`\\${PAPERS_DIR.toLowerCase()}\\`) || lower.includes(`/${PAPERS_DIR.toLowerCase()}/`)) {
    return 'paper';
  }
  if (meta && (meta as { type?: string }).type === 'book') return 'book';
  if (meta && (meta as { type?: string }).type === 'paper') return 'paper';
  return 'lecture';
}

function learningResultToMarkdown(result: LearningCoachResult): string {
  const concepts = result.keyConcepts.map((c) => {
    const confidence = c.confidence ? ` (${c.confidence})` : '';
    return `- **${c.term}**${confidence}: ${c.explanation}`;
  });
  const quiz = result.quiz.map((q, i) => {
    const difficulty = q.difficulty ? ` / ${q.difficulty}` : '';
    return `${i + 1}. ${q.question}${difficulty}\n   - 答え: ${q.answer}`;
  });
  const notes = result.suggestedNotes.map((n) => `- [[${n.title}]]: ${n.reason}`);
  return [
    '<!-- ai:learning:start -->',
    '## AI理解支援',
    '',
    '### 診断',
    '',
    result.diagnosis,
    '',
    '### 重要概念',
    ...concepts,
    '',
    '### 誤解しやすい点',
    ...result.misconceptions.map((m) => `- ${m}`),
    '',
    '### 理解確認クイズ',
    ...quiz,
    '',
    '### 次にやること',
    ...result.nextActions.map((a) => `- ${a}`),
    '',
    '### 作るとよい関連ノート',
    ...notes,
    '<!-- ai:learning:end -->',
  ].join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAgentsHandlers(): Record<string, (...args: any[]) => any> {
  return {
    /**
     * Summarize the note at `filePath`. Returns the structured result without
     * writing to disk. The renderer can preview it and the user opts in to
     * apply via `ai:summarizeAndApply`.
     */
    'ai:summarize': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const kind = classifyKind(filePath, meta as Record<string, unknown>);
      const ctx = await buildAgentContext();
      return summarize(ctx, { kind, title, body });
    },

    /**
     * Run summarize and write the result back into the note:
     *  - `summary` lands in frontmatter (1-line)
     *  - "## 概要" / "## 主要貢献" / "## 未解決の問い" sections are inserted
     *    at the top of the body if not already present.
     * Source body is preserved.
     */
    'ai:summarizeAndApply': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const kind = classifyKind(filePath, meta as Record<string, unknown>);
      const ctx = await buildAgentContext();
      const r = await summarize(ctx, { kind, title, body });
      if (!r.ok) return r;
      const newMeta = {
        ...(meta as Record<string, unknown>),
        summary: r.result.oneLiner,
      };
      // Build the AI block, marked so we don't duplicate on re-runs.
      const aiBlock = [
        '<!-- ai:summary:start -->',
        '## 概要 (AI 要約)',
        '',
        r.result.overview,
        '',
        '## 主要貢献',
        ...r.result.contributions.map((c) => `- ${c}`),
        '',
        '## 未解決の問い',
        ...r.result.openQuestions.map((q) => `- ${q}`),
        '<!-- ai:summary:end -->',
      ].join('\n');
      // Replace any prior AI block; otherwise prepend.
      const stripped = body.replace(
        /<!-- ai:summary:start -->[\s\S]*?<!-- ai:summary:end -->\n?/,
        ''
      );
      const newBody = `${aiBlock}\n\n${stripped}`;
      await atomicWrite(filePath, stringifyFrontmatter(newMeta, newBody));
      return { ok: true, result: r.result };
    },

    /**
     * Suggest tags for the note. Does not write — the renderer shows the
     * proposal and the user decides.
     */
    'ai:autoTag': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const existing = Array.isArray((meta as { tags?: unknown }).tags)
        ? ((meta as { tags?: unknown }).tags as string[])
        : [];
      const ctx = await buildAgentContext();
      return autoTag(ctx, { title, body, existingTags: existing });
    },

    /**
     * Apply the suggested tags by merging them into frontmatter. Caller passes
     * the tags it wants to keep (renderer-side checkbox UI).
     */
    'ai:applyTags': async (_e: unknown, filePath: string, tags: string[]) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const existing = Array.isArray((meta as { tags?: unknown }).tags)
        ? ((meta as { tags?: unknown }).tags as string[])
        : [];
      const merged = Array.from(new Set([...existing, ...tags.filter((t) => typeof t === 'string')]));
      const newMeta = { ...(meta as Record<string, unknown>), tags: merged };
      await atomicWrite(filePath, stringifyFrontmatter(newMeta, body));
      return { ok: true, tags: merged };
    },

    /**
     * Obsidian-Skill #1: optimize Markdown (callouts + frontmatter + wikilinks).
     * Produces optimized text without writing — preview before commit.
     */
    'ai:optimizeMarkdown': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const ctx = await buildAgentContext();
      return optimizeMarkdown(ctx, { title, body });
    },

    /**
     * Obsidian-Skill #4: generate a canvas (mind-map) JSON from the note's text.
     * The renderer can hand the result to the existing CanvasView.
     */
    'ai:generateCanvas': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const ctx = await buildAgentContext();
      return generateCanvas(ctx, { title, body });
    },

    /**
     * Source-specific comprehension coach. Unlike `summarize`, this is tuned
     * for learning workflows: books, papers, and lectures each get a different
     * prompt but return the same JSON contract for the renderer.
     */
    'ai:learningCoach': async (_e: unknown, filePath: string, requestedKind?: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const kind = classifyLearningKind(filePath, meta as Record<string, unknown>, requestedKind);
      const ctx = await buildAgentContext();
      return learningCoach(ctx, { kind, title, body });
    },

    /**
     * Run learningCoach and persist the structured result as an Obsidian-friendly
     * Markdown block. Re-runs replace the prior AI block instead of duplicating it.
     */
    'ai:learningCoachAndSave': async (_e: unknown, filePath: string, requestedKind?: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'file not found' };
      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title =
        (typeof meta.title === 'string' && meta.title) ||
        path.basename(filePath, path.extname(filePath));
      const kind = classifyLearningKind(filePath, meta as Record<string, unknown>, requestedKind);
      const ctx = await buildAgentContext();
      const r = await learningCoach(ctx, { kind, title, body });
      if (!r.ok) return r;
      const block = learningResultToMarkdown(r.result);
      const stripped = body.replace(
        /<!-- ai:learning:start -->[\s\S]*?<!-- ai:learning:end -->\n?/,
        ''
      );
      await atomicWrite(filePath, stringifyFrontmatter(meta as Record<string, unknown>, `${block}\n\n${stripped}`));
      return { ok: true, result: r.result, kind };
    },

    /**
     * Obsidian-Skill #5: analyze the entire vault for orphans + tag frequency
     * + improvement suggestions. Heavy operation; the renderer should debounce
     * and show progress.
     */
    'ai:analyzeVault': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);

      // Collect a digest of the vault: every .md file, with its tags +
      // outgoing wikilinks. We avoid sending full contents to the AI.
      const samples: { fileName: string; tags: string[]; outgoingLinks: string[] }[] = [];

      async function walk(dir: string, depth = 0): Promise<void> {
        if (depth > 6) return; // safety: don't recurse forever
        let entries: import('fs').Dirent[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          if (ent.name.startsWith('.')) continue; // .trash, .history, .obsidian
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            await walk(full, depth + 1);
            continue;
          }
          if (!ent.name.endsWith('.md')) continue;
          try {
            const raw = await fs.readFile(full, 'utf-8');
            const { meta, body } = parseFrontmatter(raw);
            const tags = Array.isArray((meta as { tags?: unknown }).tags)
              ? ((meta as { tags?: unknown }).tags as string[]).filter(
                  (t) => typeof t === 'string'
                )
              : [];
            const wikilinks = Array.from(body.matchAll(/\[\[([^\]|#]+)/g)).map((m) =>
              m[1].trim()
            );
            samples.push({
              fileName: ent.name.replace(/\.md$/, ''),
              tags,
              outgoingLinks: wikilinks,
            });
          } catch {
            // skip unreadable
          }
        }
      }

      await walk(root);
      const ctx = await buildAgentContext();
      return analyzeVault(ctx, { samples });
    },
  };
}

export function registerAgentsHandlers() {
  const handlers = createAgentsHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
