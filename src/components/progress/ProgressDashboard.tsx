import { useEffect, useMemo, useState } from 'react';
import type { ResearchDashboard, ResearchDeadline } from '../../types';
import { log } from '../../utils/logger';
import { useDialog } from '../common/Dialog';

type Props = {
  vaultPath: string;
  reloadKey?: number;
  onOpenFile: (filePath: string) => void;
};

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

          {/*
           * HANDOFF "This week" sparkbar dashboard (patterns.html L709-736).
           * Five rows, colors assigned in chart-palette order
           * (teal → blue → purple → yellow → pink) per the canonical
           * "assigned in that order, no reordering" rule.
           *
           * Each row derives its progress fraction from existing
           * dashboard.* fields so the card stays in sync with the rest of
           * the data without any new IPC.
           */}
          <section className="progress-section">
            <div className="progress-section-header">
              <h3>今週の進捗</h3>
              <span className="help">主要指標の達成度</span>
            </div>
            <div className="progress-card-l">
              {(() => {
                const totalPapers = dashboard.papers.total;
                const reviewedPapers = ['read', 'cited', 'skimmed'].reduce(
                  (sum, k) => sum + (dashboard.papers.byStatus[k] ?? 0),
                  0
                );
                const totalBooks = dashboard.books.total;
                const activeBooks = ['reading', 'done'].reduce(
                  (sum, k) => sum + (dashboard.books.byStatus[k] ?? 0),
                  0
                );
                const totalDeadlines = dashboard.deadlines.length;
                const onTrackDeadlines = dashboard.deadlines.filter((d) => d.days >= 7).length;
                // Wiki health heuristic: 100 if zero orphans, otherwise
                // penalise 5 points per orphan, floored at 0. Mirrors the
                // HANDOFF mock's '68%' style display.
                const wikiHealth = Math.max(
                  0,
                  100 - dashboard.wikiHealth.orphanCount * 5
                );
                const recent7 = dashboard.activity
                  .slice(-7)
                  .reduce((sum, a) => sum + a.count, 0);
                // 50 events/week is a healthy ceiling for an individual
                // researcher; cap the bar visually at 100%.
                const recentPct = Math.min(100, (recent7 / 50) * 100);

                const rows: Array<{
                  color: string;
                  label: string;
                  pct: number;
                  val: string;
                }> = [
                  {
                    color: 'var(--chart-teal)',
                    label: '論文の精読',
                    pct: totalPapers ? (reviewedPapers / totalPapers) * 100 : 0,
                    val: `${reviewedPapers} / ${totalPapers}`,
                  },
                  {
                    color: 'var(--chart-blue)',
                    label: '書籍の読書',
                    pct: totalBooks ? (activeBooks / totalBooks) * 100 : 0,
                    val: `${activeBooks} / ${totalBooks}`,
                  },
                  {
                    color: 'var(--chart-purple)',
                    label: 'Wiki 健全度',
                    pct: wikiHealth,
                    val: `${Math.round(wikiHealth)} %`,
                  },
                  {
                    color: 'var(--chart-yellow)',
                    label: '締切に余裕',
                    pct: totalDeadlines ? (onTrackDeadlines / totalDeadlines) * 100 : 0,
                    val: `${onTrackDeadlines} / ${totalDeadlines}`,
                  },
                  {
                    color: 'var(--chart-pink)',
                    label: '直近 7 日の活動',
                    pct: recentPct,
                    val: `${recent7} 件`,
                  },
                ];

                return rows.map((r) => (
                  <div className="progress-row-l" key={r.label}>
                    <span className="label">
                      <span
                        className="chart-dot"
                        style={{ background: r.color }}
                        aria-hidden
                      />
                      {r.label}
                    </span>
                    <div className="track" role="progressbar" aria-valuenow={Math.round(r.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={r.label}>
                      <div
                        className="fill"
                        style={{ width: `${r.pct}%`, background: r.color }}
                      />
                    </div>
                    <span className="val">{r.val}</span>
                  </div>
                ));
              })()}
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
