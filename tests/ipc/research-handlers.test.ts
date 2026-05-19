// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const mockGetDashboard = vi.fn();
const mockReadDeadlines = vi.fn();
const mockWriteDeadlines = vi.fn();

vi.mock('../../electron/research/dashboard', () => ({
  getResearchDashboard: (...args: unknown[]) => mockGetDashboard(...args),
  readDeadlines: (...args: unknown[]) => mockReadDeadlines(...args),
  writeDeadlines: (...args: unknown[]) => mockWriteDeadlines(...args),
}));

import { createResearchHandlers } from '../../electron/ipc/research';

type Handlers = ReturnType<typeof createResearchHandlers>;
let h: Handlers;

beforeEach(() => {
  vi.clearAllMocks();
  h = createResearchHandlers();
});

describe('research:getDashboard', () => {
  it('returns dashboard on success', async () => {
    const dashboard = { papers: 5, notes: 10 };
    mockGetDashboard.mockResolvedValue(dashboard);

    const result = await h['research:getDashboard'](null, '/vault');
    expect(result).toEqual({ ok: true, dashboard });
    expect(mockGetDashboard).toHaveBeenCalledWith('/vault');
  });

  it('returns error on failure', async () => {
    mockGetDashboard.mockRejectedValue(new Error('read failed'));

    const result = await h['research:getDashboard'](null, '/vault');
    expect(result).toEqual({ ok: false, error: 'Error: read failed' });
  });
});

describe('research:listDeadlines', () => {
  it('returns deadlines on success', async () => {
    const deadlines = [{ title: 'Paper A', date: '2025-06-01' }];
    mockReadDeadlines.mockResolvedValue(deadlines);

    const result = await h['research:listDeadlines'](null, '/vault');
    expect(result).toEqual({ ok: true, deadlines });
  });

  it('returns error on failure', async () => {
    mockReadDeadlines.mockRejectedValue(new Error('no file'));

    const result = await h['research:listDeadlines'](null, '/vault');
    expect(result.ok).toBe(false);
  });
});

describe('research:saveDeadlines', () => {
  it('saves deadlines and returns them', async () => {
    const deadlines = [{ title: 'Paper B', date: '2025-07-01' }];
    mockWriteDeadlines.mockResolvedValue(deadlines);

    const result = await h['research:saveDeadlines'](null, '/vault', deadlines);
    expect(result).toEqual({ ok: true, deadlines });
    expect(mockWriteDeadlines).toHaveBeenCalledWith('/vault', deadlines);
  });
});
