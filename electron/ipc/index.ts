import { ipcMain } from 'electron';
import { getVaultIndexStatus, rebuildVaultIndex } from '../vault-index';

export function createIndexHandlers() {
  return {
    'index:status': async (_e: unknown, vaultPath: string) => {
      return getVaultIndexStatus(vaultPath);
    },

    'index:rebuild': async (_e: unknown, vaultPath: string) => {
      try {
        const index = await rebuildVaultIndex(vaultPath);
        return { ok: true, fileCount: index.files.length };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerIndexHandlers(): void {
  const handlers = createIndexHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
