// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const mockAudit = vi.fn();
const mockCreateBackup = vi.fn();
const mockListBackups = vi.fn();
const mockReproReport = vi.fn();

vi.mock('../../electron/vault-safety', () => ({
  auditVaultSafety: (...args: unknown[]) => mockAudit(...args),
  createVaultBackup: (...args: unknown[]) => mockCreateBackup(...args),
  listVaultBackups: (...args: unknown[]) => mockListBackups(...args),
  getResearchReproducibilityReport: (...args: unknown[]) => mockReproReport(...args),
}));

import { createVaultSafetyHandlers } from '../../electron/ipc/vault-safety';

type Handlers = ReturnType<typeof createVaultSafetyHandlers>;
let h: Handlers;

beforeEach(() => {
  vi.clearAllMocks();
  h = createVaultSafetyHandlers();
});

describe('vaultSafety:audit', () => {
  it('returns audit result on success', async () => {
    const audit = { issues: [], score: 100 };
    mockAudit.mockResolvedValue(audit);

    const result = await h['vaultSafety:audit'](null, '/vault');
    expect(result).toEqual({ ok: true, audit });
    expect(mockAudit).toHaveBeenCalledWith('/vault');
  });

  it('returns error on failure', async () => {
    mockAudit.mockRejectedValue(new Error('audit failed'));

    const result = await h['vaultSafety:audit'](null, '/vault');
    expect(result).toEqual({ ok: false, error: 'Error: audit failed' });
  });
});

describe('vaultSafety:createBackup', () => {
  it('returns backup result on success', async () => {
    const backupResult = { ok: true, path: '/backups/v1.zip' };
    mockCreateBackup.mockResolvedValue(backupResult);

    const result = await h['vaultSafety:createBackup'](null, '/vault');
    expect(result).toEqual(backupResult);
  });

  it('returns error on failure', async () => {
    mockCreateBackup.mockRejectedValue(new Error('disk full'));

    const result = await h['vaultSafety:createBackup'](null, '/vault');
    expect(result).toEqual({ ok: false, error: 'Error: disk full' });
  });
});

describe('vaultSafety:listBackups', () => {
  it('returns backups list on success', async () => {
    const backups = [{ name: 'backup-1', date: '2025-01-01' }];
    mockListBackups.mockResolvedValue(backups);

    const result = await h['vaultSafety:listBackups'](null, '/vault');
    expect(result).toEqual({ ok: true, backups });
  });
});

describe('research:reproducibilityReport', () => {
  it('returns report on success', async () => {
    const report = { score: 85, items: [] };
    mockReproReport.mockResolvedValue(report);

    const result = await h['research:reproducibilityReport'](null, '/vault');
    expect(result).toEqual({ ok: true, report });
  });

  it('returns error on failure', async () => {
    mockReproReport.mockRejectedValue(new Error('no data'));

    const result = await h['research:reproducibilityReport'](null, '/vault');
    expect(result.ok).toBe(false);
  });
});
