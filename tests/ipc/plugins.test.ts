// @vitest-environment node
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parsePluginManifest, resolvePluginViewEntry } from '../../electron/plugins/manifest';

const pluginDir = path.resolve('C:/vault/.classnotes/plugins/sample');

describe('Plugin manifest validation', () => {
  it('accepts a minimal sandbox iframe plugin manifest', () => {
    const manifest = parsePluginManifest(
      {
        id: 'sample-plugin',
        name: 'Sample Plugin',
        version: '0.1.0',
        views: [{ id: 'main', title: 'Main View', entry: 'index.html' }],
        commands: [{ id: 'open', title: 'Open Sample', viewId: 'main' }],
      },
      pluginDir
    );
    expect(manifest.id).toBe('sample-plugin');
    expect(manifest.commands[0].viewId).toBe('main');
  });

  it('rejects unsafe ids and unknown API versions', () => {
    expect(() =>
      parsePluginManifest(
        { apiVersion: 2, id: 'sample', name: 'Sample', version: '1.0.0' },
        pluginDir
      )
    ).toThrow(/apiVersion/);
    expect(() =>
      parsePluginManifest(
        { id: '../bad', name: 'Bad', version: '1.0.0' },
        pluginDir
      )
    ).toThrow(/plugin\.id/);
  });

  it('rejects view entries outside the plugin directory', () => {
    expect(() => resolvePluginViewEntry(pluginDir, '../notes.html')).toThrow(/相対HTML/);
    expect(() => resolvePluginViewEntry(pluginDir, 'C:/Windows/win.ini')).toThrow(/相対HTML/);
    expect(() => resolvePluginViewEntry(pluginDir, 'view.js')).toThrow(/\.html/);
  });

  it('rejects commands pointing at unknown views', () => {
    expect(() =>
      parsePluginManifest(
        {
          id: 'sample',
          name: 'Sample',
          version: '1.0.0',
          views: [{ id: 'main', title: 'Main', entry: 'index.html' }],
          commands: [{ id: 'open-other', title: 'Open Other', viewId: 'other' }],
        },
        pluginDir
      )
    ).toThrow(/viewId/);
  });
});
