import { useEffect, useMemo, useState } from 'react';
import type { ResearchDashboard, ResearchDeadline } from '../../types';
import { log } from '../../utils/logger';
import { useDialog } from '../common/Dialog';

type Props = {
  vaultPath: string;
  reloadKey?: number;
  onOpenFile: (filePath: string) => void;
};

function statusRows(byStatus: Record<string, number>): Array<{ status: string; count: number }> {
  return Object.entries(byStatus)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export function ProgressDashboard({ vaultPath, reloadKey, onOpenFile }: Props) {
  const [dashboard, setDashboard] = useState<ResearchDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dlg, dialogElement] = useDialog();

  const reload = async () => {
    setLoading(true);
    setError(null);
    const r = await window.api.research.getDashboard(vaultPath);
    if (r.ok) {
      setDashboard(r.dashboard);
    } else {
      setError(r.error);
      log.error('research.getDashboard failed', { error: r.error });
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.api.research
      .getDashboard(vaultPath)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setDashboard(r.dashboard);
        else setError(r.error);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, reloadKey]);

  const maxActivity = useMemo(
    () => Math.max(1, ...(dashboard?.activity.map((a) => a.count) ?? [0])),
    [dashboard]
  );
  const heatColor = (count: number): string => {
    if (count === 0) return 'var(--bg-secondary)';
    const intensity = Math.log(1 + count) / Math.log(1 + maxActivity);
    return `rgba(74, 158, 255, ${(0.2 + intensity * 0.8).toFixed(2)})`;
  };

  const saveDeadlines = async (next: ResearchDeadline[]) => {
    const r = await window.api.research.saveDeadlines(vaultPath, next);
    if (!r.ok) {
      await dlg.alert({ title: '締切の保存に失敗しました', message: r.error, variant: 'error' });
      return;
    }
    await reload();
  };

  const addDeadline = async () => {
    const name = await dlg.prompt({
      title: '締切を追加',
      message: '学会名 / イベント名',
      placeholder: 'NeurIPS 2026',
    });
    if (!name?.trim()) return;
    const due = await dlg.prompt({
      title: '締切日',
      message: 'YYYY-MM-DD 形式',
      placeholder: '2026-05-15',
    });
    if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      await dlg.alert({
        title: '日付形式が不正です',
        message: 'YYYY-MM-DD の形式で入力してください',
        variant: 'error',
      });
      return;
    }
    const next = [
      ...(dashboard?.deadlines.map(({ days: _days, ...d }) => d) ?? []),
      { id: `custom-${Date.now()}`, name: name.trim(), due },
    ];
    await saveDeadlines(next);
  };

  const removeDeadline = async (id: string) => {
    const next = (dashboard?.deadlines ?? [])
      .filter((d) => d.id !== id)
      .map(({ days: _days, ...d }) => d);
    await saveDeadlines(next);
  };

  const totalActivity = dashboard?.activity.reduce((s, a) => s + a.count, 0) ?? 0;

  return (
    <div className="progress-dashboard main-area">
      <div className="progress-header">
        <h2 style={{ margin: 0 }}>研究進捗ダッシュボード</h2>
        <span className="progress-subtitle">
          Vault内の論文・本・授業ノート・締切をまとめて集計
        </span>
      </div>

      {loading && <div className="empty-state">読み込み中…</div>}
      {error && <div className="empty-state">読み込みに失敗しました: {error}</div>}

      {dashboard && (
        <>
          <section className="progress-section">
            <div className="progress-section-header">
              <h3>投稿期限</h3>
              <button onClick={addDeadline}>+ 追加</button>
            </div>
            {dashboard.deadlines.length === 0 ? (
              <div className="empty-state">登録された deadline がありません</div>
            ) : (
              <div className="deadline-list">
                {dashboard.deadlines.map((d) => (
                  <div
                    key={d.id}
                    className={`deadline-item ${d.days < 0 ? 'past' : d.days <= 14 ? 'urgent' : ''}`}
                  >
                    <div className="deadline-days">
                      {d.days < 0 ? `${-d.days} 日前` : d.days === 0 ? '今日' : `あと ${d.days} 日`}
                    </div>
                    <div className="deadline-info">
                      <div className="deadline-name">{d.name}</div>
                      <div className="deadline-due">{d.due}</div>
                    </div>
                    <div className="deadline-actions">
                      {d.url && (
                        <button
                          className="subtle"
                          onClick={() => window.api.materials.openUrl(d.url!)}
                          aria-label="CFP を開く"
                        >
                          ↗
                        </button>
                      )}
                      <button className="subtle" onClick={() => removeDeadline(d.id)} aria-label="削除">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="progress-section">
            <div className="progress-section-header">
              <h3>研究素材</h3>
              <span className="help">
                論文 {dashboard.papers.total} 件 · 本 {dashboard.books.total} 件 · 授業ノート {dashboard.lectures.notes} 件
              </span>
            </div>
            <div className="health-metrics">
              <div className="health-metric">
                <div className="health-metric-value">{dashboard.papers.total}</div>
                <div className="health-metric-label">論文</div>
                <div className="health-metric-help">
                  {statusRows(dashboard.papers.byStatus)
                    .map((r) => `${r.status}: ${r.count}`)
                    .join(' / ') || '未登録'}
                </div>
              </div>
              <div className="health-metric">
                <div className="health-metric-value">{dashboard.books.total}</div>
                <div className="health-metric-label">本</div>
                <div className="health-metric-help">
                  {statusRows(dashboard.books.byStatus)
                    .map((r) => `${r.status}: ${r.count}`)
                    .join(' / ') || '未登録'}
                </div>
              </div>
              <div className="health-metric">
                <div className="health-metric-value">{dashboard.lectures.subjects}</div>
                <div className="health-metric-label">科目</div>
                <div className="health-metric-help">{dashboard.lectures.notes} 件の授業ノート</div>
              </div>
            </div>
          </section>

          <section className="progress-section">
            <div className="progress-section-header">
              <h3>最近の研究ノート</h3>
              <span className="help">クリックで開く</span>
            </div>
            <div className="status-lanes">
              {dashboard.papers.recent.slice(0, 5).map((p) => (
                <button key={p.filePath} className="status-chip" onClick={() => onOpenFile(p.filePath)}>
                  論文: {p.title}
                </button>
              ))}
              {dashboard.books.recent.slice(0, 5).map((b) => (
                <button key={b.filePath} className="status-chip" onClick={() => onOpenFile(b.filePath)}>
                  本: {b.title}
                </button>
              ))}
              {dashboard.lectures.recent.slice(0, 5).map((n) => (
                <button key={n.filePath} className="status-chip" onClick={() => onOpenFile(n.filePath)}>
                  {n.subject}: {n.title}
                </button>
              ))}
            </div>
          </section>

          <section className="progress-section">
            <div className="progress-section-header">
              <h3>90 日間のアクティビティ</h3>
              <span className="help">合計 {totalActivity} 回の作成・更新</span>
            </div>
            <div className="activity-heatmap" role="img" aria-label="90 日のアクティビティヒートマップ">
              {dashboard.activity.map((a) => (
                <div
                  key={a.date}
                  className="activity-cell"
                  style={{ background: heatColor(a.count) }}
                  title={`${a.date}: ${a.count} 件`}
                />
              ))}
            </div>
          </section>

          <section className="progress-section">
            <div className="progress-section-header">
              <h3>Wiki ヘルス</h3>
              <span className="help">Vaultスキャンから算出</span>
            </div>
            <div className="health-metrics">
              <div className="health-metric">
                <div className="health-metric-value">{dashboard.wikiHealth.orphanCount}</div>
                <div className="health-metric-label">孤立ノート</div>
                <div className="health-metric-help">[[wikilink]] がないノート</div>
              </div>
              <div className="health-metric">
                <div className="health-metric-value">{dashboard.wikiHealth.tagCount}</div>
                <div className="health-metric-label">ユニークタグ</div>
                <div className="health-metric-help">
                  {dashboard.wikiHealth.topTags.map((t) => `${t.tag}(${t.count})`).join(', ') || 'タグなし'}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
      {dialogElement}
    </div>
  );
}
