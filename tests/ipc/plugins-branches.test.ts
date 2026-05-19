// @vitest-environment node
// Tests for uncovered branches in plugins.ts: view URL, command exec, manifest errors
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault } from './_vault-harness';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { createPluginHandlers, isAllowedPluginAssetPath } from '../../electron/ipc/plugins';

type Handlers = ReturnType<typeof createPluginHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

async function setupPlugin(
  name: string,
  manifest: Record<string, unknown>,
  files?: Record<string, string>,
): Promise<string> {
  const pluginDir = path.join(root, '.classnotes', 'plugins', name);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(manifest),
    'utf-8',
  );
  if (files) {
    for (const [fname, content] of Object.entries(files)) {
      const filePath = path.join(pluginDir, fname);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }
  return pluginDir;
}

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  h = createPluginHandlers();
});

afterEach(async () => {
  await cleanup();
});

describe('plugins:list edge cases', () => {
  it('skips non-directory entries', async () => {
    const pluginsDir = path.join(root, '.classnotes', 'plugins');
    await fs.mkdir(pluginsDir, { recursive: true });
    // Create a file where a plugin dir would be
    await fs.writeFile(path.join(pluginsDir, 'not-a-dir'), 'content', 'utf-8');

    const result = await h['plugins:list'](null, root);
    expect(result).toEqual([]);
  });

  it('skips plugins with invalid manifest', async () => {
    const pluginDir = path.join(root, '.classnotes', 'plugins', 'bad-plugin');
    await fs.mkdir(pluginDir, { recursive: true });
    // Invalid JSON
    await fs.writeFile(path.join(pluginDir, 'plugin.json'), 'not json', 'utf-8');

    const result = await h['plugins:list'](null, root);
    expect(result).toEqual([]);
  });

  it('skips plugins with missing plugin.json', async () => {
    const pluginDir = path.join(root, '.classnotes', 'plugins', 'no-manifest');
    await fs.mkdir(pluginDir, { recursive: true });

    const result = await h['plugins:list'](null, root);
    expect(result).toEqual([]);
  });
});

describe('plugins:runCommand', () => {
  it('returns success for existing command', async () => {
    await setupPlugin('cmd-plugin', {
      id: 'cmd-plugin',
      name: 'Cmd Plugin',
      version: '1.0.0',
      commands: [{ id: 'run', title: 'Run' }],
      views: [],
    });

    const result = await h['plugins:runCommand'](null, root, 'cmd-plugin', 'run');
    expect(result).toEqual({ ok: true });
  });
});

describe('plugins:getViewUrl', () => {
  it('returns view URL for valid plugin view', async () => {
    await setupPlugin('view-plugin', {
      id: 'view-plugin',
      name: 'View Plugin',
      version: '1.0.0',
      views: [{ id: 'main', title: 'Main', entry: 'index.html' }],
      commands: [],
    }, { 'index.html': '<html></html>' });

    const result = await h['plugins:getViewUrl'](null, root, 'view-plugin', 'main');
    expect(result.ok).toBe(true);
    expect(result.url).toContain('plugin-file://');
  });

  it('returns error when view not found', async () => {
    await setupPlugin('view-plugin2', {
      id: 'view-plugin2',
      name: 'View Plugin 2',
      version: '1.0.0',
      views: [{ id: 'main', title: 'Main', entry: 'index.html' }],
      commands: [],
    }, { 'index.html': '<html></html>' });

    const result = await h['plugins:getViewUrl'](null, root, 'view-plugin2', 'nonexistent');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('view not found');
  });

  it('returns error when plugin not found for view', async () => {
    const result = await h['plugins:getViewUrl'](null, root, 'nonexistent', 'main');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('plugin not found');
  });
});

describe('isAllowedPluginAssetPath', () => {
  it('returns false for paths not in allowed roots', () => {
    expect(isAllowedPluginAssetPath('/some/random/path.js')).toBe(false);
  });

  it('returns true for paths inside previously loaded plugin roots', async () => {
    // Load a plugin to register its root
    const pluginDir = await setupPlugin('asset-check', {
      id: 'asset-check',
      name: 'Asset Check',
      version: '1.0.0',
      views: [{ id: 'main', title: 'Main', entry: 'index.html' }],
      commands: [],
    }, { 'index.html': '<html></html>' });

    // Loading the plugin registers it
    await h['plugins:list'](null, root);

    // Now the plugin root should be allowed
    const assetPath = path.join(pluginDir, 'style.css');
    await fs.writeFile(assetPath, 'body {}', 'utf-8');
    expect(isAllowedPluginAssetPath(assetPath)).toBe(true);
  });
});
