// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const mockGetStatus = vi.fn();
const mockRebuild = vi.fn();

vi.mock('../../electron/vault-index', () => ({
  getVaultIndexStatus: (...args: unknown[]) => mockGetStatus(...args),
  rebuildVaultIndex: (...args: unknown[]) => mockRebuild(...args),
}));

import { createIndexHandlers } from '../../electron/ipc/index';

type Handlers = ReturnType<typeof createIndexHandlers>;
let h: Handlers;

beforeEach(() => {
  vi.clearAllMocks();
  h = createIndexHandlers();
});

describe('index:status', () => {
  it('returns vault index status', async () => {
    const status = { ready: true, fileCount: 100 };
    mockGetStatus.mockResolvedValue(status);

    const result = await h['index:status'](null, '/vault');
    expect(result).toEqual(status);
    expect(mockGetStatus).toHaveBeenCalledWith('/vault');
  });
});

describe('index:rebuild', () => {
  it('returns ok with fileCount on success', async () => {
    mockRebuild.mockResolvedValue({ files: new Array(50) });

    const result = await h['index:rebuild'](null, '/vault');
    expect(result).toEqual({ ok: true, fileCount: 50 });
    expect(mockRebuild).toHaveBeenCalledWith('/vault');
  });

  it('returns error on failure', async () => {
    mockRebuild.mockRejectedValue(new Error('index corrupt'));

    const result = await h['index:rebuild'](null, '/vault');
    expect(result).toEqual({ ok: false, error: 'Error: index corrupt' });
  });
});
