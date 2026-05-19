// raw → wiki → outputs ループの可視化ウィジェット。
//
// Karpathy 式 Second Brain の核は「素材を書く」「整理する」「振り返る」の
// 3 ステップ。これらの件数を一目で比較することで、ループの偏りに気づける:
//   - raw だけ多くて wiki が少ない → 整理が追いついていない
//   - wiki があるが outputs がない → 振り返り不足
//
// `vault:listSubjects` + `wiki:list` + `outputs:list` を集計して表示。
import { useEffect, useState } from 'react';

type Stats = {
  rawCount: number;
  wikiCount: number;
  outputsCount: number;
};

type Props = {
  vaultPath: string;
  reloadKey?: number;
};

export function LearningProgress({ vaultPath, reloadKey }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subjects, wikis, outputs] = await Promise.all([
          window.api.vault.listSubjects(vaultPath),
          window.api.wiki.list(vaultPath),
          window.api.outputs.list(vaultPath),
        ]);
        // Aggregate raw note count across subjects in parallel.
        const rawCounts = await Promise.all(
          subjects.map((s) =>
            window.api.vault
              .listFiles(vaultPath, s)
              .then((r) => r.notes.length)
              .catch(() => 0)
          )
        );
        if (cancelled) return;
        setStats({
          rawCount: rawCounts.reduce((a, b) => a + b, 0),
          wikiCount: wikis.filter((w) => w.name !== 'WIKI_SCHEMA.md').length,
          outputsCount: outputs.length,
        });
      } catch {
        // ignore — widget is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPath, reloadKey]);

  if (!stats) return null;

  const total = Math.max(1, stats.rawCount + stats.wikiCount + stats.outputsCount);
  const segs = [
    { key: 'raw', label: '素材', icon: '📝', count: stats.rawCount, color: '#4a9eff' },
    { key: 'wiki', label: 'Wiki', icon: '🧠', count: stats.wikiCount, color: '#7b5cff' },
    { key: 'outputs', label: 'Outputs', icon: '📤', count: stats.outputsCount, color: '#e76f51' },
  ];

  return (
    <div className="learning-progress" role="region" aria-label="学習ループの進捗">
      <div className="learning-progress-title">📈 学習ループ</div>
      <div className="learning-progress-bar" aria-hidden>
        {segs.map((s) => (
          <div
            key={s.key}
            className="learning-progress-seg"
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="learning-progress-legend">
        {segs.map((s) => (
          <div key={s.key} className="learning-progress-stat">
            <span aria-hidden>{s.icon}</span>
            <span className="learning-progress-count">{s.count}</span>
            <span className="learning-progress-label">{s.label}</span>
          </div>
        ))}
      </div>
      {stats.rawCount > 0 && stats.wikiCount === 0 && (
        <div className="learning-progress-hint">
          💡 ノートが {stats.rawCount} 件あります。Wiki にコンパイルしてみませんか？
        </div>
      )}
      {stats.wikiCount >= 3 && stats.outputsCount === 0 && (
        <div className="learning-progress-hint">
          💡 Wiki が {stats.wikiCount} ページあります。ヘルスチェックで盲点を見つけましょう。
        </div>
      )}
    </div>
  );
}
