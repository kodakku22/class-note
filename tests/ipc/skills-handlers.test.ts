// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const mockDetect = vi.fn();
const mockClearCache = vi.fn();
const mockAnalyze = vi.fn();
const mockInteropReport = vi.fn();

vi.mock('../../electron/skills/obsidian-bridge', () => ({
  detectObsidianCLI: (...args: unknown[]) => mockDetect(...args),
  clearDetectionCache: (...args: unknown[]) => mockClearCache(...args),
  analyzeWithCLI: (...args: unknown[]) => mockAnalyze(...args),
}));

vi.mock('../../electron/skills/interop-report', () => ({
  createInteropReport: (...args: unknown[]) => mockInteropReport(...args),
}));

import { createSkillsHandlers } from '../../electron/ipc/skills';

type Handlers = ReturnType<typeof createSkillsHandlers>;
let h: Handlers;

beforeEach(() => {
  vi.clearAllMocks();
  h = createSkillsHandlers();
});

describe('skills:detectObsidian', () => {
  it('returns ok with path and version when CLI found', async () => {
    mockDetect.mockResolvedValue({ path: '/usr/bin/obsidian', version: '1.5.0' });

    const result = await h['skills:detectObsidian'](null);
    expect(result).toEqual({ ok: true, path: '/usr/bin/obsidian', version: '1.5.0' });
  });

  it('returns ok:false when CLI not found', async () => {
    mockDetect.mockResolvedValue(null);

    const result = await h['skills:detectObsidian'](null);
    expect(result).toEqual({ ok: false });
  });
});

describe('skills:redetectObsidian', () => {
  it('clears cache before detecting', async () => {
    mockDetect.mockResolvedValue({ path: '/opt/obsidian', version: '1.6.0' });

    const result = await h['skills:redetectObsidian'](null);
    expect(mockClearCache).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, path: '/opt/obsidian', version: '1.6.0' });
  });
});

describe('skills:analyzeWithObsidianCLI', () => {
  it('passes vaultPath to analyzeWithCLI', async () => {
    const analysis = { files: 42, tags: ['math'] };
    mockAnalyze.mockResolvedValue(analysis);

    const result = await h['skills:analyzeWithObsidianCLI'](null, '/my/vault');
    expect(result).toEqual(analysis);
    expect(mockAnalyze).toHaveBeenCalledWith('/my/vault');
  });
});

describe('skills:interopReport', () => {
  it('returns the Zotero/Obsidian report', async () => {
    mockInteropReport.mockResolvedValue({
      ok: true,
      obsidian: { markdownFiles: 1 },
      zotero: { paperFiles: 1 },
      recommendations: ['ok'],
    });

    const result = await h['skills:interopReport'](null, '/my/vault');
    expect(mockInteropReport).toHaveBeenCalledWith('/my/vault');
    expect(result).toMatchObject({ ok: true, recommendations: ['ok'] });
  });

  it('converts report failures into an IPC-safe error result', async () => {
    mockInteropReport.mockRejectedValue(new Error('outside vault'));

    const result = await h['skills:interopReport'](null, '/bad');
    expect(result).toEqual({ ok: false, error: 'Error: outside vault' });
  });
});
