import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AiAuthMode, AiModelSettings, AiProvider, ProviderAuthStatus } from '../../types';

type ProviderKey = Exclude<AiProvider, 'none'>;

export type AiConfig = {
  provider: AiProvider;
  authMode: AiAuthMode;
  model: string;
  models: AiModelSettings;
};

export type AiTestState = {
  provider: ProviderKey;
  authMode: AiAuthMode;
  ok: boolean;
} | null;

type Props = {
  compact?: boolean;
  onChanged?: (config: AiConfig) => void;
  onStatusChanged?: (statuses: Partial<Record<ProviderKey, ProviderAuthStatus>>) => void;
  onTestStateChanged?: (state: AiTestState) => void;
};

const DEFAULT_MODELS: AiModelSettings = {
  openai: 'gpt-5.5',
  gemini: 'gemini-3.1-pro-preview',
  claudeApi: 'claude-sonnet-4-6',
  claudeLogin: 'sonnet',
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'claude',
  authMode: 'login',
  model: DEFAULT_MODELS.claudeLogin,
  models: DEFAULT_MODELS,
};

const PROVIDERS: Array<{ id: AiProvider; label: string; short: string; help: string }> = [
  { id: 'openai', label: 'GPT', short: 'GPT', help: 'OpenAI API / Codex CLI' },
  { id: 'gemini', label: 'Gemini', short: 'Gemini', help: 'Gemini API / Gemini CLI' },
  { id: 'claude', label: 'Claude', short: 'Claude', help: 'Anthropic API / Claude Code CLI' },
  { id: 'none', label: 'Off', short: 'Off', help: 'AI機能を無効化' },
];

const MODEL_OPTIONS: Record<string, Array<{ id: string; label: string }>> = {
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  ],
  gemini: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  claudeApi: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  claudeLogin: [
    { id: 'sonnet', label: 'Sonnet alias' },
    { id: 'opus', label: 'Opus alias' },
    { id: 'haiku', label: 'Haiku alias' },
  ],
};

export function providerShortLabel(provider: AiProvider): string {
  return PROVIDERS.find((p) => p.id === provider)?.short ?? 'AI';
}

export function providerDisplayName(provider: AiProvider): string {
  return PROVIDERS.find((p) => p.id === provider)?.label ?? 'AI';
}

export function authModeLabel(authMode: AiAuthMode): string {
  return authMode === 'api-key' ? 'APIキー' : 'ログイン';
}

export function providerThemeClass(provider: AiProvider): string {
  return `provider-${provider}`;
}

export type AiStatusTone = 'ready' | 'warning' | 'off' | 'error';

export function aiStatusTone(
  config: Pick<AiConfig, 'provider' | 'authMode'>,
  status?: ProviderAuthStatus | null,
  testState?: AiTestState
): AiStatusTone {
  if (config.provider === 'none') return 'off';
  if (
    testState &&
    testState.provider === config.provider &&
    testState.authMode === config.authMode &&
    !testState.ok
  ) {
    return 'error';
  }
  if (!status) return 'warning';
  if (config.authMode === 'api-key') {
    return status.apiKeyConfigured ? 'ready' : 'warning';
  }
  if (!status.login.installed) return 'error';
  return status.login.loggedIn ? 'ready' : 'warning';
}

export function aiStatusText(
  config: Pick<AiConfig, 'provider' | 'authMode'>,
  status?: ProviderAuthStatus | null,
  testState?: AiTestState
): string {
  const tone = aiStatusTone(config, status, testState);
  if (tone === 'off') return 'AI無効';
  if (
    testState &&
    testState.provider === config.provider &&
    testState.authMode === config.authMode &&
    !testState.ok
  ) {
    return '接続テスト失敗';
  }
  if (!status) return '状態確認中';
  if (config.authMode === 'api-key') {
    return status.apiKeyConfigured ? '利用可能' : 'APIキー未設定';
  }
  if (!status.login.installed) return 'CLI未検出';
  return status.login.loggedIn ? '利用可能' : '未ログイン';
}

export function modelKey(provider: AiProvider, authMode: AiAuthMode): keyof AiModelSettings | null {
  if (provider === 'openai') return 'openai';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'claude') return authMode === 'api-key' ? 'claudeApi' : 'claudeLogin';
  return null;
}

export function selectedModel(config: AiConfig): string {
  const key = modelKey(config.provider, config.authMode);
  return key ? config.models[key] : '';
}

function optionsFor(config: AiConfig): Array<{ id: string; label: string }> {
  const key = modelKey(config.provider, config.authMode);
  return key ? MODEL_OPTIONS[key] ?? [] : [];
}

function consoleUrl(provider: ProviderKey): string {
  if (provider === 'openai') return 'https://platform.openai.com/api-keys';
  if (provider === 'gemini') return 'https://aistudio.google.com/app/apikey';
  return 'https://console.anthropic.com/settings/keys';
}

function loginCommand(provider: ProviderKey): string {
  if (provider === 'openai') return 'codex --login';
  if (provider === 'gemini') return 'gemini';
  return 'claude auth login';
}

export function CurrentAiPill({
  config,
  status,
  testState,
  compact = false,
}: {
  config: AiConfig;
  status?: ProviderAuthStatus | null;
  testState?: AiTestState;
  compact?: boolean;
}) {
  const tone = aiStatusTone(config, status, testState);
  const statusText = aiStatusText(config, status, testState);
  const model = selectedModel(config) || config.model;
  const details =
    config.provider === 'none'
      ? ['AI無効']
      : [authModeLabel(config.authMode), model, statusText].filter(Boolean);

  return (
    <div
      className={[
        'current-ai-pill',
        providerThemeClass(config.provider),
        `tone-${tone}`,
        compact ? 'compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`使用中: ${providerDisplayName(config.provider)}${details.length ? `, ${details.join(', ')}` : ''}`}
    >
      <span className="current-ai-dot" aria-hidden="true" />
      <span className="current-ai-main">使用中: {providerDisplayName(config.provider)}</span>
      <span className="current-ai-details">{details.join(' · ')}</span>
    </div>
  );
}

export function AiSettingsPanel({
  compact = false,
  onChanged,
  onStatusChanged,
  onTestStateChanged,
}: Props) {
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [statuses, setStatuses] = useState<Partial<Record<ProviderKey, ProviderAuthStatus>>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testState, setTestState] = useState<AiTestState>(null);

  const activeProvider = config.provider === 'none' ? null : config.provider;
  const modelOptions = useMemo(() => optionsFor(config), [config]);
  const currentModel = selectedModel(config) || config.model;
  const currentStatus = activeProvider ? statuses[activeProvider] : null;

  const refreshStatus = useCallback(async () => {
    const result = await window.api.settings.getProviderAuthStatus();
    if (result.ok) {
      setStatuses(result.providers);
      onStatusChanged?.(result.providers);
    }
  }, [onStatusChanged]);

  const loadConfig = useCallback(async () => {
    const loaded = await window.api.settings.getAiConfig();
    const next = {
      provider: loaded.provider,
      authMode: loaded.authMode,
      model: loaded.model,
      models: { ...DEFAULT_MODELS, ...loaded.models },
    };
    setConfig(next);
    onChanged?.(next);
  }, [onChanged]);

  useEffect(() => {
    void loadConfig();
    void refreshStatus();
  }, [loadConfig, refreshStatus]);

  const applyConfig = async (partial: {
    provider?: AiProvider;
    authMode?: AiAuthMode;
    model?: string;
  }) => {
    const provider = partial.provider ?? config.provider;
    const authMode = partial.authMode ?? config.authMode;
    const key = modelKey(provider, authMode);
    const models = { ...config.models };
    if (key && partial.model) models[key] = partial.model;
    const optimistic: AiConfig = {
      provider,
      authMode,
      model: key ? models[key] : '',
      models,
    };
    setConfig(optimistic);
    onChanged?.(optimistic);
    setTestState(null);
    onTestStateChanged?.(null);
    const result = await window.api.settings.setAiConfig(partial);
    if (result.ok && result.config) {
      const saved = {
        provider: result.config.provider,
        authMode: result.config.authMode,
        model: result.config.model,
        models: { ...DEFAULT_MODELS, ...result.config.models },
      };
      setConfig(saved);
      onChanged?.(saved);
    } else if (!result.ok) {
      setMessage(result.error ?? 'AI設定を保存できませんでした');
    }
  };

  const saveApiKey = async () => {
    if (!activeProvider || !apiKeyInput.trim()) return;
    const result = await window.api.settings.setProviderApiKey(activeProvider, apiKeyInput.trim());
    if (result.ok) {
      setApiKeyInput('');
      setMessage('APIキーを保存しました');
      await refreshStatus();
    } else {
      setMessage(result.error ?? 'APIキーを保存できませんでした');
    }
  };

  const clearApiKey = async () => {
    if (!activeProvider) return;
    await window.api.settings.clearProviderApiKey(activeProvider);
    setMessage('APIキーを削除しました');
    await refreshStatus();
  };

  const login = async () => {
    if (!activeProvider) return;
    const result = await window.api.settings.loginProvider(activeProvider);
    setMessage(result.ok ? `${loginCommand(activeProvider)} を起動しました` : result.error ?? 'ログインを起動できませんでした');
    setTimeout(() => void refreshStatus(), 1500);
  };

  const testProvider = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await window.api.settings.setAiConfig({
        provider: config.provider,
        authMode: config.authMode,
        model: currentModel,
      });
      const result = await window.api.settings.testProvider(config.provider, config.authMode);
      const nextTestState =
        config.provider === 'none'
          ? null
          : { provider: config.provider, authMode: config.authMode, ok: result.ok };
      setTestState(nextTestState);
      onTestStateChanged?.(nextTestState);
      setMessage(result.ok ? `接続成功: ${result.response ?? 'OK'}` : result.error ?? '接続に失敗しました');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className={`ai-settings-panel ${compact ? 'compact' : ''}`} aria-label="AI設定">
      <CurrentAiPill config={config} status={currentStatus} testState={testState} compact={compact} />

      <div className="ai-provider-grid" role="group" aria-label="AIプロバイダー">
        {PROVIDERS.map((provider) => {
          const active = config.provider === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              className={['ai-provider-option', providerThemeClass(provider.id), active ? 'active' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => void applyConfig({ provider: provider.id })}
              title={provider.help}
              aria-pressed={active}
            >
              <span className="ai-provider-check" aria-hidden="true">
                {active ? '✓' : ''}
              </span>
              <span className="ai-provider-name">{provider.label}</span>
              {!compact && <span className="ai-provider-help">{provider.help}</span>}
            </button>
          );
        })}
      </div>

      {config.provider !== 'none' && (
        <>
          <div className="ai-auth-toggle" role="group" aria-label="AI認証方式">
            <button
              type="button"
              className={config.authMode === 'api-key' ? 'active' : ''}
              onClick={() => void applyConfig({ authMode: 'api-key' })}
              aria-pressed={config.authMode === 'api-key'}
            >
              APIキー
            </button>
            <button
              type="button"
              className={config.authMode === 'login' ? 'active' : ''}
              onClick={() => void applyConfig({ authMode: 'login' })}
              aria-pressed={config.authMode === 'login'}
            >
              ログイン
            </button>
          </div>

          <label className="ai-field">
            <span>モデル</span>
            <select value={currentModel} onChange={(e) => void applyConfig({ model: e.target.value })}>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>

          {config.authMode === 'api-key' && activeProvider && (
            <div className="ai-key-box">
              <div className="ai-status-line">
                <span className={currentStatus?.apiKeyConfigured ? 'ok' : 'warn'}>
                  {currentStatus?.apiKeyConfigured ? 'APIキー保存済み' : 'APIキー未設定'}
                </span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => window.api.materials.openUrl(consoleUrl(activeProvider))}
                >
                  発行ページ
                </button>
              </div>
              <div className="ai-inline-controls">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={currentStatus?.apiKeyConfigured ? '保存済み、再入力で上書き' : 'API key'}
                  aria-label={`${providerDisplayName(activeProvider)} APIキー`}
                />
                <button type="button" onClick={saveApiKey} disabled={!apiKeyInput.trim()}>
                  保存
                </button>
                {currentStatus?.apiKeyConfigured && (
                  <button type="button" onClick={clearApiKey}>
                    削除
                  </button>
                )}
              </div>
            </div>
          )}

          {config.authMode === 'login' && activeProvider && (
            <div className="ai-login-box">
              <div className="ai-status-line">
                <span className={currentStatus?.login.loggedIn ? 'ok' : 'warn'}>
                  {currentStatus?.login.installed
                    ? currentStatus.login.loggedIn
                      ? 'ログイン済み'
                      : '未ログイン'
                    : 'CLI未検出'}
                </span>
                <code>{loginCommand(activeProvider)}</code>
              </div>
              {currentStatus?.login.error && (
                <div className="ai-status-detail">{currentStatus.login.error.slice(0, 160)}</div>
              )}
              <button type="button" onClick={login}>
                ログインを起動
              </button>
            </div>
          )}

          <div className="ai-actions">
            <button type="button" onClick={testProvider} disabled={testing}>
              {testing ? 'テスト中...' : '接続テスト'}
            </button>
            <button type="button" onClick={() => void refreshStatus()}>
              状態更新
            </button>
          </div>
        </>
      )}

      {config.provider === 'none' && <div className="ai-status-detail">QA / Wiki / 論文AIを無効化します。</div>}
      {message && <div className="ai-message">{message.slice(0, 240)}</div>}
    </section>
  );
}
