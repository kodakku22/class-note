// AI compile panel for Wiki generation.
// Surfaces scope picker, schema editor, and the compile trigger.
// Calls window.api.wiki.compile, which routes through the AI Provider.
import { useEffect, useState } from 'react';
import { useDialog } from './common/Dialog';

type Props = {
  vaultPath: string;
  onComplete?: () => void;
};

// Map compile stages to human-readable Japanese labels for the progress bar.
const STAGE_LABELS: Record<string, string> = {
  collecting: 'ノートを収集中…',
  prompting: '選択中AIにプロンプト送信中…',
  streaming: '選択中AIが応答中…',
  writing: 'Wiki ページを書き出し中…',
  done: '完了',
};

export function WikiCompilePanel({ vaultPath, onComplete }: Props) {
  const [scope, setScope] = useState<string>('all');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [schema, setSchema] = useState('');
  const [editingSchema, setEditingSchema] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ stage: string; message?: string; bytes?: number } | null>(
    null
  );
  const [dlg, dialogElement] = useDialog();

  useEffect(() => {
    window.api.vault.listSubjects(vaultPath).then(setSubjects);
    window.api.wiki.getSchema(vaultPath).then(setSchema);
  }, [vaultPath]);

  // Subscribe to streaming progress events while a compile is in flight.
  useEffect(() => {
    const off = window.api.wiki.onCompileProgress((p) => setProgress(p));
    return off;
  }, []);

  const compile = async (overwriteManuallyEdited = false) => {
    setCompiling(true);
    setResult(null);
    setProgress({ stage: 'collecting', message: STAGE_LABELS.collecting });
    try {
      const r = await window.api.wiki.compile(vaultPath, scope, overwriteManuallyEdited);
      if (r.ok) {
        setResult(`✅ ${r.pageCount ?? 0} ページの Wiki を生成しました`);
        onComplete?.();
        return;
      }
      // Manual-edit conflict: ask the user whether to clobber.
      if (r.conflict && r.manuallyEdited && r.manuallyEdited.length > 0) {
        const list = r.manuallyEdited.slice(0, 10).join('\n');
        const more =
          r.manuallyEdited.length > 10
            ? `\n…他 ${r.manuallyEdited.length - 10} ページ`
            : '';
        const ok = await dlg.confirm({
          title: '手動編集の可能性があります',
          message: `${r.message ?? ''}\n\n${list}${more}\n\n上書きしますか？`,
          okLabel: '上書きする',
          cancelLabel: 'キャンセル',
          destructive: true,
        });
        if (ok) {
          // Re-run with the override flag. Recursive but bounded (1 level).
          setCompiling(false);
          setProgress(null);
          await compile(true);
          return;
        }
        setResult('⚠️ コンパイルをキャンセルしました');
        return;
      }
      setResult(`❌ ${r.error ?? '不明なエラー'}`);
    } finally {
      setCompiling(false);
      setProgress(null);
    }
  };

  const persistSchema = async () => {
    await window.api.wiki.setSchema(vaultPath, schema);
  };

  return (
    <div className="wiki-compile-panel">
      <h3 style={{ margin: '0 0 8px' }}>🤖 Wiki をコンパイル</h3>
      <p className="help">
        ノート・書籍メモ・Memos を選択中AIが整理し、トピックページと INDEX を Wiki に出力します。
      </p>

      <div className="modal-section">
        <label>対象範囲</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={compiling}>
          <option value="all">すべて (全科目 + 読書 + メモ)</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s} のみ
            </option>
          ))}
        </select>
      </div>

      <div className="modal-section">
        <label>
          生成ルール (WIKI_SCHEMA.md)
          <button
            className="subtle"
            onClick={() => setEditingSchema((e) => !e)}
            style={{ marginLeft: 8 }}
            disabled={compiling}
          >
            {editingSchema ? '折りたたむ' : '編集'}
          </button>
        </label>
        {editingSchema && (
          <textarea
            className="schema-editor"
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            onBlur={persistSchema}
            rows={12}
            disabled={compiling}
          />
        )}
      </div>

      {compiling && progress && (
        <div className="compile-progress" role="status" aria-live="polite">
          <div className="compile-progress-stage">
            <span className="compile-progress-spinner">⏳</span>
            <span>{progress.message || STAGE_LABELS[progress.stage] || progress.stage}</span>
          </div>
          <div className="compile-progress-bar">
            <div
              className={`compile-progress-fill stage-${progress.stage}`}
              style={{
                width:
                  progress.stage === 'collecting'
                    ? '15%'
                    : progress.stage === 'prompting'
                      ? '30%'
                      : progress.stage === 'streaming'
                        ? '70%'
                        : progress.stage === 'writing'
                          ? '92%'
                          : '100%',
              }}
            />
          </div>
        </div>
      )}

      {result && <div className="compile-result">{result}</div>}

      <div className="modal-actions">
        <button className="primary" onClick={() => compile(false)} disabled={compiling}>
          {compiling ? '⏳ 生成中...' : '🤖 Wiki をコンパイル'}
        </button>
      </div>
      {dialogElement}
    </div>
  );
}
