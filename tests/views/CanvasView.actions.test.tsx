import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
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
    { name: '_概要.md', path: '/vault/Math/_概要.md', kind: 'note' as const, ext: '.md', mtime: 1000, preview: 'Overview', meta: { type: 'subject' } },
    { name: 'calc.md', path: '/vault/Math/calc.md', kind: 'note' as const, ext: '.md', mtime: 2000, preview: 'Calculus', meta: { type: 'lecture', color: 'blue' } },
  ],
  materials: [],
};

describe('CanvasView actions', () => {
  const onOpenFile = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onOpenFile.mockClear();
    (window as any).api = {
      vault: {
        listFilesEnriched: vi.fn().mockResolvedValue(MOCK_FILES),
        readBoard: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
        writeBoard: vi.fn().mockResolvedValue(undefined),
      },
      ai: {
        generateCanvas: vi.fn().mockResolvedValue({
          ok: true,
          result: {
            nodes: [
              { id: 'n1', label: 'Root Concept', level: 0 },
              { id: 'n2', label: 'Sub A', level: 1 },
              { id: 'n3', label: 'Sub B', level: 1 },
              { id: 'n4', label: 'Detail', level: 2 },
            ],
            edges: [
              { from: 'n1', to: 'n2' },
              { from: 'n1', to: 'n3' },
              { from: 'n2', to: 'n4' },
            ],
          },
        }),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds memo node on button click', async () => {
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ メモ')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ メモ')); });
    await waitFor(() => { expect(screen.getByText('新しいメモ')).toBeInTheDocument(); });
  });

  it('adds group node on button click', async () => {
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('+ グループ')).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText('+ グループ')); });
    await waitFor(() => { expect(screen.getByText('新規グループ')).toBeInTheDocument(); });
  });

  it('generates AI canvas from overview note', async () => {
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText(/AI で生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/AI で生成/)); });
    await waitFor(() => {
      expect((window as any).api.ai.generateCanvas).toHaveBeenCalledWith('/vault/Math/_概要.md');
    });
    // AI nodes appear
    await waitFor(() => {
      expect(screen.getByText('Root Concept')).toBeInTheDocument();
      expect(screen.getByText('Sub A')).toBeInTheDocument();
      expect(screen.getByText('Detail')).toBeInTheDocument();
    });
  });

  it('falls back to freshest note when no overview', async () => {
    (window as any).api.vault.listFilesEnriched = vi.fn().mockResolvedValue({
      notes: [
        { name: 'calc.md', path: '/vault/Math/calc.md', kind: 'note', ext: '.md', mtime: 2000, preview: 'Calc', meta: {} },
      ],
      materials: [],
    });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText(/AI で生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/AI で生成/)); });
    await waitFor(() => {
      expect((window as any).api.ai.generateCanvas).toHaveBeenCalledWith('/vault/Math/calc.md');
    });
  });

  it('shows alert when no source notes exist for AI', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    (window as any).api.vault.listFilesEnriched = vi.fn()
      .mockResolvedValueOnce(MOCK_FILES) // initial load
      .mockResolvedValueOnce({ notes: [], materials: [] }); // AI generation check
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText(/AI で生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/AI で生成/)); });
    await waitFor(() => { expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('対象ノートがありません')); });
  });

  it('shows alert when AI generation fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    (window as any).api.ai.generateCanvas = vi.fn().mockResolvedValue({ ok: false, error: 'AI error' });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText(/AI で生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/AI で生成/)); });
    await waitFor(() => { expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('AI error')); });
  });

  it('does not call onOpenFile for non-note node double click', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: 'memo-x', type: 'memo', position: { x: 0, y: 0 }, data: { text: 'A memo' } },
      ],
      edges: [],
    });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('A memo')).toBeInTheDocument(); });
    await act(async () => { fireEvent.doubleClick(screen.getByTestId('node-memo-x')); });
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('handles board node without position gracefully', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: '/vault/Math/calc.md', type: 'note' },
      ],
      edges: [],
    });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('calc')).toBeInTheDocument(); });
  });

  it('handles board node without type defaulting to note', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: '/vault/Math/calc.md', position: { x: 0, y: 0 } },
      ],
      edges: [],
    });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText('calc')).toBeInTheDocument(); });
  });

  it('filters edges with unknown AI node ids', async () => {
    (window as any).api.ai.generateCanvas = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        nodes: [{ id: 'n1', label: 'A', level: 0 }],
        edges: [
          { from: 'n1', to: 'n_missing' }, // target doesn't exist
          { from: 'n_missing', to: 'n1' }, // source doesn't exist
        ],
      },
    });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByText(/AI で生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/AI で生成/)); });
    // Should not crash, invalid edges filtered out
    await waitFor(() => { expect(screen.getByText('A')).toBeInTheDocument(); });
  });

  it('shows emoji types correctly', async () => {
    const filesWithTypes = {
      notes: [
        { name: 'n1.md', path: '/vault/Math/n1.md', kind: 'note', ext: '.md', mtime: 1, meta: { type: 'summary' } },
        { name: 'n2.md', path: '/vault/Math/n2.md', kind: 'note', ext: '.md', mtime: 2, meta: { type: 'review' } },
        { name: 'n3.md', path: '/vault/Math/n3.md', kind: 'note', ext: '.md', mtime: 3, meta: { type: 'research' } },
        { name: 'n4.md', path: '/vault/Math/n4.md', kind: 'note', ext: '.md', mtime: 4, meta: { type: 'memo' } },
        { name: 'n5.md', path: '/vault/Math/n5.md', kind: 'note', ext: '.md', mtime: 5, meta: { type: 'daily' } },
        { name: 'n6.md', path: '/vault/Math/n6.md', kind: 'note', ext: '.md', mtime: 6, meta: {} },
      ],
      materials: [],
    };
    (window as any).api.vault.listFilesEnriched = vi.fn().mockResolvedValue(filesWithTypes);
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => {
      const emojis = document.querySelectorAll('.canvas-card-emoji');
      const texts = Array.from(emojis).map(e => e.textContent);
      expect(texts).toContain('📝'); // summary
      expect(texts).toContain('🔁'); // review
      expect(texts).toContain('🔬'); // research
      expect(texts).toContain('🗒️'); // memo
      expect(texts).toContain('📅'); // daily
      expect(texts).toContain('📄'); // default
    });
  });

  it('handles memo node without data property', async () => {
    (window as any).api.vault.readBoard = vi.fn().mockResolvedValue({
      nodes: [
        { id: 'memo-no-data', type: 'memo', position: { x: 0, y: 0 } },
      ],
      edges: [],
    });
    await act(async () => { render(<CanvasView vaultPath="/vault" subject="Math" reloadKey={0} onOpenFile={onOpenFile} />); });
    await waitFor(() => { expect(screen.getByTestId('react-flow')).toBeInTheDocument(); });
  });
});
