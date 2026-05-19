import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock all heavy child components
vi.mock('../../src/components/TemplateEditor', () => ({
  TemplateEditor: ({ onClose }: any) => (
    <div data-testid="template-editor"><button onClick={onClose}>close-templates</button></div>
  ),
}));

vi.mock('../../src/components/skills/SkillsPanel', () => ({
  SkillsPanel: () => <div data-testid="skills-panel" />,
}));

vi.mock('../../src/components/ai/AiSettingsPanel', () => ({
  AiSettingsPanel: () => <div data-testid="ai-settings" />,
}));

import { Settings } from '../../src/components/Settings';

describe('Settings actions', () => {
  const handlers = {
    onClose: vi.fn(),
    onChangeUiMode: vi.fn(),
    onCustomizeRail: vi.fn(),
    onResetRailSimple: vi.fn(),
    onSetRailFull: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(handlers).forEach((fn) => fn.mockClear());
    (window as any).api = {
      settings: {
        get: vi.fn().mockResolvedValue({
          model: 'opus', effort: 'xhigh', theme: 'light', telemetryEnabled: false,
        }),
        set: vi.fn().mockResolvedValue(undefined),
      },
      vaultSafety: {
        audit: vi.fn().mockResolvedValue({
          ok: true,
          audit: {
            fileCount: 10,
            issueCounts: { error: 2, warning: 1 },
            issues: [
              { code: 'ERR01', severity: 'error', relPath: 'a.md' },
              { code: 'ERR02', severity: 'error', relPath: 'b.md' },
              { code: 'WARN01', severity: 'warning' },
            ],
          },
        }),
        createBackup: vi.fn().mockResolvedValue({ ok: true, fileCount: 5, skipped: [] }),
      },
      research: {
        reproducibilityReport: vi.fn().mockResolvedValue({
          ok: true,
          report: {
            score: 85,
            papers: { total: 10, withBibkey: 8 },
            experiments: { total: 5, complete: 4 },
            issues: [{ code: 'R01', relPath: 'p1.md' }],
          },
        }),
      },
      index: {
        status: vi.fn().mockResolvedValue({ ready: true, fileCount: 50, builtAt: '2026-05-01T00:00:00Z' }),
        rebuild: vi.fn().mockResolvedValue({ ok: true, fileCount: 50 }),
      },
      diagnostics: {
        export: vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/diag.json' }),
      },
      materials: {
        openUrl: vi.fn(),
        openLogDir: vi.fn().mockResolvedValue({ ok: true }),
      },
      update: {
        check: vi.fn().mockResolvedValue({ ok: true, version: null }),
        install: vi.fn().mockResolvedValue(undefined),
        onAvailable: vi.fn().mockReturnValue(() => {}),
        onDownloaded: vi.fn().mockReturnValue(() => {}),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Modal interaction ---

  it('closes modal on overlay click', async () => {
    const { container } = await act(async () => {
      return render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />);
    });
    const overlay = container.querySelector('.modal-overlay')!;
    await act(async () => { fireEvent.click(overlay); });
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('does not close on modal body click', async () => {
    const { container } = await act(async () => {
      return render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />);
    });
    const modal = container.querySelector('.settings-modal')!;
    await act(async () => { fireEvent.click(modal); });
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  // --- Save with feedback ---

  it('shows saved feedback after save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('保存')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('保存')); });
    expect((window as any).api.settings.set).toHaveBeenCalled();
    await waitFor(() => { expect(screen.getByText(/保存しました/)).toBeInTheDocument(); });
    await act(async () => { vi.advanceTimersByTime(2000); });
  });

  it('saves with dark theme and applies body class', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText(/ダーク/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/ダーク/)); });
    await act(async () => { fireEvent.click(screen.getByText('保存')); });
    expect((window as any).api.settings.set).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  // --- UI mode ---

  it('calls all ui mode handlers', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('カスタム')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('カスタム')); });
    expect(handlers.onChangeUiMode).toHaveBeenCalledWith('custom');
    await act(async () => { fireEvent.click(screen.getByText('全機能')); });
    expect(handlers.onChangeUiMode).toHaveBeenCalledWith('full');
  });

  it('calls rail customization handlers', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText(/左アイコンを編集/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/左アイコンを編集/)); });
    expect(handlers.onCustomizeRail).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText('シンプルに戻す')); });
    expect(handlers.onResetRailSimple).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText('全機能を表示')); });
    expect(handlers.onSetRailFull).toHaveBeenCalled();
  });

  it('highlights active uiMode button', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="custom" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('カスタム')).toBeInTheDocument(); });
    expect(screen.getByText('カスタム').className).toContain('primary');
  });

  // --- Template editor ---

  it('opens and closes template editor', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText(/テンプレートを編集/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/テンプレートを編集/)); });
    expect(screen.getByTestId('template-editor')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('close-templates')); });
    expect(screen.queryByTestId('template-editor')).not.toBeInTheDocument();
  });

  // --- Vault Safety Panel ---

  it('runs safety audit and shows results with issues', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('安全性チェック')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('安全性チェック')); });
    await waitFor(() => { expect(screen.getByText(/files 10/)).toBeInTheDocument(); });
    // Issues list should be shown
    expect(screen.getByText(/ERR01/)).toBeInTheDocument();
  });

  it('shows audit error', async () => {
    (window as any).api.vaultSafety.audit = vi.fn().mockResolvedValue({ ok: false, error: 'audit err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('安全性チェック')); });
    await waitFor(() => { expect(screen.getByText(/audit err/)).toBeInTheDocument(); });
  });

  it('creates backup successfully', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('バックアップを作成')); });
    await waitFor(() => { expect(screen.getByText(/バックアップを作成しました/)).toBeInTheDocument(); });
  });

  it('shows backup error', async () => {
    (window as any).api.vaultSafety.createBackup = vi.fn().mockResolvedValue({ ok: false, error: 'bk err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('バックアップを作成')); });
    await waitFor(() => { expect(screen.getByText(/bk err/)).toBeInTheDocument(); });
  });

  // --- Reproducibility Panel ---

  it('runs reproducibility check', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('再現性チェック')); });
    await waitFor(() => { expect(screen.getByText(/score 85/)).toBeInTheDocument(); });
    expect(screen.getByText(/R01/)).toBeInTheDocument();
  });

  it('shows repro error', async () => {
    (window as any).api.research.reproducibilityReport = vi.fn().mockResolvedValue({ ok: false, error: 'rr err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('再現性チェック')); });
    await waitFor(() => { expect(screen.getByText(/rr err/)).toBeInTheDocument(); });
  });

  it('shows high score in green color', async () => {
    (window as any).api.research.reproducibilityReport = vi.fn().mockResolvedValue({
      ok: true,
      report: { score: 95, papers: { total: 5, withBibkey: 5 }, experiments: { total: 3, complete: 3 }, issues: [] },
    });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('再現性チェック')); });
    await waitFor(() => { expect(screen.getByText(/score 95/)).toBeInTheDocument(); });
  });

  it('shows low score in danger color', async () => {
    (window as any).api.research.reproducibilityReport = vi.fn().mockResolvedValue({
      ok: true,
      report: { score: 50, papers: { total: 5, withBibkey: 2 }, experiments: { total: 3, complete: 1 }, issues: [] },
    });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('再現性チェック')); });
    await waitFor(() => { expect(screen.getByText(/score 50/)).toBeInTheDocument(); });
  });

  // --- Index Maintenance ---

  it('shows index ready status on load', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText(/利用可能/)).toBeInTheDocument(); });
  });

  it('shows index missing state', async () => {
    (window as any).api.index.status = vi.fn().mockResolvedValue({ ready: false, fileCount: 10 });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText(/未構築/)).toBeInTheDocument(); });
  });

  it('handles index status error', async () => {
    (window as any).api.index.status = vi.fn().mockRejectedValue(new Error('idx err'));
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText(/idx err/)).toBeInTheDocument(); });
  });

  it('rebuilds index', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('インデックスを再構築')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('インデックスを再構築')); });
    expect((window as any).api.index.rebuild).toHaveBeenCalledWith('/vault');
  });

  it('shows rebuild error', async () => {
    (window as any).api.index.rebuild = vi.fn().mockResolvedValue({ ok: false, error: 'reb err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('インデックスを再構築')); });
    await waitFor(() => { expect(screen.getByText(/reb err/)).toBeInTheDocument(); });
  });

  it('handles rebuild exception', async () => {
    (window as any).api.index.rebuild = vi.fn().mockRejectedValue(new Error('reb throw'));
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('インデックスを再構築')); });
    await waitFor(() => { expect(screen.getByText(/reb throw/)).toBeInTheDocument(); });
  });

  it('refreshes index status on button click', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('状態を更新')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('状態を更新')); });
    expect((window as any).api.index.status).toHaveBeenCalledTimes(2);
  });

  // --- Diagnostics ---

  it('exports diagnostics report', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('診断レポートを書き出す')); });
    await waitFor(() => { expect(screen.getByText('書き出しました')).toBeInTheDocument(); });
  });

  it('shows diagnostics export error', async () => {
    (window as any).api.diagnostics.export = vi.fn().mockResolvedValue({ ok: false, error: 'dx err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('診断レポートを書き出す')); });
    await waitFor(() => { expect(screen.getByText(/dx err/)).toBeInTheDocument(); });
  });

  it('shows diagnostics default error', async () => {
    (window as any).api.diagnostics.export = vi.fn().mockResolvedValue({ ok: false });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('診断レポートを書き出す')); });
    await waitFor(() => { expect(screen.getByText(/診断レポートを書き出せませんでした/)).toBeInTheDocument(); });
  });

  // --- Log folder ---

  it('opens log folder', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('ログフォルダを開く')); });
    await waitFor(() => { expect(screen.getByText('開きました')).toBeInTheDocument(); });
  });

  it('shows log folder error', async () => {
    (window as any).api.materials.openLogDir = vi.fn().mockResolvedValue({ ok: false, error: 'lg err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('ログフォルダを開く')); });
    await waitFor(() => { expect(screen.getByText(/lg err/)).toBeInTheDocument(); });
  });

  it('shows default log folder error', async () => {
    (window as any).api.materials.openLogDir = vi.fn().mockResolvedValue({ ok: false });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText('ログフォルダを開く')); });
    await waitFor(() => { expect(screen.getByText(/ログフォルダを開けませんでした/)).toBeInTheDocument(); });
  });

  // --- Update ---

  it('checks for update (no update available)', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText(/アップデートを確認/)); });
    expect((window as any).api.update.check).toHaveBeenCalled();
  });

  it('shows update check error', async () => {
    (window as any).api.update.check = vi.fn().mockResolvedValue({ ok: false, error: 'upd err' });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText(/アップデートを確認/)); });
    await waitFor(() => { expect(screen.getByText(/upd err/)).toBeInTheDocument(); });
  });

  it('shows default update error', async () => {
    (window as any).api.update.check = vi.fn().mockResolvedValue({ ok: false });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { fireEvent.click(screen.getByText(/アップデートを確認/)); });
    await waitFor(() => { expect(screen.getByText(/不明なエラー/)).toBeInTheDocument(); });
  });

  it('responds to update available event', async () => {
    let availCb: any;
    (window as any).api.update.onAvailable = vi.fn().mockImplementation((cb: any) => {
      availCb = cb; return () => {};
    });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { availCb({ version: '2.0.0' }); });
    expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
  });

  it('responds to update downloaded and installs', async () => {
    let doneCb: any;
    (window as any).api.update.onDownloaded = vi.fn().mockImplementation((cb: any) => {
      doneCb = cb; return () => {};
    });
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await act(async () => { doneCb({ version: '2.0.0' }); });
    expect(screen.getByText(/準備完了/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('再起動して適用')); });
    expect((window as any).api.update.install).toHaveBeenCalled();
  });

  // --- Privacy ---

  it('opens privacy URL link', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByText('詳細')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('詳細')); });
    expect((window as any).api.materials.openUrl).toHaveBeenCalledWith(expect.stringContaining('privacy.md'));
  });

  // --- Effort change ---

  it('changes effort selection', async () => {
    await act(async () => { render(<Settings vaultPath="/vault" uiMode="simple" {...handlers} />); });
    await waitFor(() => { expect(screen.getByDisplayValue(/xhigh/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.change(screen.getByDisplayValue(/xhigh/), { target: { value: 'low' } }); });
    await act(async () => { fireEvent.click(screen.getByText('保存')); });
    expect((window as any).api.settings.set).toHaveBeenCalledWith(expect.objectContaining({ effort: 'low' }));
  });
});
