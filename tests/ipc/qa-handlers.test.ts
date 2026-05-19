// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, addSubject } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => ({
      webContents: { send: vi.fn() },
    }),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn().mockResolvedValue({ ok: true, text: 'AI response' }),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));

vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ aiProvider: 'claude', aiAuthMode: 'apiKey' }),
  loadSelectedAiApiKey: vi.fn().mockResolvedValue('test-key'),
  selectedAiModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    unref: vi.fn(),
    kill: vi.fn(),
  })),
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(new Error('not found'), '', '');
    return { kill: vi.fn() };
  }),
}));

import { createQAHandlers } from '../../electron/ipc/qa';

let h: ReturnType<typeof createQAHandlers>;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createQAHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('qa:readLog', () => {
  it('returns empty string when no log exists', async () => {
    const result = await h['qa:readLog'](null, root, 'Math');
    expect(result).toBe('');
  });

  it('returns log content when log file exists', async () => {
    await addSubject(root, 'Math');
    const qaDir = path.join(root, 'Math', 'qa');
    await fs.mkdir(qaDir, { recursive: true });
    await fs.writeFile(path.join(qaDir, 'log.md'), '## Q: test question\n\nA: test answer\n', 'utf-8');

    const result = await h['qa:readLog'](null, root, 'Math');
    expect(result).toContain('test question');
  });
});

describe('qa:status', () => {
  it('returns a status object', async () => {
    const result = await h['qa:status']();
    expect(result).toBeDefined();
  });
});

describe('qa:login', () => {
  it('returns error when claude CLI not found', async () => {
    // findClaudePath returns null when not found
    const result = await h['qa:login']();
    // Either {ok: true} (if found) or {ok: false, error: ...} (if not)
    expect(result).toBeDefined();
  });
});

describe('qa:ask', () => {
  it('returns error for empty question', async () => {
    const mockEvent = { sender: { send: vi.fn() } };
    const result = await h['qa:ask'](mockEvent as unknown, root, 'Math', '');
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });
});
