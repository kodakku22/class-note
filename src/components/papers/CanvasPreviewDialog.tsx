// AI-generated Canvas preview.
//
// Phase 2 minimal integration: generateCanvas IPC returns nodes + edges in
// our normalized shape; this dialog renders them as a layered SVG (root at
// top, level-1 splayed below, level-2 below those). Not pretty enough for
// final use, but lets the researcher see the structure and decide whether
// to save the JSON / port it into the existing React Flow CanvasView.
//
// Phase 3 will replace this with a proper React Flow embedding.
import { useEffect, useMemo, useState } from 'react';

type CanvasNode = { id: string; label: string; url?: string; level: number };
type CanvasEdge = { from: string; to: string };
type CanvasResult = { nodes: CanvasNode[]; edges: CanvasEdge[] };

type Props = {
  filePath: string;
  onClose: () => void;
};

export function CanvasPreviewDialog({ filePath, onClose }: Props) {
  const [result, setResult] = useState<CanvasResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api.ai.generateCanvas(filePath).then((r) => {
      if (cancelled) return;
      if (r.ok) setResult(r.result);
      else setError(r.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Layout: group nodes by level. Each level becomes a horizontal row
  // distributed evenly. Edges become straight lines between centers.
  const layout = useMemo(() => {
    if (!result) return null;
    const W = 820;
    const H = 480;
    const PAD = 40;
    const byLevel = new Map<number, CanvasNode[]>();
    for (const n of result.nodes) {
      const arr = byLevel.get(n.level) ?? [];
      arr.push(n);
      byLevel.set(n.level, arr);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const positions = new Map<string, { x: number; y: number }>();
    levels.forEach((lvl, i) => {
      const items = byLevel.get(lvl)!;
      const y = PAD + (H - PAD * 2) * (levels.length === 1 ? 0.5 : i / (levels.length - 1));
      items.forEach((n, j) => {
        const x =
          PAD + (W - PAD * 2) * (items.length === 1 ? 0.5 : j / (items.length - 1));
        positions.set(n.id, { x, y });
      });
    });
    return { positions, W, H };
  }, [result]);

  const saveAsJson = async () => {
    if (!result) return;
    const json = JSON.stringify(result, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // ignore
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal canvas-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="AI で生成した Canvas"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: 880, padding: 0 }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
          <h3 style={{ margin: 0 }}>🎨 AI で生成した Canvas</h3>
          <div className="help" style={{ fontSize: 11 }}>
            ノートの構造を AI がマインドマップ化しました。完成度は v1 — 編集可能な Canvas は Phase 3 で対応。
          </div>
        </div>

        <div style={{ padding: 18 }}>
          {loading && <div className="empty-state">⏳ 選択中AIで生成中…</div>}
          {error && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              ⚠️ {error}
            </div>
          )}
          {result && layout && (
            <svg
              width={layout.W}
              height={layout.H}
              viewBox={`0 0 ${layout.W} ${layout.H}`}
              role="img"
              aria-label="生成されたマインドマップ"
              style={{ background: 'var(--bg-secondary)', borderRadius: 6 }}
            >
              {result.edges.map((e, i) => {
                const a = layout.positions.get(e.from);
                const b = layout.positions.get(e.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--divider)"
                    strokeWidth={1.5}
                  />
                );
              })}
              {result.nodes.map((n) => {
                const p = layout.positions.get(n.id);
                if (!p) return null;
                const isRoot = n.level === 0;
                const w = Math.min(220, Math.max(80, n.label.length * 8));
                return (
                  <g key={n.id} transform={`translate(${p.x - w / 2}, ${p.y - 18})`}>
                    <rect
                      width={w}
                      height={36}
                      rx={isRoot ? 18 : 8}
                      fill={isRoot ? 'var(--accent, #4a9eff)' : 'var(--bg)'}
                      stroke={isRoot ? 'var(--accent, #4a9eff)' : 'var(--divider)'}
                      strokeWidth={1.5}
                    />
                    <text
                      x={w / 2}
                      y={22}
                      textAnchor="middle"
                      fontSize={12}
                      fill={isRoot ? '#fff' : 'var(--text)'}
                      fontWeight={isRoot ? 600 : 400}
                    >
                      {n.label.length > 28 ? n.label.slice(0, 26) + '…' : n.label}
                    </text>
                    {n.url && (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          window.api.materials.openUrl(n.url!);
                        }}
                      >
                        <text
                          x={w - 8}
                          y={14}
                          textAnchor="end"
                          fontSize={10}
                          fill="var(--accent, #4a9eff)"
                        >
                          ↗
                        </text>
                      </a>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--divider)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button onClick={onClose}>閉じる</button>
          <button onClick={saveAsJson} disabled={!result}>
            📋 JSON をコピー
          </button>
        </div>
      </div>
    </div>
  );
}
