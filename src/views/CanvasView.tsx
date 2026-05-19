// Milanote-style Canvas Board for a single subject. Built on React Flow
// (already installed in Stage 7).
//
// Persistence: positions are saved per-subject in `.board.json` inside the
// subject folder. Notes appear as cards; edges are derived from existing
// `[[wikilinks]]` (read-only mirror of the graph).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type Connection,
  type NodeProps,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CARD_COLORS, type CardColor } from '../types/objectTypes';

type EnrichedFile = {
  name: string;
  path: string;
  kind: 'note' | 'pdf' | 'image' | 'office' | 'other';
  ext: string;
  mtime: number;
  meta?: Record<string, unknown>;
  preview?: string;
};

type Props = {
  vaultPath: string;
  subject: string;
  reloadKey: number;
  onOpenFile: (filePath: string, kind: EnrichedFile['kind']) => void;
};

// ---- Custom node types -----------------------------------------------------

const COLOR_BG: Record<CardColor, string> = {
  default: 'var(--card-default)',
  red: 'var(--card-red)',
  orange: 'var(--card-orange)',
  yellow: 'var(--card-yellow)',
  green: 'var(--card-green)',
  teal: 'var(--card-teal)',
  blue: 'var(--card-blue)',
  purple: 'var(--card-purple)',
  pink: 'var(--card-pink)',
  gray: 'var(--card-gray)',
  brown: 'var(--card-brown)',
  indigo: 'var(--card-indigo)',
};

type NoteNodeData = {
  filePath: string;
  title: string;
  preview?: string;
  color?: CardColor;
  type?: string;
  emoji?: string;
};

function NoteNode({ data, selected }: NodeProps) {
  const d = data as unknown as NoteNodeData;
  const color = (d.color ?? 'default') as CardColor;
  return (
    <div
      className={`canvas-card ${selected ? 'selected' : ''}`}
      style={{ background: COLOR_BG[color] }}
      title={d.filePath}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="canvas-card-head">
        <span className="canvas-card-emoji">{d.emoji ?? '📄'}</span>
        <span className="canvas-card-title">{d.title}</span>
      </div>
      {d.preview && <div className="canvas-card-preview">{d.preview}</div>}
    </div>
  );
}

type GroupNodeData = { label: string };

function GroupNode({ data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  return (
    <div className={`canvas-group ${selected ? 'selected' : ''}`}>
      <div className="canvas-group-label">{d.label}</div>
    </div>
  );
}

type MemoNodeData = { text: string; color?: CardColor };

function MemoNode({ data, selected }: NodeProps) {
  const d = data as unknown as MemoNodeData;
  const color = (d.color ?? 'yellow') as CardColor;
  return (
    <div
      className={`canvas-memo ${selected ? 'selected' : ''}`}
      style={{ background: COLOR_BG[color] }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="canvas-memo-text">{d.text || '(空のメモ)'}</div>
    </div>
  );
}

const nodeTypes = {
  note: NoteNode,
  group: GroupNode,
  memo: MemoNode,
};

// ---- View ------------------------------------------------------------------

function CanvasViewInner({ vaultPath, subject, reloadKey, onOpenFile }: Props) {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [files, setFiles] = useState<EnrichedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const initialisedRef = useRef(false);
  const saveTimer = useRef<number | null>(null);

  // Load board + enriched files on mount / reload
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    initialisedRef.current = false;
    Promise.all([
      window.api.vault.listFilesEnriched(vaultPath, subject),
      window.api.vault.readBoard(vaultPath, subject),
    ]).then(([fileList, board]) => {
      if (cancelled) return;
      const allFiles = [...fileList.notes, ...fileList.materials];
      setFiles(allFiles);

      // Build nodes from the board, falling back to a grid layout for any
      // file not yet placed.
      const placed = new Set<string>();
      const initialNodes: Node[] = [];
      for (const n of board.nodes ?? []) {
        if (!n || typeof n !== 'object') continue;
        // Verify the file still exists; otherwise skip stale entry
        const found = allFiles.find((f) => f.path === n.id);
        if (!found && n.type !== 'memo' && n.type !== 'group') continue;
        placed.add(n.id);
        const dataObj: Record<string, unknown> =
          n.type === 'memo' || n.type === 'group'
            ? (n.data as Record<string, unknown> | undefined) ?? {}
            : ({
                filePath: found!.path,
                title: found!.name.replace(/\.md$/, ''),
                preview: found!.preview,
                color: (found!.meta?.color as CardColor) ?? 'default',
                type: found!.meta?.type as string | undefined,
                emoji: emojiForType(found!.meta?.type as string | undefined),
              } as unknown as Record<string, unknown>);
        initialNodes.push({
          id: n.id,
          type: n.type || 'note',
          position: n.position ?? { x: 0, y: 0 },
          data: dataObj,
        });
      }
      // Auto-place new files in a grid below existing nodes
      let col = 0;
      let row = 0;
      const placedYs = initialNodes.map((n) => n.position.y);
      const baseY = (placedYs.length ? Math.max(...placedYs) : 0) + 200;
      for (const f of allFiles) {
        if (placed.has(f.path)) continue;
        if (f.kind !== 'note') continue; // Only auto-place notes; materials live in Gallery
        initialNodes.push({
          id: f.path,
          type: 'note',
          position: { x: col * 240, y: baseY + row * 160 },
          data: {
            filePath: f.path,
            title: f.name.replace(/\.md$/, ''),
            preview: f.preview,
            color: (f.meta?.color as CardColor) ?? 'default',
            type: f.meta?.type as string | undefined,
            emoji: emojiForType(f.meta?.type as string | undefined),
          },
        });
        col += 1;
        if (col >= 4) {
          col = 0;
          row += 1;
        }
      }

      // Edges: union of saved edges + newly-derived wikilink edges
      const savedEdges: Edge[] = (board.edges ?? []).map((e, i: number) => ({
        id: e.id || `saved-${i}`,
        source: e.source,
        target: e.target,
      }));

      setNodes(initialNodes);
      setEdges(savedEdges);
      setLoading(false);
      // Defer "initialised" flag so the auto-save effect doesn't fire on the
      // initial setNodes/setEdges from this load.
      setTimeout(() => {
        initialisedRef.current = true;
      }, 50);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, subject, reloadKey]);

  // Persist whenever nodes/edges change (debounced)
  useEffect(() => {
    if (!initialisedRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const slimNodes = nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.type === 'memo' || n.type === 'group' ? n.data : undefined,
      }));
      const slimEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
      window.api.vault.writeBoard(vaultPath, subject, {
        nodes: slimNodes,
        edges: slimEdges,
      });
    }, 500);
  }, [nodes, edges, vaultPath, subject]);

  // ---- Wrapped change handlers ----
  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => onNodesChangeBase(changes),
    [onNodesChangeBase]
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  // ---- Toolbar actions ----
  const addMemo = () => {
    const id = `memo-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'memo',
        position: { x: 80, y: 80 },
        data: { text: '新しいメモ', color: 'yellow' } as MemoNodeData,
      } as Node,
    ]);
  };

  const addGroup = () => {
    const id = `group-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'group',
        position: { x: 80, y: 80 },
        data: { label: '新規グループ' } as GroupNodeData,
        style: { width: 320, height: 200, background: 'rgba(0,0,0,0.04)' },
      } as Node,
    ]);
  };

  // Phase 3: AI Canvas generation. Calls ai.generateCanvas on the subject's
  // _概要.md (or any note in the subject — fall back to the freshest one)
  // and translates the result into memo nodes laid out by level.
  const [aiBusy, setAiBusy] = useState(false);
  const generateFromAI = async () => {
    setAiBusy(true);
    try {
      // Find a source note — prefer the subject overview, else freshest note.
      const enriched = await window.api.vault.listFilesEnriched(vaultPath, subject);
      const overview = enriched.notes.find((n) => n.name === '_概要.md');
      const source = overview ?? enriched.notes[0];
      if (!source) {
         
        alert('対象ノートがありません。先にノートを 1 つ作成してください。');
        return;
      }
      const r = await window.api.ai.generateCanvas(source.path);
      if (!r.ok) {
         
        alert(`AI Canvas 生成失敗: ${r.error}`);
        return;
      }
      // Layout: x by index in level, y by level depth.
      const byLevel = new Map<number, typeof r.result.nodes>();
      for (const n of r.result.nodes) {
        const arr = byLevel.get(n.level) ?? [];
        arr.push(n);
        byLevel.set(n.level, arr);
      }
      const newNodes: Node[] = [];
      const idMap = new Map<string, string>(); // AI id → canvas id
      const levels = [...byLevel.keys()].sort((a, b) => a - b);
      const Y_GAP = 160;
      const X_GAP = 220;
      levels.forEach((lvl, i) => {
        const items = byLevel.get(lvl)!;
        items.forEach((aiNode, j) => {
          const canvasId = `ai-${Date.now()}-${idMap.size}`;
          idMap.set(aiNode.id, canvasId);
          newNodes.push({
            id: canvasId,
            type: 'memo',
            position: {
              x: 60 + j * X_GAP,
              y: 60 + i * Y_GAP,
            },
            data: {
              text: aiNode.label,
              color: lvl === 0 ? 'blue' : lvl === 1 ? 'yellow' : 'gray',
            } as MemoNodeData,
          } as Node);
        });
      });
      const newEdges: Edge[] = r.result.edges
        .filter((e) => idMap.has(e.from) && idMap.has(e.to))
        .map((e, i) => ({
          id: `ai-edge-${Date.now()}-${i}`,
          source: idMap.get(e.from)!,
          target: idMap.get(e.to)!,
        }));
      setNodes((nds) => [...nds, ...newNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
    } finally {
      setAiBusy(false);
    }
  };

  const onNodeDoubleClick = useCallback(
    (_e: unknown, node: Node) => {
      if (node.type === 'note') {
        const data = node.data as unknown as NoteNodeData;
        const f = files.find((x) => x.path === data.filePath);
        onOpenFile(data.filePath, f?.kind ?? 'note');
      }
    },
    [files, onOpenFile]
  );

  const noteCount = useMemo(() => nodes.filter((n) => n.type === 'note').length, [nodes]);

  if (loading) return <div className="empty-state">Canvas を読み込み中…</div>;

  return (
    <div className="canvas-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[12, 12]}
      >
        <Background gap={24} size={1} color="var(--divider)" />
        <Panel position="top-left" className="canvas-toolbar">
          <span className="canvas-title">🗂️ {subject} ({noteCount} ノート)</span>
          <button onClick={addMemo}>+ メモ</button>
          <button onClick={addGroup}>+ グループ</button>
          <button onClick={generateFromAI} disabled={aiBusy} title="科目概要から AI でマインドマップを生成">
            {aiBusy ? '⏳ 生成中…' : '🤖 AI で生成'}
          </button>
          <span className="canvas-hint">ダブルクリック: ノートを開く / ドラッグで接続線</span>
        </Panel>
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable />
      </ReactFlow>
    </div>
  );
}

function emojiForType(type: string | undefined): string {
  switch (type) {
    case 'lecture': return '🎓';
    case 'summary': return '📝';
    case 'review': return '🔁';
    case 'research': return '🔬';
    case 'memo': return '🗒️';
    case 'daily': return '📅';
    case 'subject': return '📋';
    default: return '📄';
  }
}

export function CanvasView(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}

// Suppress unused color list warning if linter triggers
void CARD_COLORS;
