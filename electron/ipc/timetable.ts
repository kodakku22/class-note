import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateVaultPath, ensureDir, atomicWrite, backupFile } from './utils';
import { TimetableSchema, type Timetable } from './schemas';

export type { Timetable };

function timetableFile(vaultRoot: string): string {
  return path.join(vaultRoot, '.classnotes', 'timetable.json');
}

export function createTimetableHandlers() {
  return {
    'timetable:read': async (_e: unknown, vaultPath: string): Promise<Timetable> => {
      const root = path.resolve(vaultPath);
      const fp = timetableFile(root);
      validateVaultPath(fp, root);
      try {
        const raw = await fs.readFile(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        const result = TimetableSchema.safeParse(parsed);
        if (result.success) return result.data;
        return TimetableSchema.parse({});
      } catch {
        return TimetableSchema.parse({});
      }
    },

    'timetable:write': async (_e: unknown, vaultPath: string, t: Timetable) => {
      const root = path.resolve(vaultPath);
      const fp = timetableFile(root);
      validateVaultPath(fp, root);
      const validated = TimetableSchema.parse(t);
      await ensureDir(path.dirname(fp));
      await backupFile(fp, root);
      await atomicWrite(fp, JSON.stringify(validated, null, 2));
      return { ok: true };
    },
  };
}

export function registerTimetableHandlers() {
  const handlers = createTimetableHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
