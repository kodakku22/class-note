// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

const testUserData = path.join(os.tmpdir(), `classnotes-settings-full-${randomUUID()}`);

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getPath: (key: string) => {
      if (key === 'userData') return testUserData;
      return os.tmpdir();
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const str = b.toString();
      return str.startsWith('enc:') ? str.slice(4) : str;
    },
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

const mockFindClaudePath = vi.fn().mockResolvedValue(null);
const mockFindCodexPath = vi.fn().mockResolvedValue(null);
const mockFindGcloudPath = vi.fn().mockResolvedValue(null);
const mockFindGeminiPath = vi.fn().mockResolvedValue(null);

vi.mock('../../electron/ipc/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/ipc/utils')>();
  return {
    ...actual,
    findClaudePath: () => mockFindClaudePath(),
    findCodexPath: () => mockFindCodexPath(),
    findGcloudPath: () => mockFindGcloudPath(),
    findGeminiPath: () => mockFindGeminiPath(),
  };
});

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(new Error('not found'), '', '');
    return { kill: vi.fn() };
  }),
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((_ev: string, cb: Function) => cb(1)),
    kill: vi.fn(),
    unref: vi.fn(),
  })),
}));

vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn().mockResolvedValue({ ok: true, text: 'OK' }),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));

import { createSettingsHandlers, loadSettings, selectedAiModel, loadSelectedAiApiKey } from '../../electron/ipc/settings';

type Handlers = ReturnType<typeof createSettingsHandlers>;
let h: Handlers;

beforeEach(async () => {
  vi.clearAllMocks();
  mockFindClaudePath.mockResolvedValue(null);
  mockFindCodexPath.mockResolvedValue(null);
  mockFindGcloudPath.mockResolvedValue(null);
  mockFindGeminiPath.mockResolvedValue(null);
  await fs.mkdir(testUserData, { recursive: true });
  h = createSettingsHandlers();
});

afterEach(async () => {
  try {
    await fs.rm(testUserData, { recursive: true, force: true });
  } catch {}
});

describe('settings:get', () => {
  it('returns default settings when file is missing', async () => {
    const result = await h['settings:get'](null);
    expect(result).toBeDefined();
    expect(result.theme).toBeDefined();
  });

  it('returns settings from existing file', async () => {
    await fs.writeFile(
      path.join(testUserData, 'settings.json'),
      JSON.stringify({ theme: 'dark', locale: 'en' }),
      'utf-8'
    );
    const result = await h['settings:get'](null);
    expect(result.theme).toBe('dark');
    expect(result.locale).toBe('en');
  });

  it('handles corrupt JSON gracefully', async () => {
    await fs.writeFile(
      path.join(testUserData, 'settings.json'),
      '{broken json!!!',
      'utf-8'
    );
    const result = await h['settings:get'](null);
    // Should return defaults instead of crashing
    expect(result).toBeDefined();
    expect(result.theme).toBeDefined();
  });
});

describe('settings:set', () => {
  it('saves and persists settings', async () => {
    await h['settings:set'](null, { theme: 'dark' });
    const settings = await loadSettings();
    expect(settings.theme).toBe('dark');
  });

  it('merges multiple partial updates', async () => {
    await h['settings:set'](null, { theme: 'dark' });
    await h['settings:set'](null, { locale: 'en' });
    const settings = await loadSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.locale).toBe('en');
  });
});

describe('settings:hasApiKey', () => {
  it('returns false when no key exists', async () => {
    const result = await h['settings:hasApiKey'](null);
    expect(result.present).toBe(false);
  });

  it('returns true after setting a key', async () => {
    await h['settings:setApiKey'](null, 'sk-test-key-for-has-check');
    const result = await h['settings:hasApiKey'](null);
    expect(result.present).toBe(true);
  });
});

describe('settings:setProviderApiKey', () => {
  it('stores API key for claude', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'claude', 'sk-ant-test-key-123');
    expect(result.ok).toBe(true);
  });

  it('stores API key for openai', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'openai', 'sk-openai-test-key123');
    expect(result.ok).toBe(true);
  });

  it('stores API key for gemini', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'gemini', 'AIzaSy-test-key-123');
    expect(result.ok).toBe(true);
  });

  it('rejects none provider', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'none', 'sk-test-key-12345');
    expect(result.ok).toBe(false);
  });

  it('rejects too-short API key', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'claude', 'short');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('形式');
  });

  it('rejects too-long API key', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'claude', 'x'.repeat(5000));
    expect(result.ok).toBe(false);
  });

  it('rejects non-string key', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'claude', 42 as unknown as string);
    expect(result.ok).toBe(false);
  });
});

describe('settings:clearProviderApiKey', () => {
  it('clears existing key', async () => {
    await h['settings:setProviderApiKey'](null, 'claude', 'sk-ant-test-key-123');
    const result = await h['settings:clearProviderApiKey'](null, 'claude');
    expect(result.ok).toBe(true);
  });

  it('succeeds even when no key exists', async () => {
    const result = await h['settings:clearProviderApiKey'](null, 'openai');
    expect(result.ok).toBe(true);
  });

  it('handles none provider', async () => {
    const result = await h['settings:clearProviderApiKey'](null, 'none');
    expect(result.ok).toBe(true);
  });
});

describe('settings:setApiKey (legacy)', () => {
  it('stores legacy key', async () => {
    const result = await h['settings:setApiKey'](null, 'sk-legacy-test-key123');
    expect(result.ok).toBe(true);
  });

  it('rejects too short key', async () => {
    const result = await h['settings:setApiKey'](null, 'short');
    expect(result.ok).toBe(false);
  });

  it('rejects too long key', async () => {
    const result = await h['settings:setApiKey'](null, 'x'.repeat(1500));
    expect(result.ok).toBe(false);
  });
});

describe('settings:clearApiKey (legacy)', () => {
  it('clears legacy key', async () => {
    await h['settings:setApiKey'](null, 'sk-legacy-test-key123');
    const result = await h['settings:clearApiKey'](null);
    expect(result.ok).toBe(true);
  });
});

describe('settings:getAiConfig', () => {
  it('returns default AI config', async () => {
    const config = await h['settings:getAiConfig'](null);
    expect(config).toHaveProperty('provider');
    expect(config).toHaveProperty('authMode');
    expect(config).toHaveProperty('model');
    expect(config).toHaveProperty('models');
  });

  it('reflects saved provider', async () => {
    await h['settings:setAiConfig'](null, { provider: 'openai', authMode: 'api-key' });
    const config = await h['settings:getAiConfig'](null);
    expect(config.provider).toBe('openai');
  });
});

describe('settings:setAiConfig', () => {
  it('updates provider', async () => {
    const result = await h['settings:setAiConfig'](null, { provider: 'openai' });
    expect(result.ok).toBe(true);
    const settings = await loadSettings();
    expect(settings.aiProvider).toBe('openai');
  });

  it('updates authMode', async () => {
    const result = await h['settings:setAiConfig'](null, { authMode: 'login' });
    expect(result.ok).toBe(true);
    const settings = await loadSettings();
    expect(settings.aiAuthMode).toBe('login');
  });

  it('updates model', async () => {
    const result = await h['settings:setAiConfig'](null, { provider: 'openai', model: 'gpt-5.5' });
    expect(result.ok).toBe(true);
  });

  it('updates models map', async () => {
    const result = await h['settings:setAiConfig'](null, {
      provider: 'gemini',
      models: { gemini: 'gemini-3-pro' },
    });
    expect(result.ok).toBe(true);
  });

  it('returns config in response', async () => {
    const result = await h['settings:setAiConfig'](null, { provider: 'claude', authMode: 'api-key' });
    expect(result.ok).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config.provider).toBe('claude');
  });
});

describe('settings:getProviderAuthStatus', () => {
  it('returns auth statuses for all providers', async () => {
    const result = await h['settings:getProviderAuthStatus'](null);
    expect(result.ok).toBe(true);
    expect(result.providers).toBeDefined();
    expect(result.providers).toHaveProperty('claude');
    expect(result.providers).toHaveProperty('openai');
    expect(result.providers).toHaveProperty('gemini');
  });

  it('returns status for specific provider', async () => {
    const result = await h['settings:getProviderAuthStatus'](null, 'claude');
    expect(result.ok).toBe(true);
    expect(Object.keys(result.providers)).toEqual(['claude']);
  });

  it('skips none provider', async () => {
    const result = await h['settings:getProviderAuthStatus'](null, 'none');
    // When provider is 'none', falls back to all providers
    expect(result.ok).toBe(true);
  });

  it('reports claude CLI not found', async () => {
    mockFindClaudePath.mockResolvedValue(null);
    const result = await h['settings:getProviderAuthStatus'](null, 'claude');
    expect(result.providers.claude.login.installed).toBe(false);
  });

  it('reports openai CLI not found', async () => {
    mockFindCodexPath.mockResolvedValue(null);
    const result = await h['settings:getProviderAuthStatus'](null, 'openai');
    expect(result.providers.openai.login.installed).toBe(false);
  });

  it('reports gemini CLI not found', async () => {
    mockFindGeminiPath.mockResolvedValue(null);
    mockFindGcloudPath.mockResolvedValue(null);
    const result = await h['settings:getProviderAuthStatus'](null, 'gemini');
    expect(result.providers.gemini.login.installed).toBe(false);
  });

  it('reports gemini CLI installed before checking gcloud', async () => {
    mockFindGeminiPath.mockResolvedValue('/usr/bin/gemini');
    const { execFile } = await import('child_process');
    vi.mocked(execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      expect(args).toEqual(['--version']);
      cb(null, 'gemini 1.0.0', '');
      return { kill: vi.fn() } as any;
    });

    const result = await h['settings:getProviderAuthStatus'](null, 'gemini');
    expect(result.providers.gemini.login.installed).toBe(true);
    expect(result.providers.gemini.login.loggedIn).toBe(true);
    expect(mockFindGcloudPath).not.toHaveBeenCalled();
  });

  it('reports claude CLI installed when path exists', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const { execFile } = await import('child_process');
    // First call: auth status — fails
    // Second call: --version — succeeds
    let callCount = 0;
    vi.mocked(execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      callCount++;
      if (callCount === 1) {
        // auth status check - fail
        cb(new Error('not authenticated'), '', 'not authenticated');
      } else {
        // version check - succeed
        cb(null, 'claude 1.0.0', '');
      }
      return { kill: vi.fn() } as any;
    });

    const result = await h['settings:getProviderAuthStatus'](null, 'claude');
    expect(result.providers.claude.login.installed).toBe(true);
  });
});

describe('settings:loginProvider', () => {
  it('returns error for none provider', async () => {
    const result = await h['settings:loginProvider'](null, 'none');
    expect(result.ok).toBe(false);
  });

  it('returns error when claude CLI not found', async () => {
    mockFindClaudePath.mockResolvedValue(null);
    const result = await h['settings:loginProvider'](null, 'claude');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('claude');
  });

  it('returns error when openai CLI not found', async () => {
    mockFindCodexPath.mockResolvedValue(null);
    const result = await h['settings:loginProvider'](null, 'openai');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('codex');
  });

  it('returns error when gemini CLI not found', async () => {
    mockFindGeminiPath.mockResolvedValue(null);
    mockFindGcloudPath.mockResolvedValue(null);
    const result = await h['settings:loginProvider'](null, 'gemini');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('gemini');
  });

  it('spawns login for claude', async () => {
    mockFindClaudePath.mockResolvedValue('/usr/bin/claude');
    const result = await h['settings:loginProvider'](null, 'claude');
    expect(result.ok).toBe(true);
  });

  it('spawns login for openai', async () => {
    mockFindCodexPath.mockResolvedValue('/usr/bin/codex');
    const result = await h['settings:loginProvider'](null, 'openai');
    expect(result.ok).toBe(true);
  });

  it('spawns login for gemini CLI', async () => {
    mockFindGeminiPath.mockResolvedValue('/usr/bin/gemini');
    const result = await h['settings:loginProvider'](null, 'gemini');
    expect(result.ok).toBe(true);
  });

  it('falls back to gcloud login for gemini', async () => {
    mockFindGeminiPath.mockResolvedValue(null);
    mockFindGcloudPath.mockResolvedValue('/usr/bin/gcloud');
    const result = await h['settings:loginProvider'](null, 'gemini');
    expect(result.ok).toBe(true);
  });
});

describe('settings:testProvider', () => {
  it('tests provider and returns result', async () => {
    const result = await h['settings:testProvider'](null);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('ok');
  });

  it('tests specific provider', async () => {
    const result = await h['settings:testProvider'](null, 'openai', 'api-key');
    expect(result).toBeDefined();
  });
});

describe('selectedAiModel', () => {
  it('returns openai model', () => {
    expect(selectedAiModel({ aiProvider: 'openai' } as any)).toBeTruthy();
  });

  it('returns gemini model', () => {
    expect(selectedAiModel({ aiProvider: 'gemini' } as any)).toBeTruthy();
  });

  it('returns claude API model', () => {
    expect(selectedAiModel({ aiProvider: 'claude', aiAuthMode: 'api-key' } as any)).toBeTruthy();
  });

  it('returns claude login model', () => {
    expect(selectedAiModel({ aiProvider: 'claude', aiAuthMode: 'login' } as any)).toBeTruthy();
  });

  it('returns empty for none provider', () => {
    expect(selectedAiModel({ aiProvider: 'none' } as any)).toBe('');
  });
});

describe('loadSelectedAiApiKey', () => {
  it('returns null for none provider', async () => {
    const key = await loadSelectedAiApiKey({ aiProvider: 'none', aiAuthMode: 'api-key' } as any);
    expect(key).toBeNull();
  });

  it('returns null for login auth mode', async () => {
    const key = await loadSelectedAiApiKey({ aiProvider: 'claude', aiAuthMode: 'login' } as any);
    expect(key).toBeNull();
  });

  it('returns key for api-key auth mode', async () => {
    await h['settings:setProviderApiKey'](null, 'claude', 'sk-ant-test-key-123');
    const key = await loadSelectedAiApiKey({ aiProvider: 'claude', aiAuthMode: 'api-key' } as any);
    expect(key).toBe('sk-ant-test-key-123');
  });
});
