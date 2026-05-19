import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { OutputsView } from '../../src/components/OutputsView';

const mockOutputsList = vi.fn();

describe('OutputsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockOutputsList.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api.outputs = { list: mockOutputsList };
  });

  it('shows empty state when no outputs', async () => {
    await act(async () => {
      render(<OutputsView vaultPath="/vault" onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('まだ Outputs はありません')).toBeInTheDocument();
    });
  });

  it('renders header', async () => {
    await act(async () => {
      render(<OutputsView vaultPath="/vault" onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Outputs');
    });
  });

  it('renders list of outputs', async () => {
    mockOutputsList.mockResolvedValue([
      { name: 'report.md', filePath: '/vault/Outputs/report.md', mtime: Date.now() },
      { name: 'summary.md', filePath: '/vault/Outputs/summary.md', mtime: Date.now() - 10000 },
    ]);

    await act(async () => {
      render(<OutputsView vaultPath="/vault" onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('report')).toBeInTheDocument();
    });
    expect(screen.getByText('summary')).toBeInTheDocument();
  });

  it('calls onOpenFile when an output is clicked', async () => {
    const onOpenFile = vi.fn();
    mockOutputsList.mockResolvedValue([
      { name: 'report.md', filePath: '/vault/Outputs/report.md', mtime: Date.now() },
    ]);

    await act(async () => {
      render(<OutputsView vaultPath="/vault" onOpenFile={onOpenFile} />);
    });

    await waitFor(() => {
      expect(screen.getByText('report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('report'));
    expect(onOpenFile).toHaveBeenCalledWith('/vault/Outputs/report.md');
  });
});
