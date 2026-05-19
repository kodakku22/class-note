// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault } from './_vault-harness';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { createPluginHandlers } from '../../electron/ipc/plugins';

type Handlers = ReturnType<typeof createPluginHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  h = createPluginHandlers();
});

afterEach(async () => {
  await cleanup();
});

describe('plugins:list', () => {
  it('returns empty array when no plugins dir exists', async () => {
    const result = await h['plugins:list'](null, root);
    expect(result).toEqual([]);
  });

  it('returns manifests for valid plugins', async () => {
    const pluginsDir = path.join(root, '.classnotes', 'plugins', 'test-plugin');
    await fs.mkdir(pluginsDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginsDir, 'plugin.json'),
      JSON.stringify({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        views: [{ id: 'main', title: 'Main', entry: 'index.html' }],
        commands: [{ id: 'open', title: 'Open', viewId: 'main' }],
      }),
      'utf-8'
    );
    await fs.writeFile(path.join(pluginsDir, 'index.html'), '<html></html>', 'utf-8');

    const result = await h['plugins:list'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-plugin');
  });
});

describe('plugins:runCommand', () => {
  it('returns error when plugin not found', async () => {
    const result = await h['plugins:runCommand'](null, root, 'nonexistent', 'cmd');
    expect(result).toEqual({ ok: false, error: 'plugin not found' });
  });

  it('returns error when command not found', async () => {
    const pluginsDir = path.join(root, '.classnotes', 'plugins', 'cmd-plugin');
    await fs.mkdir(pluginsDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginsDir, 'plugin.json'),
      JSON.stringify({
        id: 'cmd-plugin',
        name: 'Cmd Plugin',
        version: '1.0.0',
        commands: [{ id: 'run', title: 'Run' }],
      }),
      'utf-8'
    );

    const result = await h['plugins:runCommand'](null, root, 'cmd-plugin', 'nonexistent');
    expect(result).toEqual({ ok: false, error: 'command not found' });
  });
});

describe('plugins:getViewUrl', () => {
  it('returns error when plugin not found', async () => {
    const result = await h['plugins:getViewUrl'](null, root, 'nonexistent', 'main');
    expect(result).toEqual({ ok: false, error: 'plugin not found' });
  });
});
