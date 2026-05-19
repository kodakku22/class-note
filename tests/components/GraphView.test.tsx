import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock ReactFlow since it requires browser layout
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, edges, onNodeClick }: any) => (
    <div data-testid="react-flow">
      {nodes?.map((n: any) => (
        <div key={n.id} data-testid={`node-${n.id}`} onClick={() => onNodeClick(null, n)}>
          {n.data.label}
        </div>
      ))}
      <span data-testid="edge-count">{edges?.length ?? 0}</span>
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  MiniMap: () => <div data-testid="minimap" />,
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  Position: { Top: 'top', Bottom: 'bottom' },
  Handle: () => null,
}));

vi.mock('d3-force', () => ({
  forceSimulation: vi.fn(() => {
    const sim: any = {
      force: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      tick: vi.fn(),
    };
    return sim;
  }),
  forceLink: vi.fn(() => {
    const fl: any = {
      id: vi.fn().mockReturnThis(),
      distance: vi.fn().mockReturnThis(),
      strength: vi.fn().mockReturnThis(),
    };
    return fl;
  }),
  forceManyBody: vi.fn(() => ({
    strength: vi.fn().mockReturnThis(),
  })),
  forceCenter: vi.fn(() => ({})),
  forceCollide: vi.fn(() => ({})),
}));

import { GraphView } from '../../src/components/GraphView';

const SAMPLE_GRAPH_DATA = {
  nodes: [
    { id: '/vault/Math/calc.md', label: 'Calculus', subject: 'Math', category: 'subject-note' },
    { id: '/vault/Math/diff.md', label: 'Differential', subject: 'Math', category: 'subject-note' },
    { id: '/vault/books/ml.md', label: 'ML Book', category: 'book' },
  ],
  edges: [
    { source: '/vault/Math/calc.md', target: '/vault/Math/diff.md' },
  ],
};

describe('GraphView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      graphData: vi.fn().mockResolvedValue(SAMPLE_GRAPH_DATA),
    };
  });

  it('shows loading state initially', () => {
    (window as any).api.vault.graphData = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<GraphView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    expect(screen.getByText(/グラフを構築中/)).toBeInTheDocument();
  });

  it('shows empty state when no nodes', async () => {
    (window as any).api.vault.graphData = vi.fn().mockResolvedValue({ nodes: [], edges: [] });

    await act(async () => {
      render(<GraphView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('表示するノートがありません')).toBeInTheDocument();
    });
  });

  it('renders graph header with node/edge count', async () => {
    await act(async () => {
      render(<GraphView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/3 ノート/)).toBeInTheDocument();
      expect(screen.getByText(/1 リンク/)).toBeInTheDocument();
    });
  });

  it('renders filter input', async () => {
    await act(async () => {
      render(<GraphView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('フィルタ…')).toBeInTheDocument();
    });
  });

  it('calls onJumpToFile on node click', async () => {
    const onJumpToFile = vi.fn();

    await act(async () => {
      render(<GraphView vaultPath="/vault" onJumpToFile={onJumpToFile} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Calculus'));
    expect(onJumpToFile).toHaveBeenCalledWith('/vault/Math/calc.md');
  });

  it('filters nodes by name', async () => {
    await act(async () => {
      render(<GraphView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Calculus')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('フィルタ…'), { target: { value: 'calc' } });
    });

    expect(screen.getByText('Calculus')).toBeInTheDocument();
    expect(screen.queryByText('ML Book')).not.toBeInTheDocument();
  });

  it('calls graphData with vaultPath', async () => {
    await act(async () => {
      render(<GraphView vaultPath="/vault" onJumpToFile={vi.fn()} />);
    });

    expect((window as any).api.vault.graphData).toHaveBeenCalledWith('/vault');
  });
});
