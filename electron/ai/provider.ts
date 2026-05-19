// Global AI provider abstraction.
//
// Supported targets:
//   - OpenAI API: Responses API
//   - OpenAI login: Codex CLI (`codex --login`, then `codex exec`)
//   - Gemini API: Generative Language API streamGenerateContent
//   - Gemini login: Gemini CLI headless mode, with Google ADC fallback
//   - Claude API: Anthropic Messages API
//   - Claude login: Claude Code CLI
//
// This module is the single main-process entry point for model calls. Renderer
// code never receives API keys or OAuth tokens.
import { execFile, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { findClaudePath, findCodexPath, findGcloudPath, findGeminiPath } from '../ipc/utils';
import { logger } from '../logger';
import { CircuitOpenError, RetryableHttpError, withResilience } from '../net/resilience';

export type AiProviderKind = 'openai' | 'gemini' | 'claude' | 'none';
export type AiAuthMode = 'api-key' | 'login';
export type LegacyProviderKind = 'claude-cli' | 'anthropic-api';
export type ProviderKind = AiProviderKind | LegacyProviderKind;

export type StreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'error'; error: string };

export type TokenUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  costUsdMicro?: number;
};

export type RunOptions = {
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  timeoutMs?: number;
  onEvent?: (e: StreamEvent) => void;
  authMode?: AiAuthMode;
  model?: string;
  apiKey?: string;
  maxRetries?: number;
  documents?: Array<{
    base64: string;
    mediaType: 'application/pdf';
    fileName?: string;
  }>;
};

export type RunResult = { ok: true; text: string; usage?: TokenUsage } | { ok: false; error: string };

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_CLAUDE_API_MODEL = 'claude-sonnet-4-6';
type FetchInit = Parameters<typeof fetch>[1];

/**
 * Model catalogue.
 *
 * Phase 4 (S-A): each entry can optionally carry a `deprecation` field
 * indicating that the upstream provider has scheduled or announced sunset.
 * The Settings UI consumes this to show a yellow/red badge so users aren't
 * surprised when the API starts returning 410 Gone.
 *
 * Maintenance policy: when a provider announces deprecation, add the
 * `deprecation` object here in the same PR that the announcement is observed.
 * `since` is the date the provider notified, `removeOn` is the published
 * sunset date (or null if not announced).
 */
export type ModelDeprecation = {
  /** ISO date the deprecation was announced (when we first knew). */
  since: string;
  /** ISO date when the model will stop serving requests. null = TBD. */
  removeOn: string | null;
  /** Recommended replacement model id (same provider). */
  replacement?: string;
  /** Free-form short note shown in UI. */
  note: string;
};

export type ModelEntry = {
  id: string;
  label: string;
  sub: string;
  deprecation?: ModelDeprecation;
};

export const OPENAI_MODELS: ReadonlyArray<ModelEntry> = [
  { id: 'gpt-5.5', label: 'GPT-5.5', sub: '最新 frontier / Responses API' },
  { id: 'gpt-5.4', label: 'GPT-5.4', sub: '高性能・やや低コスト' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', sub: '高速・低コスト' },
];

export const GEMINI_MODELS: ReadonlyArray<ModelEntry> = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', sub: '最新 Pro / PDF対応' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', sub: '高速・低コスト' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', sub: '安定系 Pro' },
];

export const ANTHROPIC_MODELS: ReadonlyArray<ModelEntry> = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', sub: '推奨 — バランス' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', sub: '最高性能・高コスト' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', sub: '高速・低コスト' },
];

export const CLAUDE_LOGIN_MODELS: ReadonlyArray<ModelEntry> = [
  { id: 'sonnet', label: 'Sonnet', sub: 'Claude Code alias / 推奨' },
  { id: 'opus', label: 'Opus', sub: 'Claude Code alias / 高性能' },
  { id: 'haiku', label: 'Haiku', sub: 'Claude Code alias / 高速' },
];

/** Aggregate of all known models for cross-provider lookup. */
export const ALL_MODELS: ReadonlyArray<ModelEntry> = [
  ...OPENAI_MODELS,
  ...GEMINI_MODELS,
  ...ANTHROPIC_MODELS,
  ...CLAUDE_LOGIN_MODELS,
];

/** Look up a model entry by id (across all providers). */
export function findModelEntry(id: string): ModelEntry | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

/** Return a deprecation record if the model is sunset / scheduled. null otherwise. */
export function modelDeprecation(id: string): ModelDeprecation | null {
  const entry = findModelEntry(id);
  return entry?.deprecation ?? null;
}

/** Severity bucket for UI badges. Computed from `removeOn` distance to now. */
export type ModelDeprecationSeverity = 'past' | 'imminent' | 'scheduled' | 'announced';

export function modelDeprecationSeverity(d: ModelDeprecation, now: Date = new Date()): ModelDeprecationSeverity {
  if (!d.removeOn) return 'announced';
  const target = new Date(d.removeOn).getTime();
  const ms = target - now.getTime();
  if (ms < 0) return 'past';
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 30) return 'imminent';
  return 'scheduled';
}

function normalizeTarget(
  provider: ProviderKind,
  authMode?: AiAuthMode
): { provider: AiProviderKind; authMode: AiAuthMode } {
  if (provider === 'anthropic-api') return { provider: 'claude', authMode: 'api-key' };
  if (provider === 'claude-cli') return { provider: 'claude', authMode: 'login' };
  if (provider === 'none') return { provider: 'none', authMode: authMode ?? 'login' };
  return { provider, authMode: authMode ?? 'api-key' };
}

// Phase 3-G: Offline mode flag. ipc/settings.ts calls setOfflineMode() on
// load and on settings change. Defaults to false so existing behaviour is
// preserved if the IPC layer never wires it.
let offlineMode = false;
export function setOfflineMode(value: boolean): void {
  offlineMode = Boolean(value);
}
export function isOfflineMode(): boolean {
  return offlineMode;
}

export async function runPrompt(provider: ProviderKind, opts: RunOptions): Promise<RunResult> {
  if (offlineMode) {
    const error = 'オフラインモードが有効です (Settings → オフラインモード を OFF にしてください)';
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }
  const target = normalizeTarget(provider, opts.authMode);
  if (target.provider === 'none') {
    return { ok: false, error: 'AI 機能が無効になっています (Settings から有効にしてください)' };
  }
  if (target.provider === 'claude' && target.authMode === 'api-key') return runViaAnthropicApi(opts);
  if (target.provider === 'claude' && target.authMode === 'login') return runViaClaudeCli(opts);
  if (target.provider === 'openai' && target.authMode === 'api-key') return runViaOpenAiApi(opts);
  if (target.provider === 'openai' && target.authMode === 'login') return runViaCodexCli(opts);
  if (target.provider === 'gemini' && target.authMode === 'api-key') return runViaGeminiApi(opts);
  if (target.provider === 'gemini' && target.authMode === 'login') return runViaGeminiLogin(opts);
  return { ok: false, error: '未対応の AI 設定です' };
}

async function fetchWithTimeout(
  url: string,
  init: FetchInit,
  timeoutMs: number,
  maxRetries: number,
  resilienceKey: string
): Promise<{ response: Response | null; error?: string }> {
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  };
  try {
    const response = await withResilience(
      resilienceKey,
      async () => {
        clearWatchdog();
        timedOut = false;
        const ctrl = new AbortController();
        watchdog = setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, timeoutMs);
        const r = await fetch(url, { ...init, signal: ctrl.signal });
        if (!r.ok && (r.status === 429 || r.status >= 500)) {
          clearWatchdog();
          throw new RetryableHttpError(r.status);
        }
        return r;
      },
      {
        maxRetries,
        baseDelayMs: 500,
        maxDelayMs: 5_000,
        circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 },
      }
    );
    return { response };
  } catch (err) {
    clearWatchdog();
    if (timedOut) return { response: null, error: 'タイムアウト' };
    if (err instanceof CircuitOpenError) {
      return { response: null, error: 'API が連続して失敗したため、一時的に呼び出しを停止しています' };
    }
    return { response: null, error: `ネットワークエラー: ${String(err)}` };
  } finally {
    clearWatchdog();
  }
}

async function parseSse(
  response: Response,
  onData: (obj: Record<string, unknown>) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ストリームを開けませんでした');
  const decoder = new TextDecoder('utf-8');
  let buffered = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const events = buffered.split('\n\n');
    buffered = events.pop() ?? '';
    for (const ev of events) {
      const dataLines = ev
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, '').trim());
      if (dataLines.length === 0) continue;
      const json = dataLines.join('\n');
      if (!json || json === '[DONE]') continue;
      try {
        onData(JSON.parse(json) as Record<string, unknown>);
      } catch {
        // Skip malformed event fragments.
      }
    }
  }
}

async function responseError(response: Response | null, fallback?: string): Promise<string> {
  if (!response) return fallback || 'API 呼出に失敗しました';
  let body = '';
  try {
    body = await response.text();
  } catch {}
  return `API エラー (${response.status}): ${body.slice(0, 300)}`;
}

async function runViaAnthropicApi(opts: RunOptions): Promise<RunResult> {
  if (!opts.apiKey) return { ok: false, error: 'Anthropic API キーが設定されていません' };
  const model = opts.model ?? DEFAULT_CLAUDE_API_MODEL;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let userContent: unknown = opts.prompt;
  if (opts.documents?.length) {
    const blocks: Array<Record<string, unknown>> = opts.documents.map((doc) => ({
      type: 'document',
      source: {
        type: 'base64',
        media_type: doc.mediaType,
        data: doc.base64,
      },
    }));
    blocks.push({ type: 'text', text: opts.prompt });
    userContent = blocks;
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: true,
    messages: [{ role: 'user', content: userContent }],
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;

  const { response, error: fetchError } = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    timeout,
    opts.maxRetries ?? 2,
    'anthropic-api'
  );
  if (!response?.ok) {
    const error = await responseError(response, fetchError);
    logger.error('[ai-provider] Anthropic API call failed', response?.status, error);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }

  let output = '';
  const usage: TokenUsage = {};
  try {
    await parseSse(response, (obj) => {
      if (obj.type === 'content_block_delta') {
        const delta = obj.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          output += delta.text;
          opts.onEvent?.({ type: 'chunk', text: delta.text });
        }
      } else if (obj.type === 'message_delta') {
        const u = obj.usage as Record<string, number> | undefined;
        if (u) {
          usage.input = u.input_tokens;
          usage.output = u.output_tokens;
          usage.cacheRead = u.cache_read_input_tokens;
        }
      }
    });
  } catch (err) {
    const error = String(err);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }
  opts.onEvent?.({ type: 'done', usage });
  return { ok: true, text: output, usage };
}

async function runViaOpenAiApi(opts: RunOptions): Promise<RunResult> {
  if (!opts.apiKey) return { ok: false, error: 'OpenAI API キーが設定されていません' };
  const model = opts.model ?? DEFAULT_OPENAI_MODEL;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userContent: Array<Record<string, unknown>> = [
    ...(opts.documents ?? []).map((doc, index) => ({
      type: 'input_file',
      filename: doc.fileName ?? `document-${index + 1}.pdf`,
      file_data: `data:${doc.mediaType};base64,${doc.base64}`,
    })),
    { type: 'input_text', text: opts.prompt },
  ];
  const input: Array<Record<string, unknown>> = [];
  if (opts.systemPrompt) {
    input.push({ role: 'system', content: [{ type: 'input_text', text: opts.systemPrompt }] });
  }
  input.push({ role: 'user', content: userContent });
  const body = {
    model,
    input,
    stream: true,
    max_output_tokens: 8192,
  };

  const { response, error: fetchError } = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    timeout,
    opts.maxRetries ?? 2,
    'openai-api'
  );
  if (!response?.ok) {
    const error = await responseError(response, fetchError);
    logger.error('[ai-provider] OpenAI API call failed', response?.status, error);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }

  let output = '';
  const usage: TokenUsage = {};
  try {
    await parseSse(response, (obj) => {
      if (obj.type === 'response.output_text.delta' && typeof obj.delta === 'string') {
        output += obj.delta;
        opts.onEvent?.({ type: 'chunk', text: obj.delta });
      } else if (obj.type === 'response.completed') {
        const responseObj = obj.response as { usage?: Record<string, number> } | undefined;
        const u = responseObj?.usage;
        if (u) {
          usage.input = u.input_tokens;
          usage.output = u.output_tokens;
        }
      } else if (obj.type === 'response.failed') {
        const responseObj = obj.response as { error?: { message?: string } } | undefined;
        const message = responseObj?.error?.message;
        if (message) opts.onEvent?.({ type: 'error', error: message });
      }
    });
  } catch (err) {
    const error = String(err);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }
  opts.onEvent?.({ type: 'done', usage });
  return { ok: true, text: output, usage };
}

function geminiParts(opts: RunOptions): Array<Record<string, unknown>> {
  return [
    ...(opts.documents ?? []).map((doc) => ({
      inlineData: { mimeType: doc.mediaType, data: doc.base64 },
    })),
    { text: opts.prompt },
  ];
}

function getGcloudAccessToken(gcloudPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      gcloudPath,
      ['auth', 'application-default', 'print-access-token'],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const token = String(stdout ?? '').trim();
        resolve(token.length > 20 ? token : null);
      }
    );
  });
}

async function runViaGeminiApi(opts: RunOptions): Promise<RunResult> {
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse`;

  if (!opts.apiKey) return { ok: false, error: 'Gemini API キーが設定されていません' };
  url += `&key=${encodeURIComponent(opts.apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: geminiParts(opts) }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const { response, error: fetchError } = await fetchWithTimeout(
    url,
    { method: 'POST', headers, body: JSON.stringify(body) },
    timeout,
    opts.maxRetries ?? 2,
    'gemini-api'
  );
  if (!response?.ok) {
    const error = await responseError(response, fetchError);
    logger.error('[ai-provider] Gemini API call failed', response?.status, error);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }

  let output = '';
  const usage: TokenUsage = {};
  try {
    await parseSse(response, (obj) => {
      const candidates = obj.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
      const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (text) {
        output += text;
        opts.onEvent?.({ type: 'chunk', text });
      }
      const u = obj.usageMetadata as Record<string, number> | undefined;
      if (u) {
        usage.input = u.promptTokenCount;
        usage.output = u.candidatesTokenCount;
      }
    });
  } catch (err) {
    const error = String(err);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }
  opts.onEvent?.({ type: 'done', usage });
  return { ok: true, text: output, usage };
}

async function runViaGeminiLogin(opts: RunOptions): Promise<RunResult> {
  const geminiPath = await findGeminiPath();
  if (geminiPath) return runViaGeminiCli(geminiPath, opts);
  return runViaGeminiAdc(opts);
}

async function runViaGeminiAdc(opts: RunOptions): Promise<RunResult> {
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gcloudPath = await findGcloudPath();
  if (!gcloudPath) {
    return {
      ok: false,
      error: 'gemini CLI / gcloud CLI が見つかりません。Gemini CLI をインストールするか、gcloud auth application-default login を実行できる状態にしてください。',
    };
  }
  const token = await getGcloudAccessToken(gcloudPath);
  if (!token) {
    return {
      ok: false,
      error: 'Google ADC にログインしていません。gcloud auth application-default login を実行してください。',
    };
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: geminiParts(opts) }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const { response, error: fetchError } = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
    timeout,
    opts.maxRetries ?? 2,
    'gemini-oauth'
  );
  if (!response?.ok) {
    const error = await responseError(response, fetchError);
    logger.error('[ai-provider] Gemini OAuth call failed', response?.status, error);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }

  let output = '';
  const usage: TokenUsage = {};
  try {
    await parseSse(response, (obj) => {
      const candidates = obj.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
      const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (text) {
        output += text;
        opts.onEvent?.({ type: 'chunk', text });
      }
      const u = obj.usageMetadata as Record<string, number> | undefined;
      if (u) {
        usage.input = u.promptTokenCount;
        usage.output = u.candidatesTokenCount;
      }
    });
  } catch (err) {
    const error = String(err);
    opts.onEvent?.({ type: 'error', error });
    return { ok: false, error };
  }
  opts.onEvent?.({ type: 'done', usage });
  return { ok: true, text: output, usage };
}

async function runViaGeminiCli(geminiPath: string, opts: RunOptions): Promise<RunResult> {
  if (opts.documents?.length) {
    return { ok: false, error: 'Gemini CLI方式ではPDF添付を直接送れません。本文抽出後に再実行してください。' };
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classnotes-gemini-'));
  const args = ['--output-format', 'json'];
  if (opts.model) args.push('--model', opts.model);
  if (opts.systemPrompt?.trim()) args.push('--prompt', opts.systemPrompt.trim());
  const result = await runJsonCliProcess({
    executable: geminiPath,
    args,
    prompt: opts.prompt,
    cwd: tmpDir,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onEvent: opts.onEvent,
    label: 'gemini',
    failureHint:
      'Gemini CLI のログイン状態を確認してください。初回は「ログインを起動」から gemini を開き、GoogleログインまたはAPIキー設定を完了してください。',
  });
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  return result;
}

async function runViaClaudeCli(opts: RunOptions): Promise<RunResult> {
  const claudePath = await findClaudePath();
  if (!claudePath) {
    return {
      ok: false,
      error: 'claude CLI が見つかりません。Claude Code をインストールするか、API キー方式を使ってください。',
    };
  }
  if (opts.documents?.length) {
    return { ok: false, error: 'ログイン方式ではPDF添付を直接送れません。本文抽出後に再実行してください。' };
  }
  const args = ['-p', '--output-format', 'text'];
  if (opts.model) args.push('--model', opts.model);
  return runCliProcess({
    executable: claudePath,
    args,
    prompt: opts.systemPrompt ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}` : opts.prompt,
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onEvent: opts.onEvent,
    label: 'claude',
  });
}

async function runViaCodexCli(opts: RunOptions): Promise<RunResult> {
  const codexPath = await findCodexPath();
  if (!codexPath) {
    return {
      ok: false,
      error: 'codex CLI が見つかりません。npm i -g @openai/codex を実行するか、API キー方式を使ってください。',
    };
  }
  if (opts.documents?.length) {
    return { ok: false, error: 'ログイン方式ではPDF添付を直接送れません。本文抽出後に再実行してください。' };
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classnotes-codex-'));
  const prompt = opts.systemPrompt ? `${opts.systemPrompt}\n\n---\n\n${opts.prompt}` : opts.prompt;
  const args = ['exec', '--model', opts.model ?? DEFAULT_OPENAI_MODEL, '-'];
  const result = await runCliProcess({
    executable: codexPath,
    args,
    prompt,
    cwd: opts.cwd ?? tmpDir,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onEvent: opts.onEvent,
    label: 'codex',
    failureHint:
      'Codex CLI のログイン状態、または指定モデルが CLI で利用可能か確認してください。',
  });
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  return result;
}

function runCliProcess(input: {
  executable: string;
  args: string[];
  prompt: string;
  cwd?: string;
  timeoutMs: number;
  onEvent?: (e: StreamEvent) => void;
  label: string;
  failureHint?: string;
}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(input.executable, input.args, {
      shell: false,
      cwd: input.cwd,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    let output = '';
    let stderrBuf = '';
    let killed = false;
    const watchdog = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGTERM');
      } catch {}
    }, input.timeoutMs);

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d: string) => {
      output += d;
      input.onEvent?.({ type: 'chunk', text: d });
    });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (d: string) => {
      stderrBuf += d;
    });
    child.stdin.on('error', (err) => {
      logger.warn(`${input.label} stdin write failed`, err);
    });
    child.stdin.end(input.prompt);
    child.on('error', (err) => {
      clearTimeout(watchdog);
      const error = String(err);
      input.onEvent?.({ type: 'error', error });
      resolve({ ok: false, error });
    });
    child.on('close', (code) => {
      clearTimeout(watchdog);
      if (killed) {
        const error = `タイムアウト (${Math.round(input.timeoutMs / 60000)} 分)`;
        input.onEvent?.({ type: 'error', error });
        return resolve({ ok: false, error });
      }
      if (code !== 0) {
        const base = stderrBuf.trim() || `${input.label} が終了コード ${code} で終了しました。`;
        const error = input.failureHint ? `${base}\n${input.failureHint}` : base;
        input.onEvent?.({ type: 'error', error });
        return resolve({ ok: false, error });
      }
      input.onEvent?.({ type: 'done' });
      resolve({ ok: true, text: output });
    });
  });
}

function runJsonCliProcess(input: {
  executable: string;
  args: string[];
  prompt: string;
  cwd?: string;
  timeoutMs: number;
  onEvent?: (e: StreamEvent) => void;
  label: string;
  failureHint?: string;
}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(input.executable, input.args, {
      shell: false,
      cwd: input.cwd,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    let output = '';
    let stderrBuf = '';
    let killed = false;
    const watchdog = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGTERM');
      } catch {}
    }, input.timeoutMs);

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d: string) => {
      output += d;
    });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (d: string) => {
      stderrBuf += d;
    });
    child.stdin.on('error', (err) => {
      logger.warn(`${input.label} stdin write failed`, err);
    });
    child.stdin.end(input.prompt);
    child.on('error', (err) => {
      clearTimeout(watchdog);
      const error = String(err);
      input.onEvent?.({ type: 'error', error });
      resolve({ ok: false, error });
    });
    child.on('close', (code) => {
      clearTimeout(watchdog);
      if (killed) {
        const error = `タイムアウト (${Math.round(input.timeoutMs / 60000)} 分)`;
        input.onEvent?.({ type: 'error', error });
        return resolve({ ok: false, error });
      }
      if (code !== 0) {
        const base = stderrBuf.trim() || `${input.label} が終了コード ${code} で終了しました。`;
        const error = input.failureHint ? `${base}\n${input.failureHint}` : base;
        input.onEvent?.({ type: 'error', error });
        return resolve({ ok: false, error });
      }
      let text = output;
      let usage: TokenUsage | undefined;
      try {
        const parsed = JSON.parse(output) as {
          response?: unknown;
          stats?: { models?: Record<string, { tokens?: Record<string, number> }> };
          error?: { message?: string };
        };
        if (parsed.error?.message) {
          const error = parsed.error.message;
          input.onEvent?.({ type: 'error', error });
          return resolve({ ok: false, error });
        }
        if (typeof parsed.response === 'string') text = parsed.response;
        const tokenStats = Object.values(parsed.stats?.models ?? {})[0]?.tokens;
        if (tokenStats) {
          usage = {
            input: tokenStats.prompt,
            output: tokenStats.candidates,
            cacheRead: tokenStats.cached,
          };
        }
      } catch {
        text = output.trim();
      }
      if (text) input.onEvent?.({ type: 'chunk', text });
      input.onEvent?.({ type: 'done', usage });
      resolve({ ok: true, text, usage });
    });
  });
}
