// 実験ログ専用エディタ — Phase 3 研究者特化機能。
//
// 通常のノートと別建てにする理由: 機械学習・計算研究では「ノートとして自由
// 記述」よりも「構造化された実験記録」のほうが再現性に直結する。
// 自由記述ゾーンも残すが、frontmatter に標準的な実験フィールドを必ず保持
// することで、後から実験を比較・検索しやすくする。
//
// 構造:
//   - 上半分: 構造化フォーム (dataset / model / hyperparams / seed / git_sha /
//             hardware / metrics)
//   - 下半分: 自由記述 (TipTap BlockEditor)
//   - フッター: 「再現性パッケージを生成」ボタン
//
// metrics は Markdown table 形式で frontmatter に保存し、ノート末尾にも
// 同じテーブルを書き出す。表計算ソフトとの相互運用性を確保。
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { parseFrontmatter, stringifyFrontmatter } from '../../utils/frontmatter';
// Lazy — see NoteViewer for rationale. ExperimentEditor only shows the
// block editor in its bottom half, so the editor-tiptap chunk loads
// after the structured form is interactive.
const BlockEditor = lazy(() =>
  import('../editor/BlockEditor').then((m) => ({ default: m.BlockEditor }))
);
import { useDialog } from '../common/Dialog';

type ExperimentMeta = {
  title?: string;
  type?: 'experiment';
  dataset?: string;
  model?: string;
  hyperparams?: Record<string, string | number>;
  seed?: number;
  git_sha?: string;
  hardware?: string;
  status?: 'planning' | 'running' | 'failed' | 'success';
  startedAt?: string;
  finishedAt?: string;
  /** Free-form table rows: [{ metric: 'BLEU', baseline: 24.1, ours: 25.7 }, ...] */
  metrics?: Array<Record<string, string | number>>;
  notes?: string;
  [key: string]: unknown;
};

type Props = {
  filePath: string;
  vaultPath: string;
};

export function ExperimentEditor({ filePath, vaultPath }: Props) {
  const [meta, setMeta] = useState<ExperimentMeta>({ type: 'experiment' });
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const knownMtime = useRef<number>(0);
  const saveTimer = useRef<number | null>(null);
  const [dlg, dialogElement] = useDialog();

  useEffect(() => {
    let cancelled = false;
    window.api.vault.readNoteWithMtime(filePath).then(({ content, mtime }) => {
      if (cancelled) return;
      knownMtime.current = mtime;
      const { meta, body } = parseFrontmatter(content);
      setMeta({ type: 'experiment', ...(meta as ExperimentMeta) });
      setBody(body);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const persist = async (nextMeta: ExperimentMeta, nextBody: string) => {
    setSaving(true);
    const content = stringifyFrontmatter(nextMeta as Record<string, unknown>, nextBody);
    const r = await window.api.vault.writeNote(filePath, content, knownMtime.current);
    setSaving(false);
    if (r.ok && typeof r.currentMtime === 'number') {
      knownMtime.current = r.currentMtime;
      setSavedAt(Date.now());
    }
  };

  const scheduleSave = (nextMeta: ExperimentMeta, nextBody: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(nextMeta, nextBody), 600);
  };

  const update = (patch: Partial<ExperimentMeta>) => {
    const next = { ...meta, ...patch };
    setMeta(next);
    scheduleSave(next, body);
  };

  const updateBody = (next: string) => {
    setBody(next);
    scheduleSave(meta, next);
  };

  const generateRepro = async () => {
    const r = await window.api.experiments.generateReproPackage(vaultPath, filePath);
    if (r.ok) {
      await dlg.alert({
        title: '再現性パッケージを生成しました',
        message: `${r.files?.length ?? 0} ファイルを保存しました。\n\n${r.outputDir ?? ''}`,
        variant: 'success',
      });
    } else {
      await dlg.alert({
        title: '生成に失敗しました',
        message: r.error ?? '不明なエラー',
        variant: 'error',
      });
    }
  };

  if (!loaded) return <div className="empty-state">読み込み中…</div>;

  // hyperparams は Object.entries で表示 + 編集
  const hpEntries = Object.entries(meta.hyperparams ?? {}) as [string, string | number][];

  return (
    <div className="experiment-editor">
      <div className="experiment-header">
        <input
          type="text"
          className="experiment-title"
          value={meta.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="実験タイトル"
        />
        <select
          value={meta.status ?? 'planning'}
          onChange={(e) =>
            update({ status: e.target.value as ExperimentMeta['status'] })
          }
        >
          <option value="planning">📋 planning</option>
          <option value="running">⏱ running</option>
          <option value="success">✓ success</option>
          <option value="failed">✗ failed</option>
        </select>
        {saving ? (
          <span className="experiment-status">保存中…</span>
        ) : savedAt ? (
          <span className="experiment-status">
            ✓ {new Date(savedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      <div className="experiment-grid">
        <div className="experiment-field">
          <label>Dataset</label>
          <input
            type="text"
            value={meta.dataset ?? ''}
            onChange={(e) => update({ dataset: e.target.value })}
            placeholder="例: WMT-14 EN-DE"
          />
        </div>
        <div className="experiment-field">
          <label>Model</label>
          <input
            type="text"
            value={meta.model ?? ''}
            onChange={(e) => update({ model: e.target.value })}
            placeholder="例: Transformer (6 layers, 512 dim)"
          />
        </div>
        <div className="experiment-field">
          <label>Seed</label>
          <input
            type="number"
            value={meta.seed ?? ''}
            onChange={(e) =>
              update({ seed: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="42"
          />
        </div>
        <div className="experiment-field">
          <label>git SHA</label>
          <input
            type="text"
            value={meta.git_sha ?? ''}
            onChange={(e) => update({ git_sha: e.target.value })}
            placeholder="例: a1b2c3d"
          />
        </div>
        <div className="experiment-field" style={{ gridColumn: 'span 2' }}>
          <label>Hardware</label>
          <input
            type="text"
            value={meta.hardware ?? ''}
            onChange={(e) => update({ hardware: e.target.value })}
            placeholder="例: 8x A100 80GB"
          />
        </div>
        <div className="experiment-field">
          <label>Started at</label>
          <input
            type="date"
            value={meta.startedAt ?? ''}
            onChange={(e) => update({ startedAt: e.target.value || undefined })}
          />
        </div>
        <div className="experiment-field">
          <label>Finished at</label>
          <input
            type="date"
            value={meta.finishedAt ?? ''}
            onChange={(e) => update({ finishedAt: e.target.value || undefined })}
          />
        </div>
      </div>

      <div className="experiment-section">
        <div className="experiment-section-header">
          <h3>Hyperparameters</h3>
          <button
            onClick={() =>
              update({
                hyperparams: {
                  ...(meta.hyperparams ?? {}),
                  ['']: '',
                },
              })
            }
          >
            + 追加
          </button>
        </div>
        <div className="experiment-hp-list">
          {hpEntries.length === 0 && (
            <div className="help">「+ 追加」で hyperparameter を登録</div>
          )}
          {hpEntries.map(([key, value], i) => (
            <div key={i} className="experiment-hp-row">
              <input
                type="text"
                value={key}
                onChange={(e) => {
                  const newKey = e.target.value;
                  const next = { ...(meta.hyperparams ?? {}) };
                  delete next[key];
                  next[newKey] = value;
                  update({ hyperparams: next });
                }}
                placeholder="learning_rate"
              />
              <span style={{ color: 'var(--text-tertiary)' }}>=</span>
              <input
                type="text"
                value={String(value)}
                onChange={(e) => {
                  const next = { ...(meta.hyperparams ?? {}) };
                  // Try to coerce to number
                  const v = e.target.value;
                  next[key] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
                  update({ hyperparams: next });
                }}
                placeholder="0.001"
              />
              <button
                className="subtle"
                onClick={() => {
                  const next = { ...(meta.hyperparams ?? {}) };
                  delete next[key];
                  update({ hyperparams: next });
                }}
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="experiment-section">
        <h3>📝 ノート</h3>
        <Suspense
          fallback={
            <div className="empty-state" style={{ padding: 24 }}>
              エディタを読み込み中…
            </div>
          }
        >
          <BlockEditor content={body} onChange={updateBody} placeholder="観察・気づき・次の一手…" />
        </Suspense>
      </div>

      <div className="experiment-footer">
        <button className="primary" onClick={generateRepro}>
          📦 再現性パッケージを生成
        </button>
        <span className="help">
          experiment.json + requirements.txt + Makefile を Outputs/ に書き出します
        </span>
      </div>
      {dialogElement}
    </div>
  );
}
