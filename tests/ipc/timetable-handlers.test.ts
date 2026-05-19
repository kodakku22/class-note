// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, readFile } from './_vault-harness';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { createTimetableHandlers } from '../../electron/ipc/timetable';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

type Handlers = ReturnType<typeof createTimetableHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createTimetableHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('timetable:read', () => {
  it('returns default timetable when file does not exist', async () => {
    const result = await h['timetable:read'](null, root);
    expect(result.days).toEqual(['月', '火', '水', '木', '金']);
    expect(result.periods).toBe(6);
    expect(result.cells).toEqual({});
  });

  it('reads existing timetable', async () => {
    const timetable = {
      days: ['Mon', 'Tue', 'Wed'],
      periods: 4,
      cells: { 'Mon-1': 'Math' },
    };
    const fp = path.join(root, '.classnotes', 'timetable.json');
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(timetable), 'utf-8');

    const result = await h['timetable:read'](null, root);
    expect(result.days).toEqual(['Mon', 'Tue', 'Wed']);
    expect(result.periods).toBe(4);
    expect(result.cells).toEqual({ 'Mon-1': 'Math' });
  });
});

describe('timetable:write', () => {
  it('writes timetable to file', async () => {
    const timetable = {
      days: ['月', '火'],
      periods: 3,
      cells: { '月-1': '数学' },
    };
    const result = await h['timetable:write'](null, root, timetable);
    expect(result).toEqual({ ok: true });

    const fp = path.join(root, '.classnotes', 'timetable.json');
    const written = JSON.parse(await readFile(fp));
    expect(written.days).toEqual(['月', '火']);
    expect(written.cells).toEqual({ '月-1': '数学' });
  });

  it('roundtrips read after write', async () => {
    const timetable = {
      days: ['A', 'B', 'C', 'D', 'E'],
      periods: 5,
      cells: { 'A-1': 'Physics', 'B-2': 'Chemistry' },
    };
    await h['timetable:write'](null, root, timetable);
    const readBack = await h['timetable:read'](null, root);
    expect(readBack).toEqual(timetable);
  });
});
