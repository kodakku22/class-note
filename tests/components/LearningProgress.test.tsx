import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LearningProgress } from '../../src/components/insights/LearningProgress';

describe('LearningProgress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      listSubjects: vi.fn().mockResolvedValue(['Math', 'Physics']),
      listFiles: vi.fn().mockResolvedValue({ notes: [{ fileName: 'a.md' }, { fileName: 'b.md' }], materials: [] }),
    };
    (window as any).api.wiki = {
      list: vi.fn().mockResolvedValue([
        { name: 'page1.md' },
        { name: 'page2.md' },
        { name: 'WIKI_SCHEMA.md' },
      ]),
    };
    (window as any).api.outputs = {
      list: vi.fn().mockResolvedValue([{ name: 'out1.md' }]),
    };
  });

  it('renders nothing before loading', () => {
    (window as any).api.vault.listSubjects = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<LearningProgress vaultPath="/vault" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows learning loop title after loading', async () => {
    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/学習ループ/)).toBeInTheDocument();
    });
  });

  it('shows raw note count (2 per subject × 2 subjects = 4)', async () => {
    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('shows wiki count excluding WIKI_SCHEMA.md', async () => {
    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows outputs count', async () => {
    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('shows segment labels', async () => {
    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('素材')).toBeInTheDocument();
      expect(screen.getByText('Wiki')).toBeInTheDocument();
      expect(screen.getByText('Outputs')).toBeInTheDocument();
    });
  });

  it('shows hint when raw > 0 but wiki = 0', async () => {
    (window as any).api.wiki.list = vi.fn().mockResolvedValue([{ name: 'WIKI_SCHEMA.md' }]);

    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Wiki にコンパイル/)).toBeInTheDocument();
    });
  });

  it('shows hint when wiki >= 3 but outputs = 0', async () => {
    (window as any).api.wiki.list = vi.fn().mockResolvedValue([
      { name: 'p1.md' }, { name: 'p2.md' }, { name: 'p3.md' },
    ]);
    (window as any).api.outputs.list = vi.fn().mockResolvedValue([]);

    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/ヘルスチェックで盲点を見つけましょう/)).toBeInTheDocument();
    });
  });

  it('has region aria label', async () => {
    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /学習ループの進捗/ })).toBeInTheDocument();
    });
  });

  it('reloads on reloadKey change', async () => {
    const { rerender } = await act(async () =>
      render(<LearningProgress vaultPath="/vault" reloadKey={1} />)
    );

    await waitFor(() => {
      expect((window as any).api.vault.listSubjects).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender(<LearningProgress vaultPath="/vault" reloadKey={2} />);
    });

    await waitFor(() => {
      expect((window as any).api.vault.listSubjects).toHaveBeenCalledTimes(2);
    });
  });

  it('handles listFiles error gracefully', async () => {
    (window as any).api.vault.listFiles = vi.fn().mockRejectedValue(new Error('fail'));

    await act(async () => {
      render(<LearningProgress vaultPath="/vault" />);
    });

    await waitFor(() => {
      // Should show 0 for raw count since listFiles failed
      expect(screen.getByText('素材')).toBeInTheDocument();
    });
  });
});
