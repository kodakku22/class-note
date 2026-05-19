import { ipcMain } from 'electron';
import {
  getResearchDashboard,
  readDeadlines,
  writeDeadlines,
  type ResearchDeadline,
} from '../research/dashboard';

export function createResearchHandlers() {
  return {
    'research:getDashboard': async (_e: unknown, vaultPath: string) => {
      try {
        return { ok: true, dashboard: await getResearchDashboard(vaultPath) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'research:listDeadlines': async (_e: unknown, vaultPath: string) => {
      try {
        return { ok: true, deadlines: await readDeadlines(vaultPath) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'research:saveDeadlines': async (
      _e: unknown,
      vaultPath: string,
      deadlines: ResearchDeadline[]
    ) => {
      try {
        return { ok: true, deadlines: await writeDeadlines(vaultPath, deadlines) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerResearchHandlers() {
  const handlers = createResearchHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
