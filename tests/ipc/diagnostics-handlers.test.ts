// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getName: () => 'ClassNotes',
    getVersion: () => '1.0.0-test',
    isPackaged: false,
    getPath: () => '/tmp/test-userdata',
  },
}));

const mockLoadSettings = vi.fn();
const mockLoadSelectedAiApiKey = vi.fn();

vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: (...args: unknown[]) => mockLoadSettings(...args),
  loadSelectedAiApiKey: (...args: unknown[]) => mockLoadSelectedAiApiKey(...args),
}));

vi.mock('../../electron/ipc/utils', () => ({
  getCurrentVaultPath: () => null,
}));

vi.mock('../../electron/logger', () => ({
  getLogFilePath: () => '/tmp/test.log',
  redactSecrets: (s: string) => s,
}));

vi.mock('../../electron/vault-index', () => ({
  getVaultIndexStatus: vi.fn().mockResolvedValue({ ready: false, fileCount: 0 }),
}));

const mockBuildReport = vi.fn().mockReturnValue({ summary: 'test report' });
vi.mock('../../electron/diagnostics-report', () => ({
  buildDiagnosticsReport: (...args: unknown[]) => mockBuildReport(...args),
}));

// Mock fs so we don't actually write files
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { createDiagnosticsHandlers } from '../../electron/ipc/diagnostics';

type Handlers = ReturnType<typeof createDiagnosticsHandlers>;
let h: Handlers;

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadSettings.mockResolvedValue({ theme: 'dark' });
  mockLoadSelectedAiApiKey.mockResolvedValue(null);
  h = createDiagnosticsHandlers();
});

describe('diagnostics:export', () => {
  it('returns ok with filePath on success', async () => {
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    expect(typeof result.filePath).toBe('string');
    expect(result.filePath).toContain('classnotes-diagnostics-');
  });

  it('returns error when settings load fails', async () => {
    mockLoadSettings.mockRejectedValue(new Error('settings broken'));
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('settings broken');
  });
});
