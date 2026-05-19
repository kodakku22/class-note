// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mock child_process ----------
const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// ---------- Mock fs/promises ----------
const mockMkdtemp = vi.fn().mockResolvedValue('/tmp/classnotes-codex-abc');
const mockRm = vi.fn().mockResolvedValue(undefined);
vi.mock('fs/promises', () => ({
  mkdtemp: (...args: unknown[]) => mockMkdtemp(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

// ---------- Mock CLI finders ----------
const mockFindClaudePath = vi.fn();
const mockFindCodexPath = vi.fn();
const mockFindGcloudPath = vi.fn();
const mockFindGeminiPath = vi.fn();
vi.mock('../../electron/ipc/utils', () => ({
  findClaudePath: () => mockFindClaudePath(),
  findCodexPath: () => mockFindCodexPath(),
  findGcloudPath: () => mockFindGcloudPath(),
  findGeminiPath: () => mockFindGeminiPath(),
  sanitizeForPrompt: vi.fn((text: string) => text),
}));

// ---------- Mock logger ----------
vi.mock('../../electron/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------- Mock resilience (pass-through by default) ----------
vi.mock('../../electron/net/resilience', () => ({
  withResilience: vi.fn(async (_key: string, op: (attempt: number) => Promise<unknown>) => op(0)),
  CircuitOpenError: class CircuitOpenError extends Error {
    key: string;
    retryAt: number;
    constructor(key: string, retryAt: number) {
      super(`Circuit is open for ${key}`);
      this.name = 'CircuitOpenError';
      this.key = key;
      this.retryAt = retryAt;
    }
  },
  RetryableHttpError: class RetryableHttpError extends Error {
    statusCode: number;
    constructor(statusCode: number) {
      super(`HTTP ${statusCode}`);
      this.name = 'RetryableHttpError';
      this.statusCode = statusCode;
    }
  },
}));

// ---------- Mock global fetch ----------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { runPrompt } from '../../electron/ai/provider';
import { CircuitOpenError } from '../../electron/net/resilience';
import { withResilience } from '../../electron/net/resilience';
const mockWithResilience = withResilience as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFindClaudePath.mockResolvedValue(null);
  mockFindCodexPath.mockResolvedValue(null);
  mockFindGcloudPath.mockResolvedValue(null);
  mockFindGeminiPath.mockResolvedValue(null);
});

// Helper: create a fake SSE Response
function makeSseResponse(events: string[], status = 200): Response {
  const body = events.join('\n\n') + '\n\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

// Helper: create a fake child process (EventEmitter-like)
function makeFakeChild() {
  const stdoutListeners: Record<string, Function[]> = {};
  const stderrListeners: Record<string, Function[]> = {};
  const stdinListeners: Record<string, Function[]> = {};
  const childListeners: Record<string, Function[]> = {};

  const stdout = {
    setEncoding: vi.fn(),
    on: vi.fn((event: string, fn: Function) => {
      (stdoutListeners[event] ??= []).push(fn);
    }),
  };
  const stderr = {
    setEncoding: vi.fn(),
    on: vi.fn((event: string, fn: Function) => {
      (stderrListeners[event] ??= []).push(fn);
    }),
  };
  const stdin = {
    on: vi.fn((event: string, fn: Function) => {
      (stdinListeners[event] ??= []).push(fn);
    }),
    end: vi.fn(),
  };

  return {
    stdout,
    stderr,
    stdin,
    on: vi.fn((event: string, fn: Function) => {
      (childListeners[event] ??= []).push(fn);
    }),
    kill: vi.fn(),
    // test helpers
    emitStdout(data: string) {
      stdoutListeners.data?.forEach((fn) => fn(data));
    },
    emitStderr(data: string) {
      stderrListeners.data?.forEach((fn) => fn(data));
    },
    emitClose(code: number | null) {
      childListeners.close?.forEach((fn) => fn(code));
    },
    emitError(err: Error) {
      childListeners.error?.forEach((fn) => fn(err));
    },
  };
}

// --------------------------------------------------------------------------
// normalizeTarget (tested indirectly through runPrompt dispatch)
// --------------------------------------------------------------------------

describe('runPrompt / normalizeTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns disabled error for provider "none"', async () => {
    const r = await runPrompt('none', { prompt: 'hi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('無効');
  });

  it('normalizes "anthropic-api" to claude + api-key', async () => {
    // Will fail with missing API key error (proves dispatch reached Anthropic path)
    const r = await runPrompt('anthropic-api', { prompt: 'hi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Anthropic API キー');
  });

  it('normalizes "claude-cli" to claude + login', async () => {
    mockFindClaudePath.mockResolvedValue(null);
    const r = await runPrompt('claude-cli', { prompt: 'hi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('claude CLI');
  });
});

// --------------------------------------------------------------------------
// Anthropic API
// --------------------------------------------------------------------------

describe('runPrompt / Anthropic API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns error when API key is missing', async () => {
    const r = await runPrompt('claude', { prompt: 'hi', authMode: 'api-key' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Anthropic API キー');
  });

  it('streams text from Anthropic SSE', async () => {
    const response = makeSseResponse([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"World"}}',
      'data: {"type":"message_delta","usage":{"input_tokens":10,"output_tokens":5}}',
    ]);
    mockFetch.mockResolvedValue(response);

    const events: unknown[] = [];
    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      onEvent: (e) => events.push(e),
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe('Hello World');
      expect(r.usage?.input).toBe(10);
      expect(r.usage?.output).toBe(5);
    }
    expect(events.some((e: any) => e.type === 'chunk')).toBe(true);
    expect(events.some((e: any) => e.type === 'done')).toBe(true);
  });

  it('sends correct headers', async () => {
    mockFetch.mockResolvedValue(makeSseResponse(['data: {"type":"message_delta"}']));

    await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
        }),
      })
    );
  });

  it('includes system prompt in body when provided', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      systemPrompt: 'You are helpful',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system).toBe('You are helpful');
  });

  it('includes documents as content blocks', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('claude', {
      prompt: 'analyze this',
      authMode: 'api-key',
      apiKey: 'sk-test',
      documents: [{ base64: 'AAAA', mediaType: 'application/pdf', fileName: 'test.pdf' }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const content = body.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe('document');
    expect(content[1].type).toBe('text');
  });

  it('returns error on non-ok response', async () => {
    const response = new Response('Bad request', { status: 400 });
    mockFetch.mockResolvedValue(response);

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('API エラー');
  });

  it('handles SSE parse errors gracefully', async () => {
    const response = makeSseResponse([
      'data: not-valid-json',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
    ]);
    mockFetch.mockResolvedValue(response);

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('ok');
  });

  it('handles [DONE] SSE event', async () => {
    const response = makeSseResponse([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}',
      'data: [DONE]',
    ]);
    mockFetch.mockResolvedValue(response);

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('hi');
  });

  it('uses default model when not specified', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('uses custom model when specified', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-haiku-4-5');
  });
});

// --------------------------------------------------------------------------
// OpenAI API
// --------------------------------------------------------------------------

describe('runPrompt / OpenAI API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns error when API key is missing', async () => {
    const r = await runPrompt('openai', { prompt: 'hi', authMode: 'api-key' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('OpenAI API キー');
  });

  it('streams text from OpenAI SSE', async () => {
    const response = makeSseResponse([
      'data: {"type":"response.output_text.delta","delta":"Hello "}',
      'data: {"type":"response.output_text.delta","delta":"World"}',
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":8,"output_tokens":4}}}',
    ]);
    mockFetch.mockResolvedValue(response);

    const r = await runPrompt('openai', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe('Hello World');
      expect(r.usage?.input).toBe(8);
    }
  });

  it('sends Bearer auth header', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('openai', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-openai',
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.authorization).toBe('Bearer sk-openai');
  });

  it('includes system prompt in input array', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('openai', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      systemPrompt: 'Be helpful',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input[0].role).toBe('system');
    expect(body.input[1].role).toBe('user');
  });

  it('handles response.failed events', async () => {
    const response = makeSseResponse([
      'data: {"type":"response.failed","response":{"error":{"message":"Rate limited"}}}',
    ]);
    mockFetch.mockResolvedValue(response);

    const events: unknown[] = [];
    await runPrompt('openai', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      onEvent: (e) => events.push(e),
    });

    expect(events.some((e: any) => e.type === 'error' && e.error === 'Rate limited')).toBe(true);
  });

  it('includes document files in content', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('openai', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      documents: [{ base64: 'AAAA', mediaType: 'application/pdf', fileName: 'doc.pdf' }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userContent = body.input.find((m: any) => m.role === 'user').content;
    expect(userContent[0].type).toBe('input_file');
    expect(userContent[0].filename).toBe('doc.pdf');
  });
});

// --------------------------------------------------------------------------
// Gemini API
// --------------------------------------------------------------------------

describe('runPrompt / Gemini API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns error when API key is missing (api-key mode)', async () => {
    const r = await runPrompt('gemini', { prompt: 'hi', authMode: 'api-key' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Gemini API キー');
  });

  it('streams text from Gemini SSE', async () => {
    const response = makeSseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" World"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}',
    ]);
    mockFetch.mockResolvedValue(response);

    const r = await runPrompt('gemini', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'gem-key',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe('Hello World');
      expect(r.usage?.input).toBe(5);
    }
  });

  it('appends API key to URL', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('gemini', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'gem-key',
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('key=gem-key');
  });

  it('returns error when gemini CLI and gcloud are not found (login mode)', async () => {
    mockFindGeminiPath.mockResolvedValue(null);
    mockFindGcloudPath.mockResolvedValue(null);

    const r = await runPrompt('gemini', { prompt: 'hi', authMode: 'login' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('gemini CLI');
  });

  it('returns error when gcloud token is null in ADC fallback (login mode)', async () => {
    mockFindGeminiPath.mockResolvedValue(null);
    mockFindGcloudPath.mockResolvedValue('/usr/bin/gcloud');
    // Simulate execFile calling callback with error
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(new Error('not logged in'), '');
    });

    const r = await runPrompt('gemini', { prompt: 'hi', authMode: 'login' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ログインしていません');
  });

  it('uses Bearer token for ADC fallback login mode', async () => {
    mockFindGeminiPath.mockResolvedValue(null);
    mockFindGcloudPath.mockResolvedValue('/usr/bin/gcloud');
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
      cb(null, 'ya29.token-value-is-long-enough-for-test-purposes');
    });
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('gemini', { prompt: 'hi', authMode: 'login' });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.authorization).toContain('Bearer ya29');
  });

  it('uses Gemini CLI headless mode before gcloud in login mode', async () => {
    mockFindGeminiPath.mockResolvedValue('/usr/bin/gemini');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('gemini', {
      prompt: 'test',
      authMode: 'login',
      model: 'gemini-3.1-pro-preview',
      systemPrompt: 'Reply briefly',
    });
    await new Promise<void>((r) => setTimeout(r, 0));

    child.emitStdout(JSON.stringify({ response: 'Gemini OK', stats: { models: { m: { tokens: { prompt: 2, candidates: 3 } } } } }));
    child.emitClose(0);

    const r = await promise;
    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/gemini',
      ['--output-format', 'json', '--model', 'gemini-3.1-pro-preview', '--prompt', 'Reply briefly'],
      expect.objectContaining({ shell: false })
    );
    expect(mockFindGcloudPath).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe('Gemini OK');
      expect(r.usage?.input).toBe(2);
      expect(r.usage?.output).toBe(3);
    }
  });

  it('includes system instruction when systemPrompt provided', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('gemini', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'gem-key',
      systemPrompt: 'System text',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('System text');
  });

  it('includes inline data for documents', async () => {
    mockFetch.mockResolvedValue(makeSseResponse([]));

    await runPrompt('gemini', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'gem-key',
      documents: [{ base64: 'AAAA', mediaType: 'application/pdf' }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const parts = body.contents[0].parts;
    expect(parts[0].inlineData.mimeType).toBe('application/pdf');
    expect(parts[1].text).toBe('hi');
  });
});

// --------------------------------------------------------------------------
// Claude CLI
// --------------------------------------------------------------------------

// Helper: flush microtasks so async code in runPrompt settles before emitting child events
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('runPrompt / Claude CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when claude CLI not found', async () => {
    mockFindClaudePath.mockResolvedValue(null);

    const r = await runPrompt('claude', { prompt: 'hi', authMode: 'login' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('claude CLI');
  });

  it('returns error when documents provided in login mode', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'login',
      documents: [{ base64: 'AAAA', mediaType: 'application/pdf' as const }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PDF添付');
  });

  it('spawns CLI and collects stdout', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('claude', { prompt: 'test', authMode: 'login' });
    await tick();

    child.emitStdout('Result text');
    child.emitClose(0);

    const r = await promise;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('Result text');
  });

  it('returns error on non-zero exit', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('claude', { prompt: 'test', authMode: 'login' });
    await tick();

    child.emitStderr('Command failed');
    child.emitClose(1);

    const r = await promise;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Command failed');
  });

  it('returns error on spawn error event', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('claude', { prompt: 'test', authMode: 'login' });
    await tick();

    child.emitError(new Error('ENOENT'));

    const r = await promise;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ENOENT');
  });

  it('passes model argument when specified', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('claude', {
      prompt: 'test',
      authMode: 'login',
      model: 'opus',
    });
    await tick();

    child.emitClose(0);
    await promise;

    const args = mockSpawn.mock.calls[0][1];
    expect(args).toContain('--model');
    expect(args).toContain('opus');
  });

  it('fires stream events for stdout chunks', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const events: unknown[] = [];
    const promise = runPrompt('claude', {
      prompt: 'test',
      authMode: 'login',
      onEvent: (e) => events.push(e),
    });
    await tick();

    child.emitStdout('chunk1');
    child.emitStdout('chunk2');
    child.emitClose(0);

    await promise;
    const chunks = events.filter((e: any) => e.type === 'chunk');
    expect(chunks.length).toBe(2);
  });

  it('combines system prompt with prompt', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('claude', {
      prompt: 'main question',
      authMode: 'login',
      systemPrompt: 'You are helpful',
    });
    await tick();

    child.emitClose(0);
    await promise;

    const stdinContent = child.stdin.end.mock.calls[0][0];
    expect(stdinContent).toContain('You are helpful');
    expect(stdinContent).toContain('main question');
  });
});

// --------------------------------------------------------------------------
// Codex CLI
// --------------------------------------------------------------------------

describe('runPrompt / Codex CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when codex CLI not found', async () => {
    mockFindCodexPath.mockResolvedValue(null);

    const r = await runPrompt('openai', { prompt: 'hi', authMode: 'login' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('codex CLI');
  });

  it('returns error when documents provided in login mode', async () => {
    mockFindCodexPath.mockResolvedValue('/usr/bin/codex');

    const r = await runPrompt('openai', {
      prompt: 'hi',
      authMode: 'login',
      documents: [{ base64: 'AAAA', mediaType: 'application/pdf' as const }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PDF添付');
  });

  it('spawns codex CLI and collects output', async () => {
    mockFindCodexPath.mockResolvedValue('/usr/bin/codex');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('openai', { prompt: 'test', authMode: 'login' });
    await tick();

    child.emitStdout('Codex output');
    child.emitClose(0);

    const r = await promise;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('Codex output');
  });

  it('cleans up temp dir after execution', async () => {
    mockFindCodexPath.mockResolvedValue('/usr/bin/codex');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('openai', { prompt: 'test', authMode: 'login' });
    await tick();

    child.emitClose(0);
    await promise;

    expect(mockMkdtemp).toHaveBeenCalled();
    expect(mockRm).toHaveBeenCalled();
  });

  it('includes failure hint on non-zero exit', async () => {
    mockFindCodexPath.mockResolvedValue('/usr/bin/codex');
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    const promise = runPrompt('openai', { prompt: 'test', authMode: 'login' });
    await tick();

    child.emitClose(1);
    const r = await promise;

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Codex CLI');
    }
  });
});

// --------------------------------------------------------------------------
// fetchWithTimeout + circuit breaker (tested through API paths)
// --------------------------------------------------------------------------

describe('runPrompt / circuit breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns circuit open error message', async () => {
    mockWithResilience.mockRejectedValueOnce(new CircuitOpenError('anthropic-api', Date.now() + 30000));

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('一時的に');
  });

  it('returns timeout error', async () => {
    mockWithResilience.mockImplementationOnce(async (_key: string, op: Function) => {
      const ctrl = new AbortController();
      // Simulate the fetch aborting due to timeout
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(false);
  });

  it('returns network error for unknown fetch failures', async () => {
    mockWithResilience.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ネットワークエラー');
  });
});

// --------------------------------------------------------------------------
// Edge cases
// --------------------------------------------------------------------------

describe('runPrompt / edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns error for null response', async () => {
    mockFetch.mockResolvedValue(null);

    const r = await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
    });
    expect(r.ok).toBe(false);
  });

  it('emits error event on non-ok response', async () => {
    const response = new Response('error body', { status: 401 });
    mockFetch.mockResolvedValue(response);

    const events: unknown[] = [];
    await runPrompt('claude', {
      prompt: 'hi',
      authMode: 'api-key',
      apiKey: 'sk-test',
      onEvent: (e) => events.push(e),
    });

    expect(events.some((e: any) => e.type === 'error')).toBe(true);
  });
});
