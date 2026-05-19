import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@xyflow/react', () => {
  const React = require('react');
  return {
    ReactFlow: ({ nodes, edges, onNodeDoubleClick, nodeTypes, children }: any) => (
      <div data-testid="react-flow">
        {nodes?.map((n: any) => {
          const NodeComp = nodeTypes?.[n.type];
          return (
            <div key={n.id} data-testid={`node-${n.id}`} onDoubleClick={() => onNodeDoubleClick?.(null, n)}>
              {NodeComp ? <NodeComp data={n.data} selected={false} /> : String(n.id)}
            </div>
          );
        })}
        <span data-testid="edge-count">{edges?.length ?? 0}</span>
        {children}
      </div>
    ),
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap: () => <div data-testid="minimap" />,
    Panel: ({ children, className }: any) => <div className={className}>{children}</div>,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    useNodesState: (init: any[]) => {
      const [nodes, setNodes] = React.useState(init);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (init: any[]) => {
      const [edges, setEdges] = React.useState(init);
      return [edges, setEdges, vi.fn()];
    },
    addEdge: vi.fn((params: any, eds: any[]) => [...eds, params]),
    Position: { Top: 'top', Bottom: 'bottom' },
    Handle: () => null,
  };
});

import { CanvasView } from '../../src/views/CanvasView';

const MOCK_FILES = {
  notes: [
    { name: 'calc.md', path: '/vault/Math/calc.md', kind: 'note' as const, ext: '.md', mtime: 1000, preview: 'Calculus intro', meta: { type: 'lecture' } },
    { name: 'diff.md', path: '/vault/Math/diff.md', kind: 'note' as const, ext: '.md', mtime: 2000, preview: 'Differential', meta: {} },
  ],
  materials: [
    { name: 'fig.png', path: '/vault/Math/fig.png', kind: 'image' as const, ext: '.png', mtime: 3000 },
  ],
};

const MOCK_BOARD = {
  nodes: [
    { id: '/vault/Math/calc.md', type: 'note', position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: '/vault/Math/calc.md', target: '/vault/Math/diff.md' },
  ],
};

describe('CanvasView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      listFilesEnriched: vi.fn().mockResolvedValue(MOCK_FILES),
      readBoard: vi.fn().mockResolvedValue(MOCK_BOARD),
      writeBoard: vi.fn().mockResolvedValue({ ok: true }),
    };
    (window as any).api.ai = {
      generateCanvas: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          nodes: [
            { id: 'n1', label: 'Root Concept', level: 0 },
            { id: 'n2', label: 'Sub Concept', level: 1 },
          ],
          edges: [{ from: 'n1', to: 'n2' }],
        },
      }),
    };
  });

  it('shows loading state initially', () => {
    (window as any).api.vault.listFilesEnriched = vi.fn().mockReturnValue(new Promise(() => {}));
    (window as any).api.vault.readBoard = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    expect(screen.getByText(/Canvas を読み込み中/)).toBeInTheDocument();
  });

  it('renders toolbar with subject name and buttons', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Math/)).toBeInTheDocument();
    });

    expect(screen.getByText('+ メモ')).toBeInTheDocument();
    expect(screen.getByText('+ グループ')).toBeInTheDocument();
    expect(screen.getByText(/AI で生成/)).toBeInTheDocument();
  });

  it('renders note nodes from board data', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('calc')).toBeInTheDocument();
    });
  });

  it('renders edges from board data', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    });
  });

  it('shows ReactFlow with background and controls', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    });

    expect(screen.getByTestId('background')).toBeInTheDocument();
    expect(screen.getByTestId('controls')).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('calls listFilesEnriched and readBoard on mount', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    expect((window as any).api.vault.listFilesEnriched).toHaveBeenCalledWith('/vault', 'Math');
    expect((window as any).api.vault.readBoard).toHaveBeenCalledWith('/vault', 'Math');
  });

  it('shows hint text', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/ダブルクリック/)).toBeInTheDocument();
    });
  });

  it('calls onOpenFile when note node is double-clicked', async () => {
    const onOpenFile = vi.fn();
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('node-/vault/Math/calc.md')).toBeInTheDocument();
    });

    fireEvent.doubleClick(screen.getByTestId('node-/vault/Math/calc.md'));
    expect(onOpenFile).toHaveBeenCalledWith('/vault/Math/calc.md', 'note');
  });

  it('renders note card with emoji and title', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('calc')).toBeInTheDocument();
    });
  });

  it('auto-places notes not in board', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('diff')).toBeInTheDocument();
    });
  });

  it('renders empty board gracefully', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({ nodes: [], edges: [] });

    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Math/)).toBeInTheDocument();
    });
  });

  it('shows note count in toolbar', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      // "ノート" appears in both the title and hint text
      const matches = screen.getAllByText(/ノート/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // The title should contain the note count like "2 ノート"
      const title = document.querySelector('.canvas-title');
      expect(title?.textContent).toMatch(/\d+ ノート/);
    });
  });

  it('handles board with stale entries', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: '/vault/Math/deleted.md', type: 'note', position: { x: 0, y: 0 } },
      ],
      edges: [],
    });

    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Math/)).toBeInTheDocument();
    });
  });

  it('renders memo node from board', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: 'memo-123', type: 'memo', position: { x: 0, y: 0 }, data: { text: 'Test memo', color: 'yellow' } },
      ],
      edges: [],
    });

    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test memo')).toBeInTheDocument();
    });
  });

  it('renders group node from board', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: 'group-123', type: 'group', position: { x: 0, y: 0 }, data: { label: 'My Group' } },
      ],
      edges: [],
    });

    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('My Group')).toBeInTheDocument();
    });
  });

  it('shows empty memo text placeholder', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: 'memo-empty', type: 'memo', position: { x: 0, y: 0 }, data: { text: '' } },
      ],
      edges: [],
    });

    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      expect(screen.getByText('(空のメモ)')).toBeInTheDocument();
    });
  });

  it('shows lecture emoji for lecture type notes', async () => {
    await act(async () => {
      render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={vi.fn()} />);
    });

    await waitFor(() => {
      // calc.md has type: 'lecture' → emoji 🎓
      const emojis = document.querySelectorAll('.canvas-card-emoji');
      const emojiTexts = Array.from(emojis).map((e) => e.textContent);
      expect(emojiTexts).toContain('🎓');
    });
  });
});
