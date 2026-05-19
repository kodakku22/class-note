import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AiSettingsPanel,
  aiStatusText,
  aiStatusTone,
  authModeLabel,
  providerDisplayName,
  selectedModel,
  type AiConfig,
} from '../../src/components/ai/AiSettingsPanel';
import type { AiAuthMode, AiModelSettings, AiProvider, ProviderAuthStatus } from '../../src/types';

type ProviderKey = Exclude<AiProvider, 'none'>;

const DEFAULT_MODELS: AiModelSettings = {
  openai: 'gpt-5.5',
  gemini: 'gemini-3.1-pro-preview',
  claudeApi: 'claude-sonnet-4-6',
  claudeLogin: 'sonnet',
};

function modelFor(config: AiConfig): string {
  if (config.provider === 'openai') return config.models.openai;
  if (config.provider === 'gemini') return config.models.gemini;
  if (config.provider === 'claude') {
    return config.authMode === 'api-key' ? config.models.claudeApi : config.models.claudeLogin;
  }
  return '';
}

function modelKey(provider: AiProvider, authMode: AiAuthMode): keyof AiModelSettings | null {
  if (provider === 'openai') return 'openai';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'claude') return authMode === 'api-key' ? 'claudeApi' : 'claudeLogin';
  return null;
}

function installAiApiMock(
  initial: Partial<AiConfig> = {},
  statusOverrides: Partial<Record<ProviderKey, ProviderAuthStatus>> = {},
  testResult: { ok: boolean; response?: string; error?: string } = { ok: true, response: 'OK' }
) {
  let config: AiConfig = {
    provider: 'openai',
    authMode: 'api-key',
    model: DEFAULT_MODELS.openai,
    models: DEFAULT_MODELS,
    ...initial,
  };
  config = { ...config, models: { ...DEFAULT_MODELS, ...config.models } };
  config.model = modelFor(config);

  const statuses: Record<ProviderKey, ProviderAuthStatus> = {
    openai: {
      provider: 'openai',
      apiKeyConfigured: false,
      login: { installed: true, loggedIn: false, path: 'codex' },
    },
    gemini: {
      provider: 'gemini',
      apiKeyConfigured: false,
      login: { installed: true, loggedIn: false, path: 'gemini' },
    },
    claude: {
      provider: 'claude',
      apiKeyConfigured: false,
      login: { installed: true, loggedIn: true, path: 'claude' },
    },
    ...statusOverrides,
  };

  const api = {
    settings: {
      getAiConfig: vi.fn().mockImplementation(async () => config),
      getProviderAuthStatus: vi.fn().mockImplementation(async () => ({ ok: true, providers: statuses })),
      setAiConfig: vi.fn().mockImplementation(async (partial: Partial<AiConfig>) => {
        const provider = partial.provider ?? config.provider;
        const authMode = partial.authMode ?? config.authMode;
        const models = { ...config.models, ...partial.models };
        const key = modelKey(provider, authMode);
        if (key && partial.model) models[key] = partial.model;
        config = {
          ...config,
          ...partial,
          provider,
          authMode,
          models,
        };
        config.model = modelFor(config);
        return { ok: true, config };
      }),
      setProviderApiKey: vi.fn().mockImplementation(async (provider: ProviderKey) => {
        statuses[provider] = { ...statuses[provider], apiKeyConfigured: true };
        return { ok: true };
      }),
      clearProviderApiKey: vi.fn().mockImplementation(async (provider: ProviderKey) => {
        statuses[provider] = { ...statuses[provider], apiKeyConfigured: false };
        return { ok: true };
      }),
      loginProvider: vi.fn().mockResolvedValue({ ok: true }),
      testProvider: vi.fn().mockResolvedValue(testResult),
    },
    materials: {
      openUrl: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

describe('AiSettingsPanel helpers', () => {
  it('summarizes provider labels, models, and readiness states', () => {
    const readyStatus: ProviderAuthStatus = {
      provider: 'openai',
      apiKeyConfigured: true,
      login: { installed: false, loggedIn: false },
    };
    const config: AiConfig = {
      provider: 'openai',
      authMode: 'api-key',
      model: 'gpt-5.5',
      models: DEFAULT_MODELS,
    };

    expect(providerDisplayName('openai')).toBe('GPT');
    expect(authModeLabel('api-key')).toBe('APIキー');
    expect(selectedModel(config)).toBe('gpt-5.5');
    expect(aiStatusTone(config, readyStatus)).toBe('ready');
    expect(aiStatusText(config, readyStatus)).toBe('利用可能');
    expect(aiStatusTone({ provider: 'none', authMode: 'login' })).toBe('off');
  });
});

describe('AiSettingsPanel provider operations', () => {
  it('saves and clears API keys without rendering the secret back to the user', async () => {
    const api = installAiApiMock();
    render(<AiSettingsPanel compact />);

    expect(await screen.findByText('APIキー未設定')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('GPT APIキー'), {
      target: { value: 'sk-secret-never-render' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(api.settings.setProviderApiKey).toHaveBeenCalledWith(
        'openai',
        'sk-secret-never-render'
      );
      expect(screen.getByText('APIキーを保存しました')).toBeInTheDocument();
      expect(screen.getByText('APIキー保存済み')).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue('sk-secret-never-render')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    await waitFor(() => {
      expect(api.settings.clearProviderApiKey).toHaveBeenCalledWith('openai');
      expect(screen.getByText('APIキーを削除しました')).toBeInTheDocument();
    });
  });

  it('launches official login and surfaces connection test failures', async () => {
    const onTestStateChanged = vi.fn();
    const api = installAiApiMock(
      {
        provider: 'gemini',
        authMode: 'login',
        model: DEFAULT_MODELS.gemini,
      },
      {
        gemini: {
          provider: 'gemini',
          apiKeyConfigured: false,
          login: { installed: true, loggedIn: false, path: 'gemini' },
        },
      },
      { ok: false, error: 'bad gateway' }
    );

    render(<AiSettingsPanel compact onTestStateChanged={onTestStateChanged} />);

    expect(await screen.findByText('gemini')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ログインを起動' }));
    await waitFor(() => {
      expect(api.settings.loginProvider).toHaveBeenCalledWith('gemini');
      expect(screen.getByText(/gemini を起動しました/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '接続テスト' }));
    await waitFor(() => {
      expect(api.settings.testProvider).toHaveBeenCalledWith('gemini', 'login');
      expect(screen.getByText('bad gateway')).toBeInTheDocument();
      expect(onTestStateChanged).toHaveBeenCalledWith({
        provider: 'gemini',
        authMode: 'login',
        ok: false,
      });
    });
  });

  it('persists auth mode and provider-specific model changes', async () => {
    const api = installAiApiMock({ provider: 'claude', authMode: 'login' });
    render(<AiSettingsPanel compact />);

    await screen.findByText('使用中: Claude');
    fireEvent.click(screen.getByRole('button', { name: 'APIキー' }));
    await waitFor(() => {
      expect(api.settings.setAiConfig).toHaveBeenCalledWith({ authMode: 'api-key' });
    });

    fireEvent.change(screen.getByLabelText('モデル'), {
      target: { value: 'claude-opus-4-7' },
    });
    await waitFor(() => {
      expect(api.settings.setAiConfig).toHaveBeenCalledWith({ model: 'claude-opus-4-7' });
      expect(screen.getByLabelText(/使用中: Claude/)).toHaveTextContent('claude-opus-4-7');
    });
  });
});
