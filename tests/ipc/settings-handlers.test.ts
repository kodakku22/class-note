// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// Mock app.getPath to return a temp directory we control
const testUserData = path.join(os.tmpdir(), `classnotes-settings-test-${randomUUID()}`);

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
    encryptString: (s: string) => Buffer.from(`encrypted:${s}`),
    decryptString: (b: Buffer) => {
      const str = b.toString();
      return str.startsWith('encrypted:') ? str.slice(10) : str;
    },
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

// Mock child_process for provider discovery
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
  })),
}));

import { createSettingsHandlers, loadSettings } from '../../electron/ipc/settings';

type Handlers = ReturnType<typeof createSettingsHandlers>;
let h: Handlers;
let cleanupDir: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  await fs.mkdir(testUserData, { recursive: true });
  h = createSettingsHandlers();
  cleanupDir = async () => {
    try {
      await fs.rm(testUserData, { recursive: true, force: true });
    } catch {}
  };
});

afterEach(async () => {
  await cleanupDir();
});

describe('settings:get', () => {
  it('returns default settings when no file exists', async () => {
    const result = await h['settings:get'](null);
    expect(result).toBeDefined();
    expect(result.theme).toBeDefined();
  });

  it('reads settings from file', async () => {
    await fs.writeFile(
      path.join(testUserData, 'settings.json'),
      JSON.stringify({ theme: 'dark', locale: 'ja' }),
      'utf-8'
    );

    const result = await h['settings:get'](null);
    expect(result.theme).toBe('dark');
  });
});

describe('settings:set', () => {
  it('saves partial settings', async () => {
    await h['settings:set'](null, { theme: 'dark' });

    const saved = await loadSettings();
    expect(saved.theme).toBe('dark');
  });

  it('merges with existing settings', async () => {
    await h['settings:set'](null, { theme: 'dark' });
    await h['settings:set'](null, { locale: 'en' });

    const saved = await loadSettings();
    expect(saved.theme).toBe('dark');
    expect(saved.locale).toBe('en');
  });
});

describe('settings:hasApiKey', () => {
  it('returns false when no API key file exists', async () => {
    const result = await h['settings:hasApiKey'](null);
    // Returns { ok: true, present: false } or similar object
    expect(result).toHaveProperty('present', false);
  });
});

describe('settings:getAiConfig', () => {
  it('returns AI configuration', async () => {
    const result = await h['settings:getAiConfig'](null);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('provider');
  });
});

describe('settings:setAiConfig', () => {
  it('updates AI provider config', async () => {
    const result = await h['settings:setAiConfig'](null, { provider: 'openai', authMode: 'api-key' });
    expect(result.ok).toBe(true);

    const settings = await h['settings:get'](null);
    expect(settings.aiProvider).toBe('openai');
  });
});

describe('settings:setProviderApiKey', () => {
  it('encrypts and stores API key', async () => {
    const result = await h['settings:setProviderApiKey'](null, 'claude', 'sk-test-key');
    expect(result.ok).toBe(true);
  });

  it('can be loaded back via hasApiKey', async () => {
    await h['settings:setProviderApiKey'](null, 'claude', 'sk-test-key');
    const has = await h['settings:hasApiKey'](null);
    expect(has).toHaveProperty('present', true);
  });
});

describe('settings:clearProviderApiKey', () => {
  it('clears stored API key', async () => {
    await h['settings:setProviderApiKey'](null, 'claude', 'sk-test-key');
    const clearResult = await h['settings:clearProviderApiKey'](null, 'claude');
    expect(clearResult.ok).toBe(true);
  });
});

describe('settings:setApiKey', () => {
  it('stores legacy API key', async () => {
    const result = await h['settings:setApiKey'](null, 'sk-legacy-key');
    expect(result.ok).toBe(true);
  });
});

describe('settings:clearApiKey', () => {
  it('clears legacy API key', async () => {
    await h['settings:setApiKey'](null, 'sk-legacy-key');
    const result = await h['settings:clearApiKey'](null);
    expect(result.ok).toBe(true);
  });
});

describe('settings:testProvider', () => {
  it('tests provider availability', async () => {
    const result = await h['settings:testProvider'](null, 'claude', 'api-key');
    expect(result).toBeDefined();
    // Returns { ok: true/false, ... }
    expect(result).toHaveProperty('ok');
  });
});

describe('settings:getProviderAuthStatus', () => {
  it('returns auth status for provider', async () => {
    const result = await h['settings:getProviderAuthStatus'](null, 'claude');
    expect(result).toBeDefined();
  });
});
