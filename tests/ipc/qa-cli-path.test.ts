// @vitest-environment node
// Tests for the Claude CLI spawn path in qa:ask (lines 240-392 of qa.ts)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';
import { EventEmitter } from 'events';

const mockSend = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: vi.fn(() => ({
      webContents: { send: mockSend },
    })),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

const mockRunPrompt = vi.fn();
vi.mock('../../electron/ai/provider', () => ({
  runPrompt: (...args: unknown[]) => mockRunPrompt(...args),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));

const mockLoadSettings = vi.fn();
const mockLoadSelectedAiApiKey = vi.fn();
const mockSelectedAiModel = vi.fn();

vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: (...args: unknown[]) => mockLoadSettings(...args),
  loadSelectedAiApiKey: (...args: unknown[]) => mockLoadSelectedAiApiKey(...args),
  selectedAiModel: (...args: unknown[]) => mockSelectedAiModel(...args),
}));

const mockFindClaudePath = vi.fn();
vi.mock('../../electron/ipc/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/ipc/utils')>();
  return {
    ...actual,
    findClaudePath: (...args: unknown[]) => mockFindClaudePath(...args),
  };
});

// Create a mock spawn that returns controllable EventEmitters
function createMockProc() {
  const stdout = new EventEmitter();
  (stdout as any).setEncoding = vi.fn();
  const stderr = new EventEmitter();
  (stderr as any).setEncoding = vi.fn();
  const stdin = new EventEmitter();
  (stdin as any).end = vi.fn();
  const proc = new EventEmitter();
  (proc as any).stdout = stdout;
  (proc as any).stderr = stderr;
  (proc as any).stdin = stdin;
  (proc as any).kill = vi.fn();
  return proc;
}

let mockProc: ReturnType<typeof createMockProc>;
const mockSpawn = vi.fn(() => {
  mockProc = createMockProc();
  return mockProc;
});

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, 'claude 1.0.0', '');
    return { kill: vi.fn() };
  }),
}));

import { createQAHandlers } from '../../electron/ipc/qa';

let h: ReturnType<typeof createQAHandlers>;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSend.mockClear();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createQAHandlers();

  // Set up Claude login path settings
  mockLoadSettings.mockResolvedValue({
    aiProvider: 'claude',
    aiAuthMode: 'login',
    model: 'sonnet',
    effort: 'high',
  });
  mockLoadSelectedAiApiKey.mockResolvedValue(null);
  mockSelectedAiModel.mockReturnValue('');
  mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

const fakeEvent = { sender: { id: 1 } } as unknown;

describe('qa:ask Claude CLI path', () => {
  it('spawns claude CLI with correct args', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?');

    // Let spawn resolve, then simulate a successful close
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    // Verify spawn args
    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/claude',
      expect.arrayContaining(['-p', '--output-format', 'stream-json', '--model', 'sonnet']),
      expect.objectContaining({ shell: false, windowsHide: true }),
    );

    // Simulate successful output and close
    mockProc.emit('close', 0);
    const result = await askPromise;
    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it('parses stream-json text_delta events', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    // Send stream-json content_block_delta events
    const chunk1 = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The answer' } },
    });
    const chunk2 = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: ' is 4' } },
    });

    (mockProc as any).stdout.emit('data', chunk1 + '\n' + chunk2 + '\n');
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('The answer is 4');
    expect(mockSend).toHaveBeenCalledWith('qa:chunk', { text: 'The answer' });
    expect(mockSend).toHaveBeenCalledWith('qa:chunk', { text: ' is 4' });
  });

  it('handles result type with usage data', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Question?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const resultLine = JSON.stringify({
      type: 'result',
      result: 'Final answer',
      total_cost_usd: 0.003,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    });

    (mockProc as any).stdout.emit('data', resultLine + '\n');
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Final answer');
    expect(mockSend).toHaveBeenCalledWith('qa:done', expect.objectContaining({
      text: 'Final answer',
      usage: expect.objectContaining({
        input: 100,
        output: 50,
        cacheRead: 10,
        cacheCreate: 5,
        costUsdMicro: 3000,
      }),
    }));
  });

  it('handles result with is_error flag', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const errResult = JSON.stringify({
      type: 'result',
      is_error: true,
      api_error_status: 'rate_limited',
    });

    (mockProc as any).stdout.emit('data', errResult + '\n');
    mockProc.emit('close', 0);

    await askPromise;
    expect(mockSend).toHaveBeenCalledWith('qa:error', { error: 'rate_limited' });
  });

  it('handles result with is_error but no api_error_status', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const errResult = JSON.stringify({
      type: 'result',
      is_error: true,
    });

    (mockProc as any).stdout.emit('data', errResult + '\n');
    mockProc.emit('close', 0);

    await askPromise;
    expect(mockSend).toHaveBeenCalledWith('qa:error', { error: 'API エラーが発生しました' });
  });

  it('handles non-zero exit code with stderr', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    (mockProc as any).stderr.emit('data', 'Authentication required\n');
    mockProc.emit('close', 1);

    const result = await askPromise as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Authentication required');
    expect(mockSend).toHaveBeenCalledWith('qa:error', { error: 'Authentication required' });
  });

  it('handles non-zero exit code without stderr', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    mockProc.emit('close', 1);

    const result = await askPromise as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('終了コード 1');
  });

  it('handles non-zero exit code but with accumulated text (partial success)', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    // Send some text first
    const chunk = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial answer' } },
    });
    (mockProc as any).stdout.emit('data', chunk + '\n');

    // Then exit with non-zero code — but since fullText is non-empty, it should still return ok
    mockProc.emit('close', 1);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Partial answer');
  });

  it('handles spawn error event', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    mockProc.emit('error', new Error('ENOENT'));

    const result = await askPromise as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ENOENT');
    expect(mockSend).toHaveBeenCalledWith('qa:error', { error: expect.stringContaining('ENOENT') });
  });

  it('ignores invalid JSON lines in stdout', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    // Send invalid JSON mixed with valid
    const valid = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'OK' } },
    });
    (mockProc as any).stdout.emit('data', 'NOT JSON\n' + valid + '\n');
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('OK');
  });

  it('ignores non-text_delta stream events', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const other = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
    });
    (mockProc as any).stdout.emit('data', other + '\n');
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('');
  });

  it('uses model and effort from settings', async () => {
    mockLoadSettings.mockResolvedValue({
      aiProvider: 'claude',
      aiAuthMode: 'login',
      model: 'opus',
      effort: 'low',
    });
    mockSelectedAiModel.mockReturnValue('claude-opus');

    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/claude',
      expect.arrayContaining(['--model', 'claude-opus', '--effort', 'low']),
      expect.anything(),
    );

    mockProc.emit('close', 0);
    await askPromise;
  });

  it('falls back to settings.model when selectedAiModel returns empty', async () => {
    mockLoadSettings.mockResolvedValue({
      aiProvider: 'claude',
      aiAuthMode: 'login',
      model: 'haiku',
      effort: 'high',
    });
    mockSelectedAiModel.mockReturnValue('');

    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/claude',
      expect.arrayContaining(['--model', 'haiku']),
      expect.anything(),
    );

    mockProc.emit('close', 0);
    await askPromise;
  });

  it('handles stdin error gracefully', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    // Trigger stdin error — should not crash
    (mockProc as any).stdin.emit('error', new Error('write error'));
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it('does not append log when response is empty', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    mockProc.emit('close', 0);
    await askPromise;

    // No qa/log.md should be created since fullText is empty
    const logPath = path.join(root, 'Math', 'qa', 'log.md');
    let logExists = true;
    try {
      await fs.access(logPath);
    } catch {
      logExists = false;
    }
    expect(logExists).toBe(false);
  });

  it('appends log on successful CLI response', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'What is pi?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const chunk = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '3.14159' } },
    });
    (mockProc as any).stdout.emit('data', chunk + '\n');
    mockProc.emit('close', 0);
    await askPromise;

    const logPath = path.join(root, 'Math', 'qa', 'log.md');
    const log = await fs.readFile(logPath, 'utf-8');
    expect(log).toContain('What is pi?');
    expect(log).toContain('3.14159');
  });

  it('handles chunked JSON across multiple data events', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const fullLine = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Split' } },
    });
    // Split in the middle
    const half1 = fullLine.slice(0, 20);
    const half2 = fullLine.slice(20) + '\n';

    (mockProc as any).stdout.emit('data', half1);
    (mockProc as any).stdout.emit('data', half2);
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Split');
  });

  it('result.result is used when fullText is empty', async () => {
    await addSubject(root, 'Math');
    const askPromise = h['qa:ask'](fakeEvent, root, 'Math', 'Q?');
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    // Only send a result line with result text, no stream_events
    const resultLine = JSON.stringify({
      type: 'result',
      result: 'Fallback text',
    });
    (mockProc as any).stdout.emit('data', resultLine + '\n');
    mockProc.emit('close', 0);

    const result = await askPromise as { ok: boolean; text: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Fallback text');
  });
});
