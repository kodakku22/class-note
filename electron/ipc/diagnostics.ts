import { app, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogFilePath, redactSecrets } from '../logger';
import { getVaultIndexStatus } from '../vault-index';
import { buildDiagnosticsReport } from '../diagnostics-report';
import { loadSelectedAiApiKey, loadSettings } from './settings';
import { getCurrentVaultPath } from './utils';

async function readRecentLogLines(limit = 500): Promise<string[]> {
  try {
    const raw = await fs.readFile(getLogFilePath(), 'utf-8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => redactSecrets(line));
  } catch {
    return [];
  }
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createDiagnosticsHandlers() {
  return {
    'diagnostics:export': async (_e: unknown) => {
      try {
        const settings = await loadSettings();
        const vaultPath = getCurrentVaultPath();
        const logs = await readRecentLogLines(500);
        const indexStatus = vaultPath
          ? await getVaultIndexStatus(vaultPath).catch(() => ({ ready: false, fileCount: 0 }))
          : { ready: false, fileCount: 0 };
        const apiKey = await loadSelectedAiApiKey(settings);

        const report = buildDiagnosticsReport({
          app: {
            name: app.getName(),
            version: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            packaged: app.isPackaged,
          },
          settings,
          apiKeyConfigured: Boolean(apiKey),
          index: indexStatus,
          logLines: logs,
        });

        const dir = path.join(app.getPath('userData'), 'diagnostics');
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, `classnotes-diagnostics-${timestampForFile()}.json`);
        await fs.writeFile(filePath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
        return { ok: true, filePath };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerDiagnosticsHandlers(): void {
  const handlers = createDiagnosticsHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
