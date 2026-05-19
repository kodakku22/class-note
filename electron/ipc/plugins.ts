import { ipcMain } from 'electron';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger';
import {
  parsePluginManifest,
  resolvePluginViewEntry,
  type PluginManifest,
} from '../plugins/manifest';
import { exists, validateVaultPath } from './utils';

const PLUGINS_DIR = path.join('.classnotes', 'plugins');
const allowedPluginRoots = new Set<string>();

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function realpathIfExists(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

export function isAllowedPluginAssetPath(filePath: string): boolean {
  const resolved = fsSync.existsSync(filePath)
    ? fsSync.realpathSync.native(filePath)
    : path.resolve(filePath);
  for (const root of allowedPluginRoots) {
    if (isInside(root, resolved)) return true;
  }
  return false;
}

function pluginFileUrl(filePath: string): string {
  return `plugin-file://${encodeURIComponent(path.resolve(filePath))}`;
}

async function loadPluginManifests(vaultPath: string): Promise<Array<{ root: string; manifest: PluginManifest }>> {
  const vaultRoot = path.resolve(vaultPath);
  validateVaultPath(vaultRoot, vaultRoot);
  const pluginsDir = path.join(vaultRoot, PLUGINS_DIR);
  validateVaultPath(pluginsDir, vaultRoot);
  if (!(await exists(pluginsDir))) return [];

  const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  const result: Array<{ root: string; manifest: PluginManifest }> = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const pluginRoot = path.join(pluginsDir, ent.name);
    const realRoot = await realpathIfExists(pluginRoot);
    try {
      validateVaultPath(realRoot, vaultRoot);
      const manifestPath = path.join(realRoot, 'plugin.json');
      const raw = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      const manifest = parsePluginManifest(raw, realRoot);
      allowedPluginRoots.add(realRoot);
      result.push({ root: realRoot, manifest });
    } catch (err) {
      logger.warn('[plugins:list] skipped invalid plugin', { pluginRoot, error: String(err) });
    }
  }
  return result;
}

async function findPlugin(vaultPath: string, pluginId: string): Promise<{ root: string; manifest: PluginManifest } | null> {
  const plugins = await loadPluginManifests(vaultPath);
  return plugins.find((plugin) => plugin.manifest.id === pluginId) ?? null;
}

export function createPluginHandlers() {
  return {
    'plugins:list': async (_e: unknown, vaultPath: string): Promise<PluginManifest[]> => {
      const plugins = await loadPluginManifests(vaultPath);
      return plugins.map((plugin) => plugin.manifest);
    },

    'plugins:runCommand': async (
      _e: unknown,
      vaultPath: string,
      pluginId: string,
      commandId: string
    ) => {
      const plugin = await findPlugin(vaultPath, pluginId);
      if (!plugin) return { ok: false, error: 'plugin not found' };
      const command = plugin.manifest.commands.find((item) => item.id === commandId);
      if (!command) return { ok: false, error: 'command not found' };
      return { ok: true };
    },

    'plugins:getViewUrl': async (
      _e: unknown,
      vaultPath: string,
      pluginId: string,
      viewId: string
    ) => {
      const vaultRoot = path.resolve(vaultPath);
      const plugin = await findPlugin(vaultRoot, pluginId);
      if (!plugin) return { ok: false, error: 'plugin not found' };
      const view = plugin.manifest.views.find((item) => item.id === viewId);
      if (!view) return { ok: false, error: 'view not found' };
      try {
        const entry = resolvePluginViewEntry(plugin.root, view.entry);
        const realEntry = await realpathIfExists(entry);
        validateVaultPath(realEntry, vaultRoot);
        if (!isInside(plugin.root, realEntry)) {
          return { ok: false, error: 'view outside plugin directory' };
        }
        allowedPluginRoots.add(plugin.root);
        return { ok: true, url: pluginFileUrl(realEntry) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  };
}

export function registerPluginHandlers() {
  const handlers = createPluginHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
