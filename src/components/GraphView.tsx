// React Flow + d3-force based Graph View. Replaces the previous self-rolled
// SVG implementation. Each node is a markdown file in the vault, edges are
// `[[wikilinks]]`.
//
// Layout: a one-shot d3-force simulation runs on mount to settle node
// positions, then React Flow handles pan / zoom / interaction.
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  Handle,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import { colorForSubject } from '../utils/colors';

type Props = {
  vaultPath: string;
  onJumpToFile: (filePath: string) => void;
};

type RawNode = { id: string; label: string; subject?: string; category: string };
type RawEdge = { source: string; target: string };

type SimNode = SimulationNodeDatum & RawNode & { degree: number };

// ---- Custom Node component -------------------------------------------------

type NodeData = {
  label: string;
  subject?: string;
  category: string;
  degree: number;
};

function GraphNode({ data }: { data: NodeData }) {
  const radius = 6 + Math.min(14, data.degree * 1.5);
  const color =
    data.category === 'book'
      ? '#a37b00'
      : data.category === 'memo'
        ? '#5e8a3e'
        : data.category === 'subject-overview'
          ? '#666'
          : data.subject
            ? colorForSubject(data.subject).accent
            : '#888';
  return (
    <div className="graph-node" title={data.label}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="graph-node-circle"
        style={{
          width: radius * 2,
          height: radius * 2,
          background: color,
          borderRadius: '50%',
          border: '1.5px solid var(--bg)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
        }}
      />
      {data.degree >= 2 && <div className="graph-node-label">{data.label}</div>}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { graph: GraphNode };

// ---- View ------------------------------------------------------------------

function GraphViewInner({ vaultPath, onJumpToFile }: Props) {
  const [data, setData] = useState<{ nodes: RawNode[]; edges: RawEdge[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [layoutReady, setLayoutReady] = useState(false);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  // Fetch graph data
  useEffect(() => {
    setLoading(true);
    setLayoutReady(false);
    window.api.vault.graphData(vaultPath).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [vaultPath]);

  // Run a one-shot d3-force layout when data arrives
  useEffect(() => {
    if (data.nodes.length === 0) return;
    const degree = new Map<string, number>();
    for (const e of data.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }

    const simNodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      degree: degree.get(n.id) ?? 0,
    }));
    const simEdges = data.edges.map((e) => ({ source: e.source, target: e.target }));

    const sim = forceSimulation(simNodes)
      .force(
        'link',
        forceLink<SimNode, { source: string; target: string }>(simEdges)
          .id((n) => n.id)
          .distance(110)
          .strength(0.6)
      )
      .force('charge', forceManyBody().strength(-260))
      .force('center', forceCenter(0, 0))
      .force(
        'collide',
        forceCollide<SimNode>((n) => 14 + Math.min(20, n.degree * 1.5))
      )
      .stop();

    // Run a fixed number of iterations synchronously
    for (let i = 0; i < 280; i++) sim.tick();

    const next = new Map<string, { x: number; y: number }>();
    for (const n of simNodes) next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    setPositions(next);
    setLayoutReady(true);
  }, [data]);

  const filterLower = filter.trim().toLowerCase();

  const nodes: Node[] = useMemo(() => {
    if (!layoutReady) return [];
    const degree = new Map<string, number>();
    for (const e of data.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    return data.nodes
      .filter((n) => !filterLower || n.label.toLowerCase().includes(filterLower))
      .map<Node>((n) => {
        const pos = positions.get(n.id) ?? { x: 0, y: 0 };
        return {
          id: n.id,
          type: 'graph',
          position: pos,
          data: {
            label: n.label,
            subject: n.subject,
            category: n.category,
            degree: degree.get(n.id) ?? 0,
          },
          draggable: true,
        };
      });
  }, [data, positions, layoutReady, filterLower]);

  const edges: Edge[] = useMemo(() => {
    const visibleIds = new Set(nodes.map((n) => n.id));
    return data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map<Edge>((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        style: { stroke: 'var(--divider)', strokeWidth: 1 },
        animated: false,
      }));
  }, [data.edges, nodes]);

  const onNodeClick = useCallback(
    (_e: unknown, node: Node) => {
      onJumpToFile(node.id);
    },
    [onJumpToFile]
  );

  if (loading) return <div className="empty-state">グラフを構築中…</div>;
  if (data.nodes.length === 0) {
    return <div className="empty-state">表示するノートがありません</div>;
  }

  return (
    <div className="graph-view-v2">
      <div className="graph-header">
        <span className="graph-title">
          🕸️ グラフ ({data.nodes.length} ノート / {data.edges.length} リンク)
        </span>
        <input
          className="graph-filter"
          placeholder="フィルタ…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="var(--divider)" />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(n) => {
              const data = (n as Node).data as NodeData | undefined;
              if (!data) return '#aaa';
              if (data.subject) return colorForSubject(data.subject).accent;
              return '#888';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export function GraphView(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
