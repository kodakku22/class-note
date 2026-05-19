import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock child components that have complex dependencies
vi.mock('../../src/components/TemplateEditor', () => ({
  TemplateEditor: () => <div data-testid="template-editor" />,
}));
vi.mock('../../src/components/skills/SkillsPanel', () => ({
  SkillsPanel: () => <div data-testid="skills-panel" />,
}));
vi.mock('../../src/components/ai/AiSettingsPanel', () => ({
  AiSettingsPanel: ({ compact }: { compact?: boolean }) => (
    <div data-testid="ai-settings-panel" data-compact={compact} />
  ),
}));

import { Settings } from '../../src/components/Settings';

const DEFAULT_PROPS = {
  onClose: vi.fn(),
  vaultPath: '/vault',
  uiMode: 'simple' as const,
  onChangeUiMode: vi.fn(),
  onCustomizeRail: vi.fn(),
  onResetRailSimple: vi.fn(),
  onSetRailFull: vi.fn(),
};

const mockSettingsGet = vi.fn();
const mockSettingsSet = vi.fn();
const mockIndexStatus = vi.fn();
const mockUpdateOnAvailable = vi.fn();
const mockUpdateOnDownloaded = vi.fn();

describe('Settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    DEFAULT_PROPS.onClose = vi.fn();
    DEFAULT_PROPS.onChangeUiMode = vi.fn();

    mockSettingsGet.mockResolvedValue({
      model: 'opus',
      effort: 'xhigh',
      theme: 'light',
      telemetryEnabled: false,
    });
    mockSettingsSet.mockResolvedValue({ ok: true });
    mockIndexStatus.mockResolvedValue({ ready: true, fileCount: 42 });
    mockUpdateOnAvailable.mockReturnValue(() => undefined);
    mockUpdateOnDownloaded.mockReturnValue(() => undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.api.settings = { get: mockSettingsGet, set: mockSettingsSet };
    w.api.index = { status: mockIndexStatus };
    w.api.update = {
      onAvailable: mockUpdateOnAvailable,
      onDownloaded: mockUpdateOnDownloaded,
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn(),
    };
  });

  it('renders the settings modal', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('設定');
    });
  });

  it('renders sections: AI, effort, appearance, templates, diagnostics', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('ai-settings-panel')).toBeInTheDocument();
    });

    expect(screen.getByText('思考の深さ (effort)')).toBeInTheDocument();
    expect(screen.getByText('外観')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /テンプレートを編集/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /診断レポートを書き出す/ })).toBeInTheDocument();
  });

  it('shows theme toggle buttons', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ライト/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /ダーク/ })).toBeInTheDocument();
  });

  it('toggles theme to dark', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ダーク/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ダーク/ }));
    });

    expect(screen.getByRole('button', { name: /ダーク/ }).className).toContain('primary');
  });

  it('saves settings on save click', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });

    expect(mockSettingsSet).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    });

    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('shows effort dropdown with options', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('思考の深さ (effort)')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue(/xhigh/);
    expect(select).toBeInTheDocument();
  });

  it('renders the AI settings panel', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('ai-settings-panel')).toBeInTheDocument();
    });
  });

  it('renders UI mode buttons', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'シンプル' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'カスタム' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全機能' })).toBeInTheDocument();
  });

  it('calls onChangeUiMode when UI mode button is clicked', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '全機能' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '全機能' }));
    });

    expect(DEFAULT_PROPS.onChangeUiMode).toHaveBeenCalledWith('full');
  });

  it('shows update check button', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /アップデートを確認/ })).toBeInTheDocument();
    });
  });

  it('shows privacy / telemetry checkbox', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('プライバシー')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('toggles telemetry checkbox', async () => {
    await act(async () => {
      render(<Settings {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'));
    });

    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
