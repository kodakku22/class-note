import { ipcMain } from 'electron';
import {
  auditVaultSafety,
  createVaultBackup,
  getResearchReproducibilityReport,
  listVaultBackups,
} from '../vault-safety';

export function createVaultSafetyHandlers() {
  return {
    'vaultSafety:audit': async (_e: unknown, vaultPath: string) => {
      try {
        return { ok: true, audit: await auditVaultSafety(vaultPath) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'vaultSafety:createBackup': async (_e: unknown, vaultPath: string) => {
      try {
        return await createVaultBackup(vaultPath);
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'vaultSafety:listBackups': async (_e: unknown, vaultPath: string) => {
      try {
        return { ok: true, backups: await listVaultBackups(vaultPath) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'research:reproducibilityReport': async (_e: unknown, vaultPath: string) => {
      try {
        return { ok: true, report: await getResearchReproducibilityReport(vaultPath) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerVaultSafetyHandlers(): void {
  const handlers = createVaultSafetyHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
