import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Settings } from '../../src/components/Settings';

function installApiMock() {
  const api = {
    settings: {
      get: vi.fn().mockResolvedValue({
        model: 'opus',
        effort: 'xhigh',
        theme: 'light',
        aiProvider: 'claude',
        aiAuthMode: 'login',
        aiModels: {
          openai: 'gpt-5.5',
          gemini: 'gemini-3.1-pro-preview',
          claudeApi: 'claude-sonnet-4-6',
          claudeLogin: 'sonnet',
        },
        aiApiModel: 'claude-sonnet-4-6',
        telemetryEnabled: false,
      }),
      set: vi.fn().mockResolvedValue({ ok: true }),
      getAiConfig: vi.fn().mockResolvedValue({
        provider: 'claude',
        authMode: 'login',
        model: 'sonnet',
        models: {
          openai: 'gpt-5.5',
          gemini: 'gemini-3.1-pro-preview',
          claudeApi: 'claude-sonnet-4-6',
          claudeLogin: 'sonnet',
        },
      }),
      setAiConfig: vi.fn().mockResolvedValue({
        ok: true,
        config: {
          provider: 'claude',
          authMode: 'login',
          model: 'sonnet',
          models: {
            openai: 'gpt-5.5',
            gemini: 'gemini-3.1-pro-preview',
            claudeApi: 'claude-sonnet-4-6',
            claudeLogin: 'sonnet',
          },
        },
      }),
      getProviderAuthStatus: vi.fn().mockResolvedValue({
        ok: true,
        providers: {
          openai: {
            provider: 'openai',
            apiKeyConfigured: false,
            login: { installed: false, loggedIn: false },
          },
          gemini: {
            provider: 'gemini',
            apiKeyConfigured: false,
            login: { installed: false, loggedIn: false },
          },
          claude: {
            provider: 'claude',
            apiKeyConfigured: false,
            login: { installed: true, loggedIn: true, path: 'claude' },
          },
        },
      }),
      setProviderApiKey: vi.fn().mockResolvedValue({ ok: true }),
      clearProviderApiKey: vi.fn().mockResolvedValue({ ok: true }),
      loginProvider: vi.fn().mockResolvedValue({ ok: true }),
      hasApiKey: vi.fn().mockResolvedValue({ ok: true, present: false }),
      setApiKey: vi.fn().mockResolvedValue({ ok: true }),
      clearApiKey: vi.fn().mockResolvedValue({ ok: true }),
      testProvider: vi.fn().mockResolvedValue({ ok: true, response: 'OK' }),
    },
    qa: {
      status: vi.fn().mockResolvedValue({ installed: true, loggedIn: true, path: 'claude' }),
      login: vi.fn().mockResolvedValue({ ok: true }),
    },
    skills: {
      detectObsidian: vi.fn().mockResolvedValue({ ok: false }),
      redetectObsidian: vi.fn().mockResolvedValue({ ok: false }),
      analyzeWithObsidianCLI: vi.fn().mockResolvedValue({ ok: true, output: '' }),
    },
    index: {
      status: vi.fn().mockResolvedValue({
        ready: true,
        fileCount: 42,
        builtAt: '2026-05-13T00:00:00.000Z',
      }),
      rebuild: vi.fn().mockResolvedValue({ ok: true, fileCount: 43 }),
    },
    diagnostics: {
      export: vi.fn().mockResolvedValue({ ok: true, filePath: 'C:\\Users\\alice\\diagnostics.json' }),
    },
    vaultSafety: {
      audit: vi.fn().mockResolvedValue({
        ok: true,
        audit: {
          checkedAt: '2026-05-13T00:00:00.000Z',
          fileCount: 10,
          markdownCount: 8,
          totalBytes: 1000,
          issueCounts: { info: 1, warning: 2, error: 0 },
          issues: [
            {
              severity: 'warning',
              code: 'paper_missing_bibkey',
              relPath: 'Papers/A.md',
              message: '',
            },
          ],
        },
      }),
      createBackup: vi.fn().mockResolvedValue({
        ok: true,
        backupDir: 'C:\\Users\\alice\\backup',
        manifestPath: 'C:\\Users\\alice\\backup\\manifest.json',
        fileCount: 10,
        totalBytes: 1000,
        skipped: [],
      }),
      listBackups: vi.fn().mockResolvedValue({ ok: true, backups: [] }),
    },
    research: {
      getDashboard: vi.fn().mockResolvedValue({ ok: true }),
      reproducibilityReport: vi.fn().mockResolvedValue({
        ok: true,
        report: {
          checkedAt: '2026-05-13T00:00:00.000Z',
          score: 88,
          papers: {
            total: 3,
            withBibkey: 2,
            missingBibkey: ['Papers/A.md'],
            duplicateBibkeys: [],
          },
          experiments: { total: 2, complete: 1, incomplete: [] },
          citations: { totalCitationKeys: 4, unresolvedCitationKeys: [] },
          issues: [
            {
              severity: 'warning',
              code: 'paper_missing_bibkey',
              relPath: 'Papers/A.md',
              message: '',
            },
          ],
        },
      }),
      listDeadlines: vi.fn().mockResolvedValue({ ok: true, deadlines: [] }),
      saveDeadlines: vi.fn().mockResolvedValue({ ok: true, deadlines: [] }),
    },
    materials: {
      openLogDir: vi.fn().mockResolvedValue({ ok: true, path: 'C:\\Users\\alice\\logs' }),
      openUrl: vi.fn().mockResolvedValue({ ok: true }),
    },
    update: {
      check: vi.fn().mockResolvedValue({ ok: true }),
      install: vi.fn().mockResolvedValue({ ok: true }),
      onAvailable: vi.fn().mockReturnValue(() => undefined),
      onDownloaded: vi.fn().mockReturnValue(() => undefined),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

function renderSettings() {
  return render(
    <Settings
      onClose={vi.fn()}
      vaultPath={'C:\\Vault\\ClassVault'}
      uiMode="simple"
      onChangeUiMode={vi.fn()}
      onCustomizeRail={vi.fn()}
      onResetRailSimple={vi.fn()}
      onSetRailFull={vi.fn()}
    />
  );
}

describe('Settings operational controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Settings as a compact modal with a scrollable body and fixed actions', () => {
    installApiMock();
    const { container } = renderSettings();

    const modal = container.querySelector('.settings-modal');
    const body = screen.getByTestId('settings-modal-body');
    const closeButton = screen.getByRole('button', { name: '閉じる' });
    const saveButton = screen.getByRole('button', { name: '保存' });

    expect(modal).toBeInTheDocument();
    expect(body.parentElement).toBe(modal);
    expect(container.querySelector('.settings-modal .ai-settings-panel.compact')).toBeInTheDocument();
    expect(body.contains(closeButton)).toBe(false);
    expect(body.contains(saveButton)).toBe(false);
  });

  it('shows Vault index status and lets the user rebuild the derived cache', async () => {
    const api = installApiMock();
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/利用可能 \(42 files/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'インデックスを再構築' }));

    await waitFor(() => {
      expect(api.index.rebuild).toHaveBeenCalledWith('C:\\Vault\\ClassVault');
      expect(screen.getByText(/利用可能 \(43 files/)).toBeInTheDocument();
    });
  });

  it('exports diagnostics without rendering the absolute diagnostics path', async () => {
    const api = installApiMock();
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: '診断レポートを書き出す' }));

    await waitFor(() => {
      expect(api.diagnostics.export).toHaveBeenCalledOnce();
      expect(screen.getByText('書き出しました')).toBeInTheDocument();
    });
    expect(screen.queryByText(/diagnostics\.json/)).not.toBeInTheDocument();
  });

  it('opens the local log directory from diagnostics controls', async () => {
    const api = installApiMock();
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'ログフォルダを開く' }));

    await waitFor(() => {
      expect(api.materials.openLogDir).toHaveBeenCalledOnce();
      expect(screen.getByText('開きました')).toBeInTheDocument();
    });
  });

  it('runs Vault safety audit and creates a local backup without showing backup paths', async () => {
    const api = installApiMock();
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: '安全性チェック' }));
    await waitFor(() => {
      expect(api.vaultSafety.audit).toHaveBeenCalledWith('C:\\Vault\\ClassVault');
      expect(screen.getByText(/files 10 \/ errors 0 \/ warnings 2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'バックアップを作成' }));
    await waitFor(() => {
      expect(api.vaultSafety.createBackup).toHaveBeenCalledWith('C:\\Vault\\ClassVault');
      expect(screen.getByText(/バックアップを作成しました \(10 files/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/alice\\backup/)).not.toBeInTheDocument();
  });

  it('runs the research reproducibility check from Settings', async () => {
    const api = installApiMock();
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: '再現性チェック' }));

    await waitFor(() => {
      expect(api.research.reproducibilityReport).toHaveBeenCalledWith('C:\\Vault\\ClassVault');
      expect(screen.getByText(/score 88 \/ papers 2\/3 \/ experiments 1\/2/)).toBeInTheDocument();
    });
  });
});
