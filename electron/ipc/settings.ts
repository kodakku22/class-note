import { ipcMain, app, safeStorage } from 'electron';
import { execFile, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { atomicWrite, exists, findClaudePath, findCodexPath, findGcloudPath, findGeminiPath } from './utils';
import {
  setOfflineMode,
  ALL_MODELS,
  modelDeprecation,
  modelDeprecationSeverity,
  type ModelEntry,
  type ModelDeprecationSeverity,
} from '../ai/provider';
import {
  DEFAULT_AI_MODELS,
  SettingsSchema,
  type AiAuthMode,
  type AiModelSettings,
  type AiProvider,
  type Settings,
} from './schemas';

export type { Settings };
export type { AiAuthMode, AiModelSettings, AiProvider };

type ApiKeyProvider = Exclude<AiProvider, 'none'>;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

const API_KEY_FILES: Record<ApiKeyProvider, string> = {
  openai: 'openai-api-key.bin',
  gemini: 'gemini-api-key.bin',
  claude: 'anthropic-api-key.bin',
};

function normalizeApiKeyProvider(provider: string): ApiKeyProvider {
  if (provider === 'openai' || provider === 'gemini' || provider === 'claude') return provider;
  if (provider === 'anthropic-api' || provider === 'claude-cli') return 'claude';
  throw new Error('Unsupported AI provider');
}

function apiKeyPath(provider: string = 'claude'): string {
  // Encrypted blob — Windows DPAPI / macOS Keychain / Linux libsecret via safeStorage.
  return path.join(app.getPath('userData'), API_KEY_FILES[normalizeApiKeyProvider(provider)]);
}

/**
 * Load the user's Anthropic API key. Returns null when unset, when the OS
 * cannot decrypt (e.g. user reset their login keychain), or when safeStorage
 * is unavailable.
 */
export async function loadApiKey(): Promise<string | null> {
  return loadProviderApiKey('claude');
}

export async function loadProviderApiKey(provider: string): Promise<string | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const keyPath = apiKeyPath(provider);
    if (!(await exists(keyPath))) return null;
    const buf = await fs.readFile(keyPath);
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

async function saveApiKey(key: string): Promise<void> {
  return saveProviderApiKey('claude', key);
}

async function saveProviderApiKey(provider: string, key: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS の暗号化ストレージが利用できません');
  }
  const keyPath = apiKeyPath(provider);
  await fs.mkdir(path.dirname(keyPath), { recursive: true });
  const blob = safeStorage.encryptString(key);
  await atomicWrite(keyPath, blob);
}

async function clearApiKey(): Promise<void> {
  return clearProviderApiKey('claude');
}

async function clearProviderApiKey(provider: string): Promise<void> {
  try {
    await fs.unlink(apiKeyPath(provider));
  } catch {
    // ignore
  }
}

export function selectedAiModel(settings: Settings): string {
  const models = { ...DEFAULT_AI_MODELS, ...(settings.aiModels ?? {}) };
  if (settings.aiProvider === 'openai') return models.openai;
  if (settings.aiProvider === 'gemini') return models.gemini;
  if (settings.aiProvider === 'claude') {
    return settings.aiAuthMode === 'api-key' ? models.claudeApi : models.claudeLogin;
  }
  return '';
}

export async function loadSelectedAiApiKey(settings: Settings): Promise<string | null> {
  if (settings.aiProvider === 'none' || settings.aiAuthMode !== 'api-key') return null;
  return loadProviderApiKey(settings.aiProvider);
}

function modelKeyFor(provider: AiProvider, authMode: AiAuthMode): keyof AiModelSettings | null {
  if (provider === 'openai') return 'openai';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'claude') return authMode === 'api-key' ? 'claudeApi' : 'claudeLogin';
  return null;
}

function normalizeModelPatch(
  current: Settings,
  partial: {
    provider?: AiProvider;
    authMode?: AiAuthMode;
    model?: string;
    models?: Partial<AiModelSettings>;
  }
): Settings {
  const provider = partial.provider ?? current.aiProvider;
  const authMode = partial.authMode ?? current.aiAuthMode;
  const models = { ...DEFAULT_AI_MODELS, ...(current.aiModels ?? {}), ...(partial.models ?? {}) };
  const key = modelKeyFor(provider, authMode);
  if (key && typeof partial.model === 'string' && partial.model.trim()) {
    models[key] = partial.model.trim();
  }
  return SettingsSchema.parse({
    ...current,
    aiProvider: provider,
    aiAuthMode: authMode,
    aiModels: models,
    aiApiModel: models.claudeApi,
    model: models.claudeLogin,
  });
}

function execFileShort(
  file: string,
  args: string[],
  timeoutMs = 10_000
): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        error: err ? String(err) : undefined,
      });
    });
  });
}

export type ProviderLoginStatus = {
  installed: boolean;
  loggedIn: boolean;
  path?: string;
  error?: string;
};

function cliMissingMessage(provider: AiProvider): string {
  if (provider === 'openai') {
    return 'codex CLI が見つかりません。Codex CLI をインストールし、PATH または WindowsApps / %LOCALAPPDATA%\\OpenAI\\Codex\\bin から起動できる状態にしてください。';
  }
  if (provider === 'gemini') {
    return 'gemini CLI / gcloud CLI が見つかりません。Gemini CLI をインストールするか、Google Cloud SDK をインストールして gcloud auth application-default login を実行できる状態にしてください。';
  }
  return 'claude CLI が見つかりません。Claude Code CLI をインストールし、PATH または %USERPROFILE%\\.local\\bin / %APPDATA%\\npm から起動できる状態にしてください。';
}

async function checkProviderLoginStatus(provider: AiProvider): Promise<ProviderLoginStatus> {
  if (provider === 'none') return { installed: false, loggedIn: false, error: 'AI disabled' };
  if (provider === 'claude') {
    const p = await findClaudePath();
    if (!p) return { installed: false, loggedIn: false, error: cliMissingMessage(provider) };
    const auth = await execFileShort(p, ['auth', 'status'], 8_000);
    if (auth.ok) return { installed: true, loggedIn: true, path: p };
    const version = await execFileShort(p, ['--version'], 5_000);
    return {
      installed: version.ok,
      loggedIn: version.ok && /unknown command|invalid/i.test(auth.stderr + auth.stdout),
      path: p,
      error: version.ok ? auth.stderr.trim() || auth.stdout.trim() || undefined : version.error,
    };
  }
  if (provider === 'openai') {
    const p = await findCodexPath();
    if (!p) return { installed: false, loggedIn: false, error: cliMissingMessage(provider) };
    const status = await execFileShort(p, ['login', 'status'], 8_000);
    const out = `${status.stdout}\n${status.stderr}`;
    return {
      installed: true,
      loggedIn: status.ok && !/not\s+logged|not\s+authenticated|no\s+login/i.test(out),
      path: p,
      error: status.ok ? undefined : out.trim() || status.error,
    };
  }
  const geminiPath = await findGeminiPath();
  if (geminiPath) {
    const version = await execFileShort(geminiPath, ['--version'], 5_000);
    return {
      installed: version.ok,
      loggedIn: version.ok,
      path: geminiPath,
      error: version.ok
        ? 'Gemini CLI方式のログイン状態は接続テストで確認します。'
        : version.stderr.trim() || version.error,
    };
  }
  const p = await findGcloudPath();
  if (!p) return { installed: false, loggedIn: false, error: cliMissingMessage(provider) };
  const token = await execFileShort(p, ['auth', 'application-default', 'print-access-token'], 10_000);
  return {
    installed: true,
    loggedIn: token.ok && token.stdout.trim().length > 20,
    path: p,
    error: token.ok ? undefined : token.stderr.trim() || token.error,
  };
}

function launchLogin(provider: AiProvider, executable: string): void {
  const args =
    provider === 'claude'
      ? ['auth', 'login']
      : provider === 'openai'
        ? ['--login']
        : path.basename(executable).toLowerCase().startsWith('gemini')
          ? []
          : ['auth', 'application-default', 'login'];
  const title =
    provider === 'claude' ? 'Claude Login' : provider === 'openai' ? 'OpenAI Login' : 'Gemini Login';
  if (process.platform === 'win32') {
    const command = provider === 'gemini' ? `"${executable}" ${args.join(' ')}` : `"${executable}" ${args.join(' ')}`;
    spawn('cmd.exe', ['/c', 'start', `"${title}"`, 'cmd', '/k', command], {
      detached: true,
      windowsHide: false,
    }).unref();
    return;
  }
  spawn(executable, args, { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Load settings, validating with Zod. If the file is missing or corrupt,
 * fall back to defaults rather than crashing.
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = SettingsSchema.safeParse(parsed);
    const settings = result.success ? result.data : SettingsSchema.parse({});
    // Mirror offlineMode into the provider module so runPrompt() can short-circuit
    // without re-reading settings on every call.
    setOfflineMode(settings.offlineMode ?? false);
    return settings;
  } catch {
    const settings = SettingsSchema.parse({});
    setOfflineMode(settings.offlineMode ?? false);
    return settings;
  }
}

async function saveSettings(s: Settings): Promise<void> {
  // Re-validate before writing to keep on-disk shape canonical
  const validated = SettingsSchema.parse(s);
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await atomicWrite(settingsPath(), JSON.stringify(validated, null, 2));
  // Keep provider-side offlineMode in sync with the latest settings.
  setOfflineMode(validated.offlineMode ?? false);
}

/**
 * Persist window bounds + maximized flag. Called by main.ts on resize/move
 * (debounced) and on maximize/unmaximize. Failures are swallowed — losing
 * window state is annoying but not user-affecting.
 */
export async function setWindowState(
  bounds: { x: number; y: number; width: number; height: number },
  maximized: boolean
): Promise<void> {
  try {
    const current = await loadSettings();
    await saveSettings({ ...current, windowBounds: bounds, windowMaximized: maximized });
  } catch {
    // best effort
  }
}

export function createSettingsHandlers() {
  return {
    'settings:get': async (_e: unknown) => {
      return loadSettings();
    },

    'settings:set': async (_e: unknown, partial: Partial<Settings>) => {
      const current = await loadSettings();
      const next = SettingsSchema.parse({ ...current, ...partial });
      await saveSettings(next);
      return { ok: true };
    },

    // API key management — uses Electron safeStorage (OS keychain) so the key
    // never lands in plaintext on disk. The renderer never reads the key back;
    // it only learns whether one is configured.
    'settings:hasApiKey': async (_e: unknown) => {
      const key = await loadApiKey();
      return { ok: true, present: Boolean(key) };
    },

    'settings:getAiConfig': async (_e: unknown) => {
      const settings = await loadSettings();
      return {
        provider: settings.aiProvider,
        authMode: settings.aiAuthMode,
        model: selectedAiModel(settings),
        models: settings.aiModels,
      };
    },

    /**
     * Phase 4 (S-A): return the full model catalogue with deprecation badges
     * computed for the current time. Renderer Settings UI can render yellow/
     * red badges so users aren't surprised when a model is sunset upstream.
     */
    'settings:getModelCatalogue': async (
      _e: unknown
    ): Promise<{
      models: Array<ModelEntry & { severity?: ModelDeprecationSeverity }>;
    }> => {
      const decorated = ALL_MODELS.map((m) => {
        const dep = modelDeprecation(m.id);
        if (!dep) return m;
        return { ...m, severity: modelDeprecationSeverity(dep) };
      });
      return { models: decorated };
    },

    /**
     * Phase 4 (S-A): check whether the user's currently-selected model has
     * been deprecated. Renderer can surface this on app launch.
     */
    'settings:checkSelectedModelDeprecation': async (
      _e: unknown
    ): Promise<{
      modelId: string;
      deprecation: ReturnType<typeof modelDeprecation>;
      severity: ModelDeprecationSeverity | null;
    }> => {
      const settings = await loadSettings();
      const modelId = selectedAiModel(settings);
      const dep = modelDeprecation(modelId);
      return {
        modelId,
        deprecation: dep,
        severity: dep ? modelDeprecationSeverity(dep) : null,
      };
    },

    'settings:setAiConfig': async (
      _e: unknown,
      partial: {
        provider?: AiProvider;
        authMode?: AiAuthMode;
        model?: string;
        models?: Partial<AiModelSettings>;
      }
    ) => {
      try {
        const current = await loadSettings();
        const next = normalizeModelPatch(current, partial ?? {});
        await saveSettings(next);
        return { ok: true, config: { provider: next.aiProvider, authMode: next.aiAuthMode, model: selectedAiModel(next), models: next.aiModels } };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'settings:getProviderAuthStatus': async (_e: unknown, provider?: AiProvider) => {
      const providers: ApiKeyProvider[] =
        provider && provider !== 'none' ? [provider] : ['openai', 'gemini', 'claude'];
      const entries = await Promise.all(
        providers.map(async (p) => {
          const [apiKey, login] = await Promise.all([
            loadProviderApiKey(p),
            checkProviderLoginStatus(p),
          ]);
          return [
            p,
            {
              provider: p,
              apiKeyConfigured: Boolean(apiKey),
              login,
            },
          ] as const;
        })
      );
      return { ok: true, providers: Object.fromEntries(entries) };
    },

    'settings:setProviderApiKey': async (_e: unknown, provider: AiProvider, key: string) => {
      if (provider === 'none') return { ok: false, error: 'AI provider is disabled' };
      if (typeof key !== 'string' || key.trim().length < 10 || key.length > 4000) {
        return { ok: false, error: 'API キーの形式が正しくありません' };
      }
      try {
        await saveProviderApiKey(provider, key.trim());
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'settings:clearProviderApiKey': async (_e: unknown, provider: AiProvider) => {
      if (provider !== 'none') await clearProviderApiKey(provider);
      return { ok: true };
    },

    'settings:loginProvider': async (_e: unknown, provider: AiProvider) => {
      if (provider === 'none') return { ok: false, error: 'AI provider is disabled' };
      const executable =
        provider === 'claude'
          ? await findClaudePath()
          : provider === 'openai'
            ? await findCodexPath()
            : (await findGeminiPath()) ?? (await findGcloudPath());
      if (!executable) return { ok: false, error: cliMissingMessage(provider) };
      launchLogin(provider, executable);
      return { ok: true };
    },

    'settings:setApiKey': async (_e: unknown, key: string) => {
      if (typeof key !== 'string' || key.length < 10 || key.length > 1000) {
        return { ok: false, error: 'API キーの形式が正しくありません' };
      }
      try {
        await saveApiKey(key.trim());
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    'settings:clearApiKey': async (_e: unknown) => {
      await clearApiKey();
      return { ok: true };
    },

    // Test the configured AI provider end-to-end with a tiny prompt. Used by
    // Settings UI to give the user immediate feedback that their API key /
    // model ID combo actually works, before they spend minutes on a Wiki
    // compile only to fail.
    'settings:testProvider': async (_e: unknown, provider?: AiProvider, authMode?: AiAuthMode) => {
      const loaded = await loadSettings();
      const settings = normalizeModelPatch(loaded, {
        ...(provider ? { provider } : {}),
        ...(authMode ? { authMode } : {}),
      });
      const apiKey = await loadSelectedAiApiKey(settings);
      // Lazy import to keep this handler's footprint small and avoid a circular
      // import (settings.ts ↔ ai/provider.ts both depend on each other otherwise).
      const { runPrompt } = await import('../ai/provider');
      const r = await runPrompt(settings.aiProvider, {
        authMode: settings.aiAuthMode,
        prompt: 'Reply with exactly the two characters: OK',
        timeoutMs: 30_000,
        model: selectedAiModel(settings),
        apiKey: apiKey ?? undefined,
        maxRetries: 0,
      });
      if (!r.ok) return { ok: false, error: r.error };
      const trimmed = r.text.trim();
      return { ok: true, response: trimmed.slice(0, 200) };
    },
  };
}

export function registerSettingsHandlers() {
  const handlers = createSettingsHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
