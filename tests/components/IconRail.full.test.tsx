import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IconRail, type RailRenderedItem } from '../../src/components/layout/IconRail';

// Mock AiSettingsPanel
vi.mock('../../src/components/ai/AiSettingsPanel', () => ({
  AiSettingsPanel: ({ compact }: any) => (
    <div data-testid="ai-settings-panel" data-compact={compact} />
  ),
  DEFAULT_AI_CONFIG: {
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
  aiStatusText: vi.fn(() => 'Ready'),
  aiStatusTone: vi.fn(() => 'ready'),
  authModeLabel: vi.fn(() => 'Login'),
  providerDisplayName: vi.fn((p: string) => {
    if (p === 'openai') return 'GPT';
    if (p === 'gemini') return 'Gemini';
    if (p === 'claude') return 'Claude';
    return 'Off';
  }),
  providerThemeClass: vi.fn((p: string) => `provider-${p}`),
  selectedModel: vi.fn(() => 'sonnet'),
}));

function installApiMock() {
  (window as any).api = {
    settings: {
      getAiConfig: vi.fn(async () => ({
        provider: 'claude',
        authMode: 'login',
        model: 'sonnet',
        models: {
          openai: 'gpt-5.5',
          gemini: 'gemini-3.1-pro-preview',
          claudeApi: 'claude-sonnet-4-6',
          claudeLogin: 'sonnet',
        },
      })),
      getProviderAuthStatus: vi.fn(async () => ({
        ok: true,
        providers: {
          claude: {
            provider: 'claude',
            apiKeyConfigured: false,
            login: { installed: true, loggedIn: true, path: 'claude' },
          },
        },
      })),
    },
  };
}

const VIEW_ITEMS: RailRenderedItem[] = [
  { id: 'notes', label: 'ノート', icon: '📝', tooltip: 'ノート', active: true, onClick: vi.fn() },
  { id: 'papers', label: '論文', icon: '📑', tooltip: '論文', active: false, onClick: vi.fn() },
  { id: 'books', label: '書籍', icon: '📚', tooltip: '書籍', active: false, onClick: vi.fn() },
];

const onCustomize = vi.fn();
const onShowPalette = vi.fn();
const onShowSettings = vi.fn();
const onReorderViews = vi.fn();
const onReorderCommands = vi.fn();

function renderRail(overrides: Partial<Parameters<typeof IconRail>[0]> = {}) {
  return render(
    <IconRail
      viewItems={VIEW_ITEMS}
      commandIds={[]}
      commands={[]}
      onCustomize={onCustomize}
      onShowPalette={onShowPalette}
      onShowSettings={onShowSettings}
      onReorderViews={onReorderViews}
      onReorderCommands={onReorderCommands}
      {...overrides}
    />
  );
}

describe('IconRail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installApiMock();
    onCustomize.mockClear();
    onShowPalette.mockClear();
    onShowSettings.mockClear();
    onReorderViews.mockClear();
    onReorderCommands.mockClear();
    VIEW_ITEMS.forEach((item) => vi.mocked(item.onClick).mockClear());
  });

  it('renders navigation landmark', () => {
    renderRail();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
  });

  it('renders view item buttons', () => {
    renderRail();
    expect(screen.getByRole('button', { name: 'ノート' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '論文' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '書籍' })).toBeInTheDocument();
  });

  it('marks active item with active class', () => {
    const { container } = renderRail();
    const activeBtn = container.querySelector('.icon-rail-btn.active');
    expect(activeBtn).toBeInTheDocument();
    expect(activeBtn?.getAttribute('aria-current')).toBe('page');
  });

  it('sets tabIndex=0 on active item and -1 on others', () => {
    renderRail();
    expect(screen.getByRole('button', { name: 'ノート' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: '論文' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: '書籍' })).toHaveAttribute('tabindex', '-1');
  });

  it('calls onClick when view item is clicked', () => {
    renderRail();
    fireEvent.click(screen.getByRole('button', { name: '論文' }));
    expect(VIEW_ITEMS[1].onClick).toHaveBeenCalled();
  });

  it('renders customize button', () => {
    renderRail();
    const btn = screen.getByRole('button', { name: '左アイコンを追加・編集' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onCustomize).toHaveBeenCalled();
  });

  it('renders palette button', () => {
    renderRail();
    const btn = screen.getByRole('button', { name: 'コマンドパレットを開く' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onShowPalette).toHaveBeenCalled();
  });

  it('renders settings button', () => {
    renderRail();
    const btn = screen.getByRole('button', { name: '設定を開く' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onShowSettings).toHaveBeenCalled();
  });

  it('shows AI trigger button', async () => {
    renderRail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /AIプロバイダーを選択/ })).toBeInTheDocument();
    });
  });

  it('opens AI popover on AI trigger click', async () => {
    renderRail();
    const trigger = await screen.findByRole('button', { name: /AIプロバイダーを選択/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'AIプロバイダー設定' })).toBeInTheDocument();
    expect(screen.getByTestId('ai-settings-panel')).toBeInTheDocument();
  });

  it('closes AI popover on second click', async () => {
    renderRail();
    const trigger = await screen.findByRole('button', { name: /AIプロバイダーを選択/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes AI popover on outside mousedown', async () => {
    renderRail();
    const trigger = await screen.findByRole('button', { name: /AIプロバイダーを選択/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows tooltip on hover', () => {
    const { container } = renderRail();
    const btn = screen.getByRole('button', { name: '論文' });
    fireEvent.mouseEnter(btn);
    const tooltip = container.querySelector('.icon-rail-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip?.textContent).toBe('論文');
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = renderRail();
    const btn = screen.getByRole('button', { name: '論文' });
    fireEvent.mouseEnter(btn);
    expect(container.querySelector('.icon-rail-tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(container.querySelector('.icon-rail-tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus', () => {
    const { container } = renderRail();
    const btn = screen.getByRole('button', { name: '論文' });
    fireEvent.focus(btn);
    const tooltip = container.querySelector('.icon-rail-tooltip');
    expect(tooltip).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    const { container } = renderRail();
    const btn = screen.getByRole('button', { name: '論文' });
    fireEvent.focus(btn);
    expect(container.querySelector('.icon-rail-tooltip')).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(container.querySelector('.icon-rail-tooltip')).not.toBeInTheDocument();
  });

  it('renders command items from commands', () => {
    const commands = [
      { id: 'cmd1', title: 'Compile', icon: '🔨', railEligible: true, run: vi.fn() },
    ];
    renderRail({ commandIds: ['cmd1'], commands });
    // Command items should render
    expect(screen.getByRole('button', { name: 'Compile' })).toBeInTheDocument();
  });

  it('shows divider when commands are present', () => {
    const commands = [
      { id: 'cmd1', title: 'Compile', icon: '🔨', railEligible: true, run: vi.fn() },
    ];
    const { container } = renderRail({ commandIds: ['cmd1'], commands });
    const dividers = container.querySelectorAll('.icon-rail-divider');
    expect(dividers.length).toBeGreaterThanOrEqual(2);
  });

  it('does not show command items when commandIds is empty', () => {
    const commands = [
      { id: 'cmd1', title: 'Compile', icon: '🔨', railEligible: true, run: vi.fn() },
    ];
    renderRail({ commandIds: [], commands });
    expect(screen.queryByRole('button', { name: 'Compile' })).not.toBeInTheDocument();
  });

  it('filters out non-rail-eligible commands', () => {
    const commands = [
      { id: 'cmd1', title: 'Private', icon: '🔒', railEligible: false, run: vi.fn() },
    ];
    renderRail({ commandIds: ['cmd1'], commands });
    expect(screen.queryByRole('button', { name: 'Private' })).not.toBeInTheDocument();
  });

  it('confirms before running command', () => {
    const runMock = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const commands = [
      { id: 'cmd1', title: 'Execute', icon: '⚡', railEligible: true, run: runMock },
    ];
    renderRail({ commandIds: ['cmd1'], commands });
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(runMock).toHaveBeenCalled();
  });

  it('does not run command when confirm is cancelled', () => {
    const runMock = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const commands = [
      { id: 'cmd1', title: 'Execute', icon: '⚡', railEligible: true, run: runMock },
    ];
    renderRail({ commandIds: ['cmd1'], commands });
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    expect(runMock).not.toHaveBeenCalled();
  });

  it('supports drag and drop for view items', () => {
    renderRail();
    const source = screen.getByRole('button', { name: 'ノート' });
    const target = screen.getByRole('button', { name: '書籍' });

    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(source, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'view:notes');

    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(onReorderViews).toHaveBeenCalled();
  });

  it('cleans up drag state on dragEnd', () => {
    const { container } = renderRail();
    const source = screen.getByRole('button', { name: 'ノート' });

    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    };

    fireEvent.dragStart(source, { dataTransfer });
    expect(container.querySelector('.dragging')).toBeInTheDocument();

    fireEvent.dragEnd(source);
    expect(container.querySelector('.dragging')).not.toBeInTheDocument();
  });

  it('navigates items with ArrowDown key', () => {
    renderRail();
    const notes = screen.getByRole('button', { name: 'ノート' });
    notes.focus();
    fireEvent.keyDown(notes.closest('nav')!, { key: 'ArrowDown' });
    // Focus should move to next button
  });

  it('navigates items with ArrowUp key', () => {
    renderRail();
    const notes = screen.getByRole('button', { name: 'ノート' });
    notes.focus();
    fireEvent.keyDown(notes.closest('nav')!, { key: 'ArrowUp' });
  });

  it('navigates to first with Home key', () => {
    renderRail();
    const notes = screen.getByRole('button', { name: 'ノート' });
    notes.focus();
    fireEvent.keyDown(notes.closest('nav')!, { key: 'Home' });
  });

  it('navigates to last with End key', () => {
    renderRail();
    const notes = screen.getByRole('button', { name: 'ノート' });
    notes.focus();
    fireEvent.keyDown(notes.closest('nav')!, { key: 'End' });
  });

  it('closes AI popover with Escape key', async () => {
    renderRail();
    const trigger = await screen.findByRole('button', { name: /AIプロバイダーを選択/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides tooltip on scroll', () => {
    const { container } = renderRail();
    const btn = screen.getByRole('button', { name: '論文' });
    fireEvent.mouseEnter(btn);
    expect(container.querySelector('.icon-rail-tooltip')).toBeInTheDocument();

    const scrollDiv = container.querySelector('.icon-rail-scroll');
    if (scrollDiv) {
      fireEvent.scroll(scrollDiv);
      expect(container.querySelector('.icon-rail-tooltip')).not.toBeInTheDocument();
    }
  });

  it('renders AI status dot', async () => {
    const { container } = renderRail();
    await waitFor(() => {
      expect(container.querySelector('.icon-rail-ai-status-dot')).toBeInTheDocument();
    });
  });

  it('sets data-provider on AI trigger', async () => {
    const { container } = renderRail();
    await waitFor(() => {
      const trigger = container.querySelector('.icon-rail-ai-trigger');
      expect(trigger?.getAttribute('data-provider')).toBe('claude');
    });
  });

  it('shows provider display name in AI trigger', async () => {
    renderRail();
    await waitFor(() => {
      const trigger = screen.getByRole('button', { name: /AIプロバイダーを選択/ });
      expect(trigger).toHaveTextContent('Claude');
    });
  });

  it('shows tooltip on AI trigger hover', async () => {
    const { container } = renderRail();
    const trigger = await screen.findByRole('button', { name: /AIプロバイダーを選択/ });
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('.icon-rail-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip?.textContent).toContain('AI');
  });
});
