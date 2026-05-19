// Wiki page list + INDEX viewer. Empty state surfaces the "compile" CTA
// (Phase 3 / 4 / 5 actions are layered on via the WikiCompilePanel and
// the health-check button below).
import { useEffect, useState, useCallback } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { WikiCompilePanel } from './WikiCompilePanel';

type WikiPage = { name: string; filePath: string; mtime: number };

type Props = {
  vaultPath: string;
  onJumpToWikilink: (name: string) => void;
  onOpenFile: (filePath: string) => void;
};

export function WikiView({ vaultPath, onJumpToWikilink, onOpenFile }: Props) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [index, setIndex] = useState<string | null>(null);
  const [showCompile, setShowCompile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [list, idx] = await Promise.all([
      window.api.wiki.list(vaultPath),
      window.api.wiki.readIndex(vaultPath),
    ]);
    setPages(list);
    setIndex(idx);
  }, [vaultPath]);

  useEffect(() => {
    reload();
  }, [reload]);

  const importFromQA = async () => {
    setImporting(true);
    setInfo(null);
    try {
      const r = await window.api.wiki.importFromQALogs(vaultPath);
      if (r.ok) {
        setInfo(
          r.imported.length === 0
            ? 'インポート対象の QA ログがありませんでした'
            : `✅ ${r.imported.length} 科目分の QA ログを Wiki に取り込みました`
        );
        reload();
      } else {
        setInfo('❌ インポート失敗');
      }
    } finally {
      setImporting(false);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    setInfo(null);
    try {
      const r = await window.api.wiki.healthCheck(vaultPath);
      if (r.ok && r.reportPath) {
        setInfo(`✅ ヘルスチェックレポートを生成しました`);
        onOpenFile(r.reportPath);
      } else {
        setInfo(`❌ ${r.error ?? '不明なエラー'}`);
      }
    } finally {
      setChecking(false);
    }
  };

  const isEmpty = pages.length === 0 && !index;

  return (
    <div className="main-area wiki-view">
      <div className="wiki-header">
        <div>
          <h2 style={{ margin: 0 }}>🧠 Wiki</h2>
          <span className="wiki-subtitle">AI が整理した知識ベース</span>
        </div>
        <div className="wiki-header-actions">
          <button className="subtle" onClick={() => setShowCompile((v) => !v)}>
            🤖 {showCompile ? '閉じる' : 'Wiki をコンパイル'}
          </button>
          <button className="subtle" onClick={importFromQA} disabled={importing}>
            {importing ? '⏳ 取込中...' : '💬 QA ログから取込'}
          </button>
          <button className="subtle" onClick={runHealthCheck} disabled={checking}>
            {checking ? '⏳ チェック中...' : '🔍 ヘルスチェック'}
          </button>
        </div>
      </div>

      {info && <div className="wiki-info">{info}</div>}

      {showCompile && (
        <WikiCompilePanel
          vaultPath={vaultPath}
          onComplete={() => {
            reload();
          }}
        />
      )}

      {isEmpty ? (
        <div className="empty-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>🧠</div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Wiki がまだありません</div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginBottom: 16,
                maxWidth: 420,
                margin: '0 auto 16px',
                lineHeight: 1.6,
              }}
            >
              「Wiki をコンパイル」ボタンでノート・書籍メモ・Memos から AI が
              自動的に整理します。
            </div>
            <button className="primary" onClick={() => setShowCompile(true)}>
              🤖 Wiki をコンパイル
            </button>
          </div>
        </div>
      ) : (
        <div className="wiki-body">
          {index && (
            <div className="wiki-index markdown">
              <MarkdownRenderer
                content={index}
                onJumpToWikilink={onJumpToWikilink}
                onJumpToFile={onOpenFile}
              />
            </div>
          )}
          {pages.length > 0 && (
            <div className="wiki-pages">
              <div className="section-label">ページ</div>
              {pages.map((p) => (
                <button
                  key={p.filePath}
                  className="wiki-page-item"
                  onClick={() => onOpenFile(p.filePath)}
                >
                  <span className="wiki-page-icon">📄</span>
                  <span className="wiki-page-name">{p.name.replace(/\.md$/, '')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
