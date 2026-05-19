import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { PluginView } from '../../src/components/plugins/PluginView';
import type { PluginManifest } from '../../src/types';

const SAMPLE_PLUGINS: PluginManifest[] = [
  {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    views: [
      { id: 'main', title: 'Main View', icon: '🔧' },
      { id: 'settings', title: 'Settings', icon: '⚙️' },
    ],
  },
];

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  plugins: SAMPLE_PLUGINS,
  active: null as { pluginId: string; viewId: string } | null,
};

describe('PluginView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.plugins = {
      getViewUrl: vi.fn().mockResolvedValue({ ok: true, url: 'http://localhost:3001/plugin' }),
    };
  });

  it('shows loading state when active but url not yet loaded', () => {
    (window as any).api.plugins.getViewUrl = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it('renders view title from manifest', async () => {
    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Main View/)).toBeInTheDocument();
    });
  });

  it('shows plugin name and version', async () => {
    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Plugin v1.0.0')).toBeInTheDocument();
    });
  });

  it('renders iframe with plugin URL', async () => {
    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      const iframe = screen.getByTitle('Main View');
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('src')).toBe('http://localhost:3001/plugin');
    });
  });

  it('shows error state on failure', async () => {
    (window as any).api.plugins.getViewUrl = vi.fn().mockResolvedValue({ ok: false, error: 'not found' });

    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      expect(screen.getByText('not found')).toBeInTheDocument();
    });
  });

  it('shows default error message when no error text', async () => {
    (window as any).api.plugins.getViewUrl = vi.fn().mockResolvedValue({ ok: false });

    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Plugin view を読み込めませんでした/)).toBeInTheDocument();
    });
  });

  it('shows default title when no active plugin', () => {
    render(<PluginView {...DEFAULT_PROPS} active={null} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('Plugin');
  });

  it('shows view icon from manifest', async () => {
    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading.textContent).toContain('🔧');
    });
  });

  it('handles API exception', async () => {
    (window as any).api.plugins.getViewUrl = vi.fn().mockRejectedValue(new Error('network error'));

    await act(async () => {
      render(<PluginView {...DEFAULT_PROPS} active={{ pluginId: 'test-plugin', viewId: 'main' }} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/)).toBeInTheDocument();
    });
  });
});
