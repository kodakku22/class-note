import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IconRail } from '../../src/components/layout/IconRail';
import type { AiAuthMode, AiModelSettings, AiProvider, ProviderAuthStatus } from '../../src/types';

type TestAiConfig = {
  provider: AiProvider;
  authMode: AiAuthMode;
  model: string;
  models: AiModelSettings;
};

const DEFAULT_MODELS: AiModelSettings = {
  openai: 'gpt-5.5',
  gemini: 'gemini-3.1-pro-preview',
  claudeApi: 'claude-sonnet-4-6',
  claudeLogin: 'sonnet',
};

const READY_STATUSES: Record<Exclude<AiProvider, 'none'>, ProviderAuthStatus> = {
  openai: {
    provider: 'openai',
    apiKeyConfigured: true,
    login: { installed: true, loggedIn: true, path: 'codex' },
  },
  gemini: {
    provider: 'gemini',
    apiKeyConfigured: false,
    login: { installed: true, loggedIn: false, path: 'gcloud' },
  },
  claude: {
    provider: 'claude',
    apiKeyConfigured: false,
    login: { installed: true, loggedIn: true, path: 'claude' },
  },
};

function selectedModel(config: TestAiConfig): string {
  if (config.provider === 'openai') return config.models.openai;
  if (config.provider === 'gemini') return config.models.gemini;
  if (config.provider === 'claude') {
    return config.authMode === 'api-key' ? config.models.claudeApi : config.models.claudeLogin;
  }
  return '';
}

function installApiMock(
  initial: Partial<TestAiConfig> = {},
  statuses: Partial<Record<Exclude<AiProvider, 'none'>, ProviderAuthStatus>> = READY_STATUSES
) {
  let config: TestAiConfig = {
    provider: 'openai',
    authMode: 'api-key',
    model: DEFAULT_MODELS.openai,
    models: DEFAULT_MODELS,
    ...initial,
  };
  config = { ...config, model: selectedModel(config), models: { ...DEFAULT_MODELS, ...config.models } };

  const api = {
    settings: {
      getAiConfig: vi.fn(async () => config),
      getProviderAuthStatus: vi.fn(async () => ({ ok: true, providers: statuses })),
      setAiConfig: vi.fn(async (partial: Partial<TestAiConfig>) => {
        config = {
          ...config,
          ...partial,
          models: { ...config.models, ...partial.models },
        };
        config.model = selectedModel(config);
        return { ok: true, config };
      }),
      setProviderApiKey: vi.fn(async () => ({ ok: true })),
      clearProviderApiKey: vi.fn(async () => ({ ok: true })),
      loginProvider: vi.fn(async () => ({ ok: true })),
      testProvider: vi.fn(async () => ({ ok: true, response: 'OK' })),
    },
    materials: {
      openUrl: vi.fn(async () => ({ ok: true })),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

function renderRail() {
  return render(
    <IconRail
      viewItems={[
        {
          id: 'notes',
          label: 'Notes',
          icon: 'N',
          tooltip: 'Notes',
          active: true,
          onClick: vi.fn(),
        },
      ]}
      commandIds={[]}
      commands={[]}
      onCustomize={vi.fn()}
      onShowPalette={vi.fn()}
      onShowSettings={vi.fn()}
      onReorderViews={vi.fn()}
      onReorderCommands={vi.fn()}
    />
  );
}

describe('IconRail global AI selector', () => {
  it('shows the current provider and readiness dot on the top-left rail button', async () => {
    installApiMock();
    const { container } = renderRail();

    const trigger = await screen.findByRole('button', { name: /GPT/ });

    expect(trigger).toHaveTextContent('GPT');
    expect(trigger).not.toHaveClass('icon-rail-app');
    expect(trigger).not.toHaveTextContent('CN');
    expect(container.querySelector('.icon-rail-ai-status-dot')).toHaveAttribute(
      'data-status',
      'ready'
    );
  });

  it('opens a full-name provider picker and updates the rail when Gemini is selected', async () => {
    const api = installApiMock();
    const { container } = renderRail();

    fireEvent.click(await screen.findByRole('button', { name: /GPT/ }));
    const dialog = await screen.findByRole('dialog', { name: 'AIプロバイダー設定' });

    expect(within(dialog).getByText('使用中: GPT')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /GPT/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(dialog).getByRole('button', { name: /Gemini/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Claude/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Off/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Gemini/ }));

    await waitFor(() => {
      expect(api.settings.setAiConfig).toHaveBeenCalledWith({ provider: 'gemini' });
      expect(container.querySelector('.icon-rail-ai-trigger')).toHaveTextContent('Gemini');
    });
  });

  it('uses warning, error, and off status dots for not-ready AI states', async () => {
    installApiMock(
      { provider: 'gemini', authMode: 'api-key' },
      {
        ...READY_STATUSES,
        gemini: {
          provider: 'gemini',
          apiKeyConfigured: false,
          login: { installed: true, loggedIn: true, path: 'gcloud' },
        },
      }
    );
    const warningRender = renderRail();
    await waitFor(() => {
      expect(warningRender.container.querySelector('.icon-rail-ai-status-dot')).toHaveAttribute(
        'data-status',
        'warning'
      );
    });
    warningRender.unmount();

    installApiMock(
      { provider: 'claude', authMode: 'login' },
      {
        ...READY_STATUSES,
        claude: {
          provider: 'claude',
          apiKeyConfigured: false,
          login: { installed: false, loggedIn: false, error: 'missing' },
        },
      }
    );
    const errorRender = renderRail();
    await waitFor(() => {
      expect(errorRender.container.querySelector('.icon-rail-ai-status-dot')).toHaveAttribute(
        'data-status',
        'error'
      );
    });
    errorRender.unmount();

    installApiMock({ provider: 'none', authMode: 'api-key' });
    const offRender = renderRail();
    await waitFor(() => {
      expect(offRender.container.querySelector('.icon-rail-ai-status-dot')).toHaveAttribute(
        'data-status',
        'off'
      );
    });
  });

  it('closes the popover with Escape and outside click', async () => {
    installApiMock();
    const { container } = renderRail();

    fireEvent.click(await screen.findByRole('button', { name: /GPT/ }));
    expect(await screen.findByRole('dialog', { name: 'AIプロバイダー設定' })).toBeInTheDocument();

    fireEvent.keyDown(container.querySelector('.icon-rail')!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'AIプロバイダー設定' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /GPT/ }));
    expect(await screen.findByRole('dialog', { name: 'AIプロバイダー設定' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'AIプロバイダー設定' })).not.toBeInTheDocument();
  });
});
