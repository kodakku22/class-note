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

const mockGetCurrentVaultPath = vi.fn();
vi.mock('../../electron/ipc/utils', () => ({
  getCurrentVaultPath: () => mockGetCurrentVaultPath(),
}));

const mockReadFile = vi.fn();
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: (...args: any[]) => mockReadFile(...args),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../electron/logger', () => ({
  getLogFilePath: () => '/tmp/test.log',
  redactSecrets: (s: string) => `[redacted]${s}`,
}));

const mockGetVaultIndexStatus = vi.fn();
vi.mock('../../electron/vault-index', () => ({
  getVaultIndexStatus: (...args: any[]) => mockGetVaultIndexStatus(...args),
}));

const mockBuildReport = vi.fn().mockReturnValue({ summary: 'test' });
vi.mock('../../electron/diagnostics-report', () => ({
  buildDiagnosticsReport: (...args: unknown[]) => mockBuildReport(...args),
}));

import { createDiagnosticsHandlers, registerDiagnosticsHandlers } from '../../electron/ipc/diagnostics';
import { ipcMain } from 'electron';

// --------------------------------------------------------------------------
// Coverage targets:
//   - readRecentLogLines success path (reads and splits log)
//   - readRecentLogLines error path (file not found)
//   - vaultPath truthy branch (getVaultIndexStatus called)
//   - vaultPath null branch (indexStatus defaulted)
//   - registerDiagnosticsHandlers
//   - apiKey configured = true
// --------------------------------------------------------------------------

describe('diagnostics:export – additional branches', () => {
  let h: ReturnType<typeof createDiagnosticsHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockResolvedValue({ theme: 'dark' });
    mockLoadSelectedAiApiKey.mockResolvedValue(null);
    mockGetCurrentVaultPath.mockReturnValue(null);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockGetVaultIndexStatus.mockResolvedValue({ ready: true, fileCount: 10 });
    h = createDiagnosticsHandlers();
  });

  it('reads log lines successfully when file exists', async () => {
    mockReadFile.mockResolvedValue('line1\nline2\nline3\n');
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    // Log lines should have been passed to buildDiagnosticsReport
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.logLines).toBeDefined();
    expect(reportArgs.logLines.length).toBeGreaterThan(0);
  });

  it('handles missing log file gracefully', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    // Log lines should be empty
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.logLines).toEqual([]);
  });

  it('fetches vault index status when vault path is set', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    expect(mockGetVaultIndexStatus).toHaveBeenCalledWith('/vault');
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.index).toEqual({ ready: true, fileCount: 10 });
  });

  it('defaults index status when vault path is null', async () => {
    mockGetCurrentVaultPath.mockReturnValue(null);
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    expect(mockGetVaultIndexStatus).not.toHaveBeenCalled();
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.index).toEqual({ ready: false, fileCount: 0 });
  });

  it('handles getVaultIndexStatus error gracefully', async () => {
    mockGetCurrentVaultPath.mockReturnValue('/vault');
    mockGetVaultIndexStatus.mockRejectedValue(new Error('index error'));
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.index).toEqual({ ready: false, fileCount: 0 });
  });

  it('reports apiKeyConfigured as true when key exists', async () => {
    mockLoadSelectedAiApiKey.mockResolvedValue('sk-test-key');
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.apiKeyConfigured).toBe(true);
  });

  it('reports apiKeyConfigured as false when key is null', async () => {
    mockLoadSelectedAiApiKey.mockResolvedValue(null);
    const result = await h['diagnostics:export'](null);
    expect(result.ok).toBe(true);
    const reportArgs = mockBuildReport.mock.calls[0][0];
    expect(reportArgs.apiKeyConfigured).toBe(false);
  });
});

describe('registerDiagnosticsHandlers', () => {
  it('registers diagnostics:export handler with ipcMain', () => {
    registerDiagnosticsHandlers();
    const mockHandle = ipcMain.handle as ReturnType<typeof vi.fn>;
    const channels = mockHandle.mock.calls.map((c: any[]) => c[0]);
    expect(channels).toContain('diagnostics:export');
  });
});
