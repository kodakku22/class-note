// Settings → Skills 連携
//
// Shows install instructions, detection status, and one-click "redetect"
// after the user installs the Obsidian Skills CLI. Intentionally explicit
// about the two install commands (matches the user's spec):
//
//   npm install -g @obsidian/skills-cli
//   obsidian-skills init
//
// And the additional package for Web clipping:
//
//   npm install defuddle
//
// Defuddle is bundled by ClassNotes itself, but we surface the command so
// power users who want to invoke it via the Obsidian CLI workflow have
// the reference.
import { useEffect, useState } from 'react';

type InteropReport =
  | Awaited<ReturnType<typeof window.api.skills.interopReport>>
  | null;

export function SkillsPanel({ vaultPath }: { vaultPath: string }) {
  const [status, setStatus] = useState<
    | { kind: 'unknown' }
    | { kind: 'detected'; path: string; version?: string }
    | { kind: 'missing' }
  >({ kind: 'unknown' });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interop, setInterop] = useState<InteropReport>(null);
  const [interopError, setInteropError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.skills.detectObsidian().then((r) => {
      if (cancelled) return;
      if (r.ok && r.path) setStatus({ kind: 'detected', path: r.path, version: r.version });
      else setStatus({ kind: 'missing' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInterop(null);
    setInteropError(null);
    if (!window.api.skills.interopReport) {
      setInteropError('互換性チェックAPIが利用できません');
      return () => {
        cancelled = true;
      };
    }
    window.api.skills.interopReport(vaultPath).then((r) => {
      if (cancelled) return;
      if (r.ok) setInterop(r);
      else setInteropError(r.error ?? '互換性チェックに失敗しました');
    });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  const redetect = async () => {
    setStatus({ kind: 'unknown' });
    const r = await window.api.skills.redetectObsidian();
    if (r.ok && r.path) setStatus({ kind: 'detected', path: r.path, version: r.version });
    else setStatus({ kind: 'missing' });
  };

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const r = await window.api.skills.analyzeWithObsidianCLI(vaultPath);
      if (r.ok) setAnalysis(r.output ?? '(空)');
      else setError(r.error ?? '失敗');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="modal-section skills-panel">
      <label>Obsidian Skills 連携</label>
      <p className="help">
        Obsidian Skills (公式) を CLI 経由で連携できます。プロンプト内で
        「Obsidian Skills を使って〜」と指示すると、AI が下記スキルを呼出します。
      </p>

      <div className="skills-status">
        {status.kind === 'unknown' && <span>🔍 検出中…</span>}
        {status.kind === 'detected' && (
          <span className="skills-detected">
            ✓ 検出済み: <code>{status.path}</code>
            {status.version ? ` (v${status.version})` : ''}
          </span>
        )}
        {status.kind === 'missing' && <span className="skills-missing">⚠️ 未検出</span>}
        <button onClick={redetect}>🔄 再検出</button>
      </div>

      <details className="skills-install">
        <summary>📥 インストール手順 (CLI 2 行 + Defuddle)</summary>
        <div className="skills-install-body">
          <p>1. Obsidian Skills の本体をグローバルインストール:</p>
          <pre>
            <code>{`npm install -g @obsidian/skills-cli
obsidian-skills init`}</code>
          </pre>
          <p>
            2. Web ページ取込用パッケージ (ClassNotes は同梱済みですが、Obsidian
            CLI 単独でも使う場合):
          </p>
          <pre>
            <code>npm install defuddle</code>
          </pre>
          <p>
            3. Obsidian の設定で <code>Settings → Advanced → CLI</code> を On
            にして、Obsidian を再起動してください。これで CLI 経由の Vault
            分析が利用可能になります。
          </p>
          <p className="help">
            Obsidian Skills が無くても、ClassNotes 内蔵の AI Agent
            (要約・タグ付け・Markdown 整形・Canvas 生成・Vault 分析) は
            利用できます。Obsidian Skills を有効化すると、より高度な
            分析と Obsidian の plugin 経済圏との連携が可能になります。
          </p>
        </div>
      </details>

      <details className="skills-features" open>
        <summary>🔗 Zotero / Obsidian 互換性チェック</summary>
        {interopError && (
          <p className="help" style={{ color: 'var(--danger)' }}>
            ⚠️ {interopError}
          </p>
        )}
        {!interop && !interopError && <p className="help">Vault を検査中…</p>}
        {interop?.ok && (
          <div className="skills-interop-report">
            <div className="skills-status">
              <span className={interop.obsidian.warnings.length === 0 ? 'skills-detected' : 'skills-missing'}>
                Obsidian: {interop.obsidian.hasConfigDir ? '.obsidianあり' : '.obsidianなし'} / Markdown {interop.obsidian.markdownFiles}件 / wikilink {interop.obsidian.wikilinkCount}件
              </span>
              <span className={interop.zotero.warnings.length === 0 ? 'skills-detected' : 'skills-missing'}>
                Zotero: refs.bib {interop.zotero.hasRefsBib ? 'あり' : 'なし'} / Paper {interop.zotero.paperFiles}件 / bibkey {interop.zotero.papersWithBibkey}件
              </span>
            </div>
            <ul style={{ fontSize: 12, lineHeight: 1.7, paddingLeft: 20 }}>
              {interop.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {(interop.repairActions?.length ?? 0) > 0 && (
              <details className="skills-repair-plan" open>
                <summary>修復候補 ({interop.repairActions.length}件・dry-run)</summary>
                <ul style={{ fontSize: 12, lineHeight: 1.7, paddingLeft: 20 }}>
                  {interop.repairActions.slice(0, 8).map((action) => (
                    <li key={action.id}>
                      <strong>{action.title}</strong>
                      {action.relPath && <> — <code>{action.relPath}</code></>}
                      <br />
                      <span className="help">{action.description}</span>
                    </li>
                  ))}
                </ul>
                {interop.repairActions.length > 8 && (
                  <p className="help">他 {interop.repairActions.length - 8} 件はレポート上で省略しています。</p>
                )}
              </details>
            )}
            {interop.zotero.duplicateBibkeys.length > 0 && (
              <p className="help">
                重複bibkey: <code>{interop.zotero.duplicateBibkeys.join(', ')}</code>
              </p>
            )}
          </div>
        )}
      </details>

      <details className="skills-features">
        <summary>📚 利用可能な 5 つのスキル</summary>
        <ul style={{ fontSize: 12, lineHeight: 1.7, paddingLeft: 20 }}>
          <li>
            <strong>① ノートを正しく作る</strong> — AI がコールアウト・wikilink・
            frontmatter を整える ( ClassNotes: 右クリック → AI で Markdown 整形 )
          </li>
          <li>
            <strong>② Web ページをきれいに取込む</strong> — Defuddle で広告・
            ナビを除去 ( ClassNotes: コマンドパレット → Web をクリップ )
          </li>
          <li>
            <strong>③ ノートをデータベース化</strong> — Bases ライクの
            ダッシュボード ( ClassNotes: DatabaseView コンポーネント )
          </li>
          <li>
            <strong>④ Canvas で図を作る</strong> — テキストからマインドマップ
            ( ClassNotes: 右クリック → AI で Canvas 生成 )
          </li>
          <li>
            <strong>⑤ Vault を分析</strong> — 孤立ノート + タグ頻度 + 改善提案
            ( ClassNotes: ヘルスチェック / Obsidian CLI )
          </li>
        </ul>
      </details>

      {status.kind === 'detected' && (
        <div className="skills-analyze">
          <button onClick={analyze} disabled={analyzing}>
            {analyzing ? '⏳ 分析中…' : '🧪 Obsidian CLI で Vault 分析を実行'}
          </button>
          {error && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              ⚠️ {error}
            </div>
          )}
          {analysis && (
            <pre className="skills-analysis-output">{analysis.slice(0, 3000)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
