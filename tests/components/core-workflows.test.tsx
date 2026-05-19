import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BacklinksPanel } from '../../src/components/BacklinksPanel';
import { SearchBar } from '../../src/components/SearchBar';
import { VaultPicker } from '../../src/components/VaultPicker';

describe('core local-first workflows', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a Vault from a picked folder and opens recent Vaults', async () => {
    const onPicked = vi.fn();
    const onRemoveRecent = vi.fn();
    const api = {
      pickFolder: vi.fn().mockResolvedValue('C:\\Users\\alice\\Research'),
      vault: {
        init: vi.fn().mockResolvedValue({ vaultPath: 'C:\\Users\\alice\\Research\\ClassVault' }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = api;

    render(
      <VaultPicker
        onPicked={onPicked}
        recentVaults={['D:\\Lab\\ExistingVault']}
        onRemoveRecent={onRemoveRecent}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'フォルダを選んで Vault を作成' }));

    await waitFor(() => {
      expect(api.pickFolder).toHaveBeenCalledOnce();
      expect(api.vault.init).toHaveBeenCalledWith('C:\\Users\\alice\\Research');
      expect(onPicked).toHaveBeenCalledWith('C:\\Users\\alice\\Research\\ClassVault');
    });

    fireEvent.click(screen.getByRole('button', { name: /D:\\Lab\\ExistingVault/ }));
    expect(onPicked).toHaveBeenLastCalledWith('D:\\Lab\\ExistingVault');

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onRemoveRecent).toHaveBeenCalledWith('D:\\Lab\\ExistingVault');
  });

  it('searches the Vault after debounce and jumps to the selected hit', async () => {
    const onJumpToFile = vi.fn();
    const api = {
      search: {
        query: vi.fn().mockResolvedValue([
          {
            fileName: 'Gradient.md',
            filePath: 'C:\\Vault\\Math\\notes\\Gradient.md',
            subject: '数学',
            snippet: 'gradient descent',
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = api;

    render(<SearchBar vaultPath={'C:\\Vault'} onJumpToFile={onJumpToFile} />);

    fireEvent.change(screen.getByPlaceholderText('🔍 全体検索...'), {
      target: { value: 'gradient' },
    });

    const hit = await screen.findByText('Gradient.md');
    expect(api.search.query).toHaveBeenCalledWith('C:\\Vault', 'gradient');
    fireEvent.click(hit);
    expect(onJumpToFile).toHaveBeenCalledWith('数学', 'C:\\Vault\\Math\\notes\\Gradient.md');
    expect(screen.queryByText('Gradient.md')).not.toBeInTheDocument();
  });

  it('renders backlinks and navigates to the referenced note', async () => {
    const onJumpToFile = vi.fn();
    const api = {
      links: {
        backlinks: vi.fn().mockResolvedValue([
          {
            fileName: 'Optimization.md',
            filePath: 'C:\\Vault\\Math\\notes\\Optimization.md',
            subject: '数学',
            snippet: '[[Gradient]] と比較',
            category: 'subject-note',
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = api;

    render(<BacklinksPanel vaultPath={'C:\\Vault'} noteName="Gradient" onJumpToFile={onJumpToFile} />);

    fireEvent.click(await screen.findByText('Optimization'));
    expect(api.links.backlinks).toHaveBeenCalledWith('C:\\Vault', 'Gradient');
    expect(onJumpToFile).toHaveBeenCalledWith('C:\\Vault\\Math\\notes\\Optimization.md');
  });

  it('does not render an empty backlinks panel', async () => {
    const api = {
      links: {
        backlinks: vi.fn().mockResolvedValue([]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = api;

    const { container } = render(
      <BacklinksPanel vaultPath={'C:\\Vault'} noteName="孤立ノート" onJumpToFile={vi.fn()} />
    );

    await waitFor(() => expect(api.links.backlinks).toHaveBeenCalledOnce());
    expect(container.querySelector('.backlinks-panel')).not.toBeInTheDocument();
  });
});
