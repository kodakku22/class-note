// Outputs view — date-sorted list of generated artefacts under <vault>/Outputs/.
// Mostly a thin wrapper around outputs:list. Click → open in main Viewer.
import { useEffect, useState, useCallback } from 'react';

type OutputItem = { name: string; filePath: string; mtime: number };

type Props = {
  vaultPath: string;
  onOpenFile: (filePath: string) => void;
};

export function OutputsView({ vaultPath, onOpenFile }: Props) {
  const [items, setItems] = useState<OutputItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.api.outputs.list(vaultPath);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="main-area outputs-view">
      <div className="wiki-header">
        <div>
          <h2 style={{ margin: 0 }}>📤 Outputs</h2>
          <span className="wiki-subtitle">AI が生成した成果物</span>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">読み込み中…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📤</div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>まだ Outputs はありません</div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                maxWidth: 420,
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              ヘルスチェックレポートやエクスポート成果物がここに保存されます。
            </div>
          </div>
        </div>
      ) : (
        <div className="outputs-list">
          {items.map((it) => {
            const date = new Date(it.mtime);
            return (
              <button
                key={it.filePath}
                className="outputs-item"
                onClick={() => onOpenFile(it.filePath)}
              >
                <span className="outputs-icon">📄</span>
                <span className="outputs-name">{it.name.replace(/\.md$/, '')}</span>
                <span className="outputs-date">
                  {date.toLocaleDateString('ja-JP')} {date.toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
