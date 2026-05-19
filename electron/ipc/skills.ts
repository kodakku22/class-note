// IPC for the Obsidian Skills bridge. Renderer can:
//  - Detect the CLI (and its version)
//  - Re-detect after the user installs (clears the cache)
//  - Run a CLI-backed vault analysis
//
// The renderer falls back to the in-process AI agent (`ai.analyzeVault`) when
// the CLI isn't installed. Both produce comparable outputs.
import { ipcMain } from 'electron';
import {
  detectObsidianCLI,
  clearDetectionCache,
  analyzeWithCLI,
} from '../skills/obsidian-bridge';
import { createInteropReport } from '../skills/interop-report';

export function createSkillsHandlers() {
  return {
    'skills:detectObsidian': async (_e: unknown) => {
      const r = await detectObsidianCLI();
      return r ? { ok: true, path: r.path, version: r.version } : { ok: false };
    },

    'skills:redetectObsidian': async (_e: unknown) => {
      clearDetectionCache();
      const r = await detectObsidianCLI();
      return r ? { ok: true, path: r.path, version: r.version } : { ok: false };
    },

    'skills:analyzeWithObsidianCLI': async (_e: unknown, vaultPath: string) => {
      return analyzeWithCLI(vaultPath);
    },

    'skills:interopReport': async (_e: unknown, vaultPath: string) => {
      try {
        return await createInteropReport(vaultPath);
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerSkillsHandlers() {
  const handlers = createSkillsHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
