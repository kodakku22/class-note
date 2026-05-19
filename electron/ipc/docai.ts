// IPC bindings for the DocAI agents (electron/ai/docai.ts).
//
// Channels (all kebab-case + camelCase, matching the existing qa:* / ai:*
// conventions):
//   docai:summarize         (invoke)   — single-doc summary
//   docai:ask               (invoke + stream events) — single-doc Q&A
//   docai:askMulti          (invoke + stream events) — multi-doc Q&A
//   docai:multiAnalyze      (invoke)   — multi-doc analysis (Wave 2 surface)
//   docai:generate          (invoke)   — content generation
//   docai:getChunks         (invoke)   — debug / preview
//
// Stream events (main → renderer, sent via win.webContents.send):
//   docai:chunk             { text }
//   docai:citations         { citations }
//   docai:done              { text, citations, usage }
//   docai:error             { error }
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  atomicWrite,
  ensureDir,
  exists,
  getCurrentVaultPath,
  sanitizeForPrompt,
  validateVaultPath,
} from './utils';
import { parseFrontmatter } from './frontmatter';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import { extractPdfTextFromBuffer, imageOnlyPdfError } from '../pdf-text';
import { getVaultIndex, getVaultIndexStatus } from '../vault-index';
import { track } from '../telemetry';
import {
  buildDocumentChunks,
  type ChunkableDocument,
  type DocumentChunk,
} from '../ai/chunker';
import { retrieveContext, retrieveMultiDocContext, type RetrievedChunk } from '../ai/context-retriever';
import {
  contentGenerator,
  documentQA,
  multiDocAnalysis,
  smartSummary,
  type Citation,
  type ContentFormat,
  type MultiDocAnalysisMode,
  type SummaryMode,
} from '../ai/docai';
import type { AgentContext } from '../ai/agents';
import { logger } from '../logger';

const DOCAI_LOG_DIR = '.classnotes/docai';

/**
 * Hard ceiling on per-file size for DocAI operations. PDFs above this are
 * rejected before being loaded into memory to prevent OOM. Users can adjust
 * via `Settings.docaiMaxFileSizeMB`; the value below is the absolute backstop.
 */
const DEFAULT_DOCAI_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

async function maxDocAIFileBytes(): Promise<number> {
  try {
    const s = await loadSettings();
    const mb = (s as { docaiMaxFileSizeMB?: number }).docaiMaxFileSizeMB;
    if (typeof mb === 'number' && Number.isFinite(mb) && mb >= 1 && mb <= 500) {
      return mb * 1024 * 1024;
    }
  } catch {}
  return DEFAULT_DOCAI_MAX_FILE_BYTES;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildAgentContext(): Promise<AgentContext | { error: string }> {
  const settings = await loadSettings();
  const provider = settings.aiProvider ?? 'claude';
  if (provider === 'none') {
    return { error: 'AI 機能が無効です。Settings から有効にしてください。' };
  }
  const apiKey = await loadSelectedAiApiKey(settings);
  if (settings.aiAuthMode === 'api-key' && !apiKey) {
    return { error: 'API キーが未設定です。Settings で登録してください。' };
  }
  return {
    provider,
    authMode: settings.aiAuthMode,
    apiKey: apiKey ?? undefined,
    model: selectedAiModel(settings),
  };
}

function isAgentError(c: AgentContext | { error: string }): c is { error: string } {
  return 'error' in c;
}

/**
 * Sanitize a frontmatter-derived string before it is embedded in any prompt.
 * Even though chunk content is sanitized later, frontmatter values flow into
 * `metadata.title` / `metadata.tags` and surface directly in agent prompts
 * (e.g. `[出典 N] {source}#{section}`). Without this guard a malicious note
 * can embed code fences or unbounded text.
 */
function sanitizeMetaString(raw: unknown, maxLen = 200): string {
  if (typeof raw !== 'string') return '';
  return sanitizeForPrompt(raw, maxLen);
}

async function readChunkableDocument(
  filePath: string
): Promise<{ ok: true; doc: ChunkableDocument } | { ok: false; error: string }> {
  if (!(await exists(filePath))) return { ok: false, error: 'file not found' };

  // Reject oversized files BEFORE loading them into memory.
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) return { ok: false, error: 'file not found' };
  const maxBytes = await maxDocAIFileBytes();
  if (stat.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `ファイルが大きすぎます (${mb}MB 上限)` };
  }

  const ext = path.extname(filePath).toLowerCase();
  const relPath = path.basename(filePath);
  if (ext === '.md' || ext === '.markdown') {
    const raw = await fs.readFile(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const titleRaw =
      (typeof meta.title === 'string' && meta.title) ||
      path.basename(filePath, ext);
    const title = sanitizeMetaString(titleRaw);
    const rawTags = Array.isArray(meta.tags)
      ? (meta.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : typeof meta.tags === 'string'
        ? [meta.tags]
        : [];
    const tags = rawTags.map((t) => sanitizeMetaString(t, 60)).filter(Boolean).slice(0, 20);
    return { ok: true, doc: { kind: 'note', relPath, title, tags, body } };
  }
  if (ext === '.pdf') {
    const buf = await fs.readFile(filePath);
    const extracted = await extractPdfTextFromBuffer(buf).catch(() => null);
    if (!extracted || !extracted.text.trim()) {
      return { ok: false, error: imageOnlyPdfError() };
    }
    return {
      ok: true,
      doc: {
        kind: 'pdf',
        relPath,
        title: sanitizeMetaString(path.basename(filePath, ext)),
        tags: [],
        extractedText: extracted.text,
      },
    };
  }
  return { ok: false, error: `未対応のファイル形式: ${ext}` };
}

/** Phase 4 (N-3): Per-month log file + size-based rotation.
 * - Active log: `.classnotes/docai/log.md` (current month)
 * - Archived:   `.classnotes/docai/log-YYYY-MM.md` (rotated at month boundary)
 *
 * Additionally cap the active log at MAX_DOCAI_LOG_BYTES so a single heavy day
 * doesn't blow up the file. When the cap is hit, the oldest entries are
 * dropped (keeping the most recent half). The discarded portion is moved to
 * `log-overflow-{timestamp}.md` so nothing is silently lost. */
const MAX_DOCAI_LOG_BYTES = 5 * 1024 * 1024; // 5 MB per active log
const DOCAI_LOG_RETAIN_RATIO = 0.5; // when rotating, keep the most recent 50%

async function appendDocAILog(
  vaultRoot: string,
  filePath: string,
  question: string,
  answer: string,
  citations: Citation[]
): Promise<void> {
  try {
    const dir = path.join(vaultRoot, DOCAI_LOG_DIR);
    await ensureDir(dir);
    const logFile = path.join(dir, 'log.md');
    validateVaultPath(logFile, vaultRoot);

    let existing = '';
    let existingMtimeMs = 0;
    try {
      existing = await fs.readFile(logFile, 'utf-8');
      const stat = await fs.stat(logFile);
      existingMtimeMs = stat.mtimeMs;
    } catch {
      existing = '# DocAI Q&A ログ\n\n';
    }

    // Month-boundary rotation: if the existing log's mtime is from a prior
    // calendar month, archive it before appending today's entry.
    if (existingMtimeMs > 0) {
      const lastDate = new Date(existingMtimeMs);
      const now = new Date();
      if (
        lastDate.getUTCFullYear() !== now.getUTCFullYear() ||
        lastDate.getUTCMonth() !== now.getUTCMonth()
      ) {
        const ym = `${lastDate.getUTCFullYear()}-${String(lastDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const archived = path.join(dir, `log-${ym}.md`);
        try {
          await fs.rename(logFile, archived);
          existing = '# DocAI Q&A ログ\n\n';
        } catch {
          // archive failed — keep appending to current file rather than data-loss
        }
      }
    }

    // Size-based rotation: if appending would exceed the cap, trim oldest half
    // and stash it in an overflow archive.
    const ts = new Date().toISOString();
    const citeBlock = citations
      .map((c) => `  - [${c.id}] ${c.source}#${c.section}${c.pageNumber ? ` (p.${c.pageNumber})` : ''}`)
      .join('\n');
    const block = `## ${ts} — ${path.basename(filePath)}\n\n**Q:** ${question}\n\n**A:**\n${answer}\n\n${citeBlock ? `**出典:**\n${citeBlock}\n\n` : ''}---\n\n`;

    if (Buffer.byteLength(existing + block, 'utf-8') > MAX_DOCAI_LOG_BYTES) {
      // Split on Q&A entry boundary (`---\n\n`), keep most recent half.
      const entries = existing.split(/^---\s*$/m);
      const head = entries[0]; // header
      const records = entries.slice(1);
      const keepCount = Math.max(1, Math.floor(records.length * DOCAI_LOG_RETAIN_RATIO));
      const overflow = records.slice(0, records.length - keepCount).join('---\n');
      const kept = records.slice(records.length - keepCount).join('---\n');
      const overflowFile = path.join(dir, `log-overflow-${Date.now()}.md`);
      try {
        await fs.writeFile(overflowFile, head + overflow, 'utf-8');
      } catch {
        // overflow archive failed — proceed with trim anyway to preserve cap
      }
      existing = head + kept;
    }

    await atomicWrite(logFile, existing + block);
  } catch (err) {
    logger.warn('[docai] failed to append log', err);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDocAIHandlers(): Record<string, (...args: any[]) => any> {
  return {
    /**
     * Enumerate all DocAI-eligible files (.md / .pdf) in the active vault,
     * sorted by mtime descending. Used by MultiDocPicker. Returns
     * `indexNotReady: true` when the VaultIndex hasn't been built yet so the
     * UI can prompt the user to rebuild.
     */
    'docai:listVaultFiles': async (
      _e: unknown,
      vaultPath: string
    ): Promise<{
      ok: boolean;
      files?: Array<{ relPath: string; absPath: string; title: string; kind: 'note' | 'pdf'; mtimeMs: number; tags: string[] }>;
      indexNotReady?: boolean;
      builtAt?: string;
      error?: string;
    }> => {
      try {
        const root = path.resolve(vaultPath);
        validateVaultPath(root, root);
        const status = await getVaultIndexStatus(root);
        if (!status.ready) {
          // Build it lazily, but flag the UI so the user can choose to rebuild.
          // (We still return the freshly-built result rather than failing.)
        }
        const index = await getVaultIndex(root);
        const files = index.files
          .filter((f) => f.kind === 'note' || f.kind === 'pdf')
          .sort((a, b) => b.mtimeMs - a.mtimeMs)
          .map((f) => ({
            relPath: f.relPath,
            absPath: path.join(root, f.relPath),
            title: f.title,
            kind: f.kind as 'note' | 'pdf',
            mtimeMs: f.mtimeMs,
            tags: f.tags,
          }));
        return {
          ok: true,
          files,
          indexNotReady: !status.ready,
          builtAt: status.builtAt,
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    /**
     * Return the chunks that the chunker would produce for a single document.
     * Used for debugging / preview UI; cheap, no AI call.
     */
    'docai:getChunks': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      const docResult = await readChunkableDocument(filePath);
      if (!docResult.ok) return docResult;
      const chunks = buildDocumentChunks(docResult.doc);
      return { ok: true, chunks };
    },

    /**
     * Summarize a single document with the smartSummary agent.
     * Returns the structured SmartSummaryResult, no streaming.
     */
    'docai:summarize': async (
      _e: unknown,
      filePath: string,
      options?: { mode?: SummaryMode; count?: number; targetSection?: string; audience?: 'beginner' | 'researcher' | 'general' }
    ) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      const ctx = await buildAgentContext();
      if (isAgentError(ctx)) return { ok: false, error: ctx.error };
      const docResult = await readChunkableDocument(filePath);
      if (!docResult.ok) return docResult;
      const chunks = buildDocumentChunks(docResult.doc);
      const start = Date.now();
      const result = await smartSummary(ctx, {
        chunks,
        mode: options?.mode ?? 'keypoints',
        count: options?.count,
        targetSection: options?.targetSection,
        audience: options?.audience,
      });
      void track('docai_summary', {
        mode: options?.mode ?? 'keypoints',
        ok: result.ok,
        durationMs: Date.now() - start,
      });
      return result;
    },

    /**
     * Ask a question about a single document with streaming.
     * Sends docai:chunk during streaming and docai:done at the end.
     */
    'docai:ask': async (
      e: IpcMainInvokeEvent,
      filePath: string,
      question: string
    ) => {
      const root = getCurrentVaultPath();
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!root) return { ok: false, error: 'no active vault' };
      if (!win) return { ok: false, error: 'window not available' };
      validateVaultPath(filePath, root);

      const safeQuestion = sanitizeForPrompt(question, 2000);
      if (!safeQuestion.trim()) {
        win.webContents.send('docai:error', { error: '質問が空です' });
        return { ok: false, error: 'empty question' };
      }

      const ctx = await buildAgentContext();
      if (isAgentError(ctx)) {
        win.webContents.send('docai:error', { error: ctx.error });
        return { ok: false, error: ctx.error };
      }
      const docResult = await readChunkableDocument(filePath);
      if (!docResult.ok) {
        win.webContents.send('docai:error', { error: docResult.error });
        return docResult;
      }
      const chunks = buildDocumentChunks(docResult.doc);
      const retrieved: RetrievedChunk[] = retrieveContext(safeQuestion, chunks, 5);

      // Eagerly emit the candidate citations so the UI can render the source
      // panel before the answer text starts streaming.
      const provisionalCitations: Citation[] = retrieved.map((rc, i) => ({
        id: i + 1,
        source: rc.chunk.source,
        section: rc.chunk.section,
        excerpt: rc.chunk.content.slice(0, 120).replace(/\s+/g, ' ').trim(),
        pageNumber: rc.chunk.pageNumber,
        startLine: rc.chunk.startLine,
      }));
      win.webContents.send('docai:citations', { citations: provisionalCitations });

      const start = Date.now();
      const result = await documentQA(ctx, {
        question: safeQuestion,
        contextChunks: retrieved,
        onEvent: (ev) => {
          if (ev.type === 'chunk') {
            win.webContents.send('docai:chunk', { text: ev.text });
          } else if (ev.type === 'error') {
            win.webContents.send('docai:error', { error: ev.error });
          }
        },
      });
      void track('docai_ask', {
        isMultiDoc: false,
        chunkCount: retrieved.length,
        durationMs: Date.now() - start,
        ok: result.ok,
      });
      if (!result.ok) {
        win.webContents.send('docai:error', { error: result.error });
        return result;
      }
      win.webContents.send('docai:done', {
        text: result.result.answer,
        citations: result.result.citations,
        suggestedFollowUps: result.result.suggestedFollowUps,
      });
      void appendDocAILog(root, filePath, question, result.result.answer, result.result.citations);
      return { ok: true, ...result.result };
    },

    /**
     * Multi-document Q&A. Same shape as docai:ask but accepts multiple files.
     */
    'docai:askMulti': async (
      e: IpcMainInvokeEvent,
      filePaths: string[],
      question: string
    ) => {
      const root = getCurrentVaultPath();
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!root) return { ok: false, error: 'no active vault' };
      if (!win) return { ok: false, error: 'window not available' };
      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        return { ok: false, error: 'no file paths provided' };
      }

      const safeQuestion = sanitizeForPrompt(question, 2000);
      if (!safeQuestion.trim()) {
        win.webContents.send('docai:error', { error: '質問が空です' });
        return { ok: false, error: 'empty question' };
      }

      const ctx = await buildAgentContext();
      if (isAgentError(ctx)) {
        win.webContents.send('docai:error', { error: ctx.error });
        return { ok: false, error: ctx.error };
      }

      const chunkMap = new Map<string, DocumentChunk[]>();
      for (const fp of filePaths) {
        try {
          validateVaultPath(fp, root);
          const docResult = await readChunkableDocument(fp);
          if (docResult.ok) chunkMap.set(fp, buildDocumentChunks(docResult.doc));
        } catch (err) {
          logger.warn('[docai.askMulti] skipping invalid path', fp, err);
        }
      }
      if (chunkMap.size === 0) {
        win.webContents.send('docai:error', { error: '読み込めるファイルがありませんでした' });
        return { ok: false, error: 'no usable files' };
      }
      const retrieved = retrieveMultiDocContext(safeQuestion, chunkMap, 8);
      win.webContents.send('docai:citations', {
        citations: retrieved.map((rc, i) => ({
          id: i + 1,
          source: rc.chunk.source,
          section: rc.chunk.section,
          excerpt: rc.chunk.content.slice(0, 120),
          pageNumber: rc.chunk.pageNumber,
          startLine: rc.chunk.startLine,
        })),
      });
      const start = Date.now();
      const result = await documentQA(ctx, {
        question: safeQuestion,
        contextChunks: retrieved,
        onEvent: (ev) => {
          if (ev.type === 'chunk') win.webContents.send('docai:chunk', { text: ev.text });
          else if (ev.type === 'error') win.webContents.send('docai:error', { error: ev.error });
        },
      });
      void track('docai_ask', {
        isMultiDoc: true,
        chunkCount: retrieved.length,
        docCount: chunkMap.size,
        durationMs: Date.now() - start,
        ok: result.ok,
      });
      if (!result.ok) {
        win.webContents.send('docai:error', { error: result.error });
        return result;
      }
      win.webContents.send('docai:done', {
        text: result.result.answer,
        citations: result.result.citations,
        suggestedFollowUps: result.result.suggestedFollowUps,
      });
      return { ok: true, ...result.result };
    },

    /**
     * Multi-document analysis (compare / synthesize / presentation).
     * Returns the structured MultiDocAnalysisResult, no streaming.
     */
    'docai:multiAnalyze': async (
      _e: unknown,
      filePaths: string[],
      mode: MultiDocAnalysisMode = 'compare'
    ) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        return { ok: false, error: 'no file paths provided' };
      }
      const ctx = await buildAgentContext();
      if (isAgentError(ctx)) return { ok: false, error: ctx.error };

      const chunkMap = new Map<string, DocumentChunk[]>();
      for (const fp of filePaths) {
        try {
          validateVaultPath(fp, root);
          const docResult = await readChunkableDocument(fp);
          if (docResult.ok) chunkMap.set(fp, buildDocumentChunks(docResult.doc));
        } catch {
          // skip invalid paths silently
        }
      }
      // For analysis we pass ALL chunks (capped) rather than a retrieved subset.
      const all: DocumentChunk[] = [];
      for (const arr of chunkMap.values()) all.push(...arr);
      const cappedRetrieved = all.slice(0, 20).map((chunk, i) => ({
        chunk,
        score: 1,
        normalizedScore: 1,
        confidence: 'high' as const,
        citationLabel: `[出典 ${i + 1}]`,
      }));
      const start = Date.now();
      const result = await multiDocAnalysis(ctx, { contextChunks: cappedRetrieved, mode });
      void track('docai_multi_analyze', {
        docCount: chunkMap.size,
        mode,
        durationMs: Date.now() - start,
        ok: result.ok,
      });
      return result;
    },

    /**
     * Generate content (email / report / etc) based on a single document.
     */
    'docai:generate': async (
      _e: unknown,
      filePath: string,
      format: ContentFormat,
      instruction: string
    ) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      validateVaultPath(filePath, root);
      const ctx = await buildAgentContext();
      if (isAgentError(ctx)) return { ok: false, error: ctx.error };
      const docResult = await readChunkableDocument(filePath);
      if (!docResult.ok) return docResult;
      const chunks = buildDocumentChunks(docResult.doc);
      const retrieved = retrieveContext(instruction || 'overview', chunks, 6);
      const start = Date.now();
      const result = await contentGenerator(ctx, {
        contextChunks: retrieved.length > 0
          ? retrieved
          : chunks.slice(0, 6).map((chunk, i) => ({
              chunk,
              score: 1,
              normalizedScore: 1,
              confidence: 'high' as const,
              citationLabel: `[出典 ${i + 1}]`,
            })),
        format,
        instruction,
      });
      void track('docai_generate', {
        format,
        wordCount: result.ok ? result.result.wordCount : 0,
        durationMs: Date.now() - start,
        ok: result.ok,
      });
      return result;
    },
  };
}

export function registerDocAIHandlers(): void {
  const handlers = createDocAIHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
