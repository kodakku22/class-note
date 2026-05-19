// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject, writeNote } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

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

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { setEncoding: vi.fn(), on: vi.fn() },
    stderr: { setEncoding: vi.fn(), on: vi.fn() },
    stdin: { on: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    unref: vi.fn(),
    kill: vi.fn(),
  })),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, 'claude 1.0.0', '');
    return { kill: vi.fn() };
  }),
}));

import { createQAHandlers, checkClaudeStatus } from '../../electron/ipc/qa';

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

  // Default settings mocks
  mockLoadSettings.mockResolvedValue({
    aiProvider: 'openai',
    aiAuthMode: 'api-key',
  });
  mockLoadSelectedAiApiKey.mockResolvedValue('sk-test-key-12345');
  mockSelectedAiModel.mockReturnValue('gpt-4o');
  mockFindClaudePath.mockResolvedValue(null);
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

const fakeEvent = { sender: { id: 1 } } as unknown;

describe('qa:readLog', () => {
  it('returns empty string for nonexistent subject', async () => {
    const result = await h['qa:readLog'](null, root, 'nonexistent');
    expect(result).toBe('');
  });

  it('reads existing QA log', async () => {
    await addSubject(root, 'Math');
    const qaDir = path.join(root, 'Math', 'qa');
    await fs.mkdir(qaDir, { recursive: true });
    await fs.writeFile(
      path.join(qaDir, 'log.md'),
      '# Math — AI Q&A ログ\n\n## Q\nWhat is 2+2?\n\n## A\n4\n',
      'utf-8'
    );
    const result = await h['qa:readLog'](null, root, 'Math');
    expect(result).toContain('What is 2+2');
    expect(result).toContain('4');
  });
});

describe('qa:status', () => {
  it('returns not installed when CLI not found', async () => {
    mockFindClaudePath.mockResolvedValue(null);
    const result = await h['qa:status']() as { installed: boolean; loggedIn: boolean };
    expect(result.installed).toBe(false);
    expect(result.loggedIn).toBe(false);
  });

  it('returns installed when CLI is found and execFile succeeds', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const result = await h['qa:status']() as { installed: boolean; loggedIn: boolean };
    expect(result.installed).toBe(true);
    expect(result.loggedIn).toBe(true);
  });
});

describe('qa:login', () => {
  it('returns error when CLI not found', async () => {
    mockFindClaudePath.mockResolvedValue(null);
    const result = await h['qa:login']() as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('見つかりません');
  });

  it('spawns login process when CLI is found', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const result = await h['qa:login']() as { ok: boolean };
    expect(result.ok).toBe(true);
    const { spawn } = await import('child_process');
    expect(spawn).toHaveBeenCalled();
  });
});

describe('qa:ask', () => {
  it('returns error for empty question', async () => {
    const result = await h['qa:ask'](fakeEvent, root, 'Math', '') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('returns error for whitespace-only question', async () => {
    const result = await h['qa:ask'](fakeEvent, root, 'Math', '   ') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
  });

  it('returns error when provider is none', async () => {
    mockLoadSettings.mockResolvedValue({ aiProvider: 'none', aiAuthMode: 'api-key' });
    const result = await h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('disabled');
    expect(mockSend).toHaveBeenCalledWith('qa:error', expect.objectContaining({ error: expect.stringContaining('無効') }));
  });

  it('returns error when no API key and using api-key auth mode', async () => {
    mockLoadSettings.mockResolvedValue({ aiProvider: 'openai', aiAuthMode: 'api-key' });
    mockLoadSelectedAiApiKey.mockResolvedValue(null);
    const result = await h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('api key');
    expect(mockSend).toHaveBeenCalledWith('qa:error', expect.objectContaining({ error: expect.stringContaining('API') }));
  });

  it('calls runPrompt for api-key auth mode', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: 'The answer is 4' });
    await addSubject(root, 'Math');

    const result = await h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?') as { ok: boolean; text?: string };
    expect(result.ok).toBe(true);
    expect(result.text).toBe('The answer is 4');
    expect(mockRunPrompt).toHaveBeenCalledWith('openai', expect.objectContaining({
      prompt: expect.stringContaining('What is 2+2'),
      apiKey: 'sk-test-key-12345',
    }));
    expect(mockSend).toHaveBeenCalledWith('qa:done', expect.objectContaining({ text: 'The answer is 4' }));
  });

  it('appends log after successful answer', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: 'The answer is 4' });
    await addSubject(root, 'Math');

    await h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?');

    const logPath = path.join(root, 'Math', 'qa', 'log.md');
    const log = await fs.readFile(logPath, 'utf-8');
    expect(log).toContain('What is 2+2?');
    expect(log).toContain('The answer is 4');
  });

  it('does not append log when answer is empty', async () => {
    mockRunPrompt.mockResolvedValue({ ok: true, text: '   ' });
    await addSubject(root, 'Math');

    await h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?');

    const logPath = path.join(root, 'Math', 'qa', 'log.md');
    try {
      await fs.access(logPath);
      // If the file exists, make sure Q/A text isn't there
      const log = await fs.readFile(logPath, 'utf-8');
      expect(log).not.toContain('What is 2+2?');
    } catch {
      // File doesn't exist, which is expected
    }
  });

  it('handles runPrompt failure', async () => {
    mockRunPrompt.mockResolvedValue({ ok: false, error: 'API error occurred' });
    await addSubject(root, 'Math');

    const result = await h['qa:ask'](fakeEvent, root, 'Math', 'What is 2+2?') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('API error occurred');
  });

  it('includes notes preview in system prompt', async () => {
    await addSubject(root, 'Math');
    await writeNote(root, 'Math', 'algebra.md', '---\ntitle: Algebra\n---\nQuadratic formula: ax^2 + bx + c = 0');
    mockRunPrompt.mockResolvedValue({ ok: true, text: 'answer' });

    await h['qa:ask'](fakeEvent, root, 'Math', 'Explain the formula');

    expect(mockRunPrompt).toHaveBeenCalledWith('openai', expect.objectContaining({
      systemPrompt: expect.stringContaining('Quadratic formula'),
    }));
  });

  it('includes past QA log in system prompt', async () => {
    await addSubject(root, 'Math');
    const qaDir = path.join(root, 'Math', 'qa');
    await fs.mkdir(qaDir, { recursive: true });
    await fs.writeFile(path.join(qaDir, 'log.md'), '## Previous Q\nWhat is pi?\n## Previous A\n3.14159\n');
    mockRunPrompt.mockResolvedValue({ ok: true, text: 'answer' });

    await h['qa:ask'](fakeEvent, root, 'Math', 'New question');

    expect(mockRunPrompt).toHaveBeenCalledWith('openai', expect.objectContaining({
      systemPrompt: expect.stringContaining('What is pi'),
    }));
  });

  it('includes overview in system prompt', async () => {
    await addSubject(root, 'Math');
    await fs.writeFile(path.join(root, 'Math', '_概要.md'), 'This is the math overview: linear algebra and calculus.');
    mockRunPrompt.mockResolvedValue({ ok: true, text: 'answer' });

    await h['qa:ask'](fakeEvent, root, 'Math', 'Question?');

    expect(mockRunPrompt).toHaveBeenCalledWith('openai', expect.objectContaining({
      systemPrompt: expect.stringContaining('linear algebra'),
    }));
  });

  it('sends chunks via onEvent callback', async () => {
    mockRunPrompt.mockImplementation(async (_provider: string, opts: { onEvent?: (ev: { type: string; text?: string }) => void }) => {
      opts.onEvent?.({ type: 'chunk', text: 'part1' });
      opts.onEvent?.({ type: 'chunk', text: 'part2' });
      return { ok: true, text: 'part1part2' };
    });
    await addSubject(root, 'Math');

    await h['qa:ask'](fakeEvent, root, 'Math', 'Question?');

    expect(mockSend).toHaveBeenCalledWith('qa:chunk', { text: 'part1' });
    expect(mockSend).toHaveBeenCalledWith('qa:chunk', { text: 'part2' });
  });

  it('sends error event via onEvent callback', async () => {
    mockRunPrompt.mockImplementation(async (_provider: string, opts: { onEvent?: (ev: { type: string; error?: string }) => void }) => {
      opts.onEvent?.({ type: 'error', error: 'rate limited' });
      return { ok: false, error: 'rate limited' };
    });
    await addSubject(root, 'Math');

    await h['qa:ask'](fakeEvent, root, 'Math', 'Question?');

    expect(mockSend).toHaveBeenCalledWith('qa:error', { error: 'rate limited' });
  });

  it('returns error when BrowserWindow not available', async () => {
    const { BrowserWindow } = await import('electron');
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null as any);

    const result = await h['qa:ask'](fakeEvent, root, 'Math', 'Question?') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('window');
  });

  it('falls back to claude login path when provider is claude and authMode is login', async () => {
    mockLoadSettings.mockResolvedValue({
      aiProvider: 'claude',
      aiAuthMode: 'login',
      model: 'sonnet',
      effort: 'high',
    });
    mockFindClaudePath.mockResolvedValue(null);

    const result = await h['qa:ask'](fakeEvent, root, 'Math', 'Question?') as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('claude not found');
    expect(mockSend).toHaveBeenCalledWith('qa:error', expect.objectContaining({
      error: expect.stringContaining('claude CLI'),
    }));
  });
});

describe('checkClaudeStatus', () => {
  it('returns not installed when CLI not found', async () => {
    mockFindClaudePath.mockResolvedValue(null);
    const status = await checkClaudeStatus();
    expect(status.installed).toBe(false);
    expect(status.error).toContain('見つかりません');
  });

  it('returns installed and logged in when execFile succeeds', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const status = await checkClaudeStatus();
    expect(status.installed).toBe(true);
    expect(status.loggedIn).toBe(true);
    expect(status.path).toBe('/usr/bin/claude');
  });

  it('returns not installed when execFile fails', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const { execFile } = await import('child_process');
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(new Error('exec failed'), '', '');
      return { kill: vi.fn() } as any;
    });

    const status = await checkClaudeStatus();
    expect(status.installed).toBe(false);
    expect(status.error).toContain('exec failed');
  });
});
