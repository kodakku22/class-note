import * as path from 'path';

export type PluginCommandManifest = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  viewId?: string;
};

export type PluginViewManifest = {
  id: string;
  title: string;
  icon?: string;
  entry: string;
};

export type PluginManifest = {
  apiVersion?: 1;
  id: string;
  name: string;
  version: string;
  commands: PluginCommandManifest[];
  views: PluginViewManifest[];
};

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function assertSafeId(value: unknown, fieldName: string): string {
  const id = asOptionalString(value);
  if (!id || !ID_RE.test(id)) {
    throw new Error(`${fieldName} は英小文字/数字/._- のIDにしてください`);
  }
  return id;
}

export function resolvePluginViewEntry(pluginDir: string, entry: string): string {
  if (!entry || typeof entry !== 'string') {
    throw new Error('view.entry が空です');
  }
  const normalizedEntry = entry.replace(/\\/g, '/');
  if (
    path.isAbsolute(normalizedEntry) ||
    normalizedEntry.startsWith('/') ||
    normalizedEntry.split('/').includes('..') ||
    normalizedEntry.includes('\0')
  ) {
    throw new Error('view.entry はpluginディレクトリ内の相対HTMLにしてください');
  }
  if (path.extname(normalizedEntry).toLowerCase() !== '.html') {
    throw new Error('view.entry は .html にしてください');
  }
  const root = path.resolve(pluginDir);
  const full = path.resolve(root, normalizedEntry);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('view.entry がpluginディレクトリ外を指しています');
  }
  return full;
}

export function parsePluginManifest(raw: unknown, pluginDir: string): PluginManifest {
  const obj = asObject(raw);
  if (!obj) throw new Error('plugin.json はJSONオブジェクトにしてください');
  const apiVersion = obj.apiVersion === undefined ? 1 : obj.apiVersion;
  if (apiVersion !== 1) throw new Error('未対応の plugin apiVersion です');

  const id = assertSafeId(obj.id, 'plugin.id');
  const name = asOptionalString(obj.name);
  const version = asOptionalString(obj.version);
  if (!name) throw new Error('plugin.name が必要です');
  if (!version) throw new Error('plugin.version が必要です');

  const views: PluginViewManifest[] = [];
  const viewIds = new Set<string>();
  for (const rawView of Array.isArray(obj.views) ? obj.views : []) {
    const viewObj = asObject(rawView);
    if (!viewObj) throw new Error('views[] はオブジェクトにしてください');
    const viewId = assertSafeId(viewObj.id, 'view.id');
    if (viewIds.has(viewId)) throw new Error(`view.id が重複しています: ${viewId}`);
    const title = asOptionalString(viewObj.title);
    const entry = asOptionalString(viewObj.entry);
    if (!title) throw new Error(`view.title が必要です: ${viewId}`);
    if (!entry) throw new Error(`view.entry が必要です: ${viewId}`);
    resolvePluginViewEntry(pluginDir, entry);
    viewIds.add(viewId);
    views.push({
      id: viewId,
      title,
      entry,
      ...(asOptionalString(viewObj.icon) ? { icon: asOptionalString(viewObj.icon) } : {}),
    });
  }

  const commands: PluginCommandManifest[] = [];
  const commandIds = new Set<string>();
  for (const rawCommand of Array.isArray(obj.commands) ? obj.commands : []) {
    const commandObj = asObject(rawCommand);
    if (!commandObj) throw new Error('commands[] はオブジェクトにしてください');
    const commandId = assertSafeId(commandObj.id, 'command.id');
    if (commandIds.has(commandId)) throw new Error(`command.id が重複しています: ${commandId}`);
    const title = asOptionalString(commandObj.title);
    if (!title) throw new Error(`command.title が必要です: ${commandId}`);
    const viewId = asOptionalString(commandObj.viewId);
    if (viewId && !viewIds.has(viewId)) {
      throw new Error(`command.viewId が存在しません: ${viewId}`);
    }
    commandIds.add(commandId);
    commands.push({
      id: commandId,
      title,
      ...(asOptionalString(commandObj.subtitle) ? { subtitle: asOptionalString(commandObj.subtitle) } : {}),
      ...(asOptionalString(commandObj.icon) ? { icon: asOptionalString(commandObj.icon) } : {}),
      ...(viewId ? { viewId } : {}),
    });
  }

  return {
    apiVersion: 1,
    id,
    name,
    version,
    commands,
    views,
  };
}
