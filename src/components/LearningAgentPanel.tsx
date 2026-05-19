import { useState } from 'react';
import type { LearningCoachResult, LearningSourceKind } from '../types';
import { useDialog } from './common/Dialog';

type Props = {
  filePath: string;
  kind?: LearningSourceKind;
  label?: string;
  onSaved?: () => void;
};

const KIND_LABEL: Record<LearningSourceKind, string> = {
  book: '本',
  paper: '論文',
  lecture: '授業',
};

function ResultView({ result }: { result: LearningCoachResult }) {
  return (
    <div className="learning-agent-result">
      <section>
        <h4>診断</h4>
        <p>{result.diagnosis}</p>
      </section>
      <section>
        <h4>重要概念</h4>
        <ul>
          {result.keyConcepts.map((c) => (
            <li key={`${c.term}-${c.explanation}`}>
              <strong>{c.term}</strong>
              {c.confidence ? <span className="learning-confidence"> {c.confidence}</span> : null}
              <br />
              {c.explanation}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>誤解しやすい点</h4>
        <ul>{result.misconceptions.map((m) => <li key={m}>{m}</li>)}</ul>
      </section>
      <section>
        <h4>理解確認クイズ</h4>
        <ol>
          {result.quiz.map((q) => (
            <li key={q.question}>
              {q.question}
              <div className="learning-answer">答え: {q.answer}</div>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h4>次にやること</h4>
        <ul>{result.nextActions.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
      <section>
        <h4>作るとよい関連ノート</h4>
        <ul>
          {result.suggestedNotes.map((n) => (
            <li key={n.title}>
              <strong>{n.title}</strong>: {n.reason}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LearningAgentPanel({ filePath, kind, label, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LearningCoachResult | null>(null);
  const [dlg, dialogElement] = useDialog();

  const title = kind ? `${KIND_LABEL[kind]}向けAI理解支援` : 'AI理解支援';

  const run = async (save: boolean) => {
    setBusy(true);
    const r = save
      ? await window.api.ai.learningCoachAndSave(filePath, kind)
      : await window.api.ai.learningCoach(filePath, kind);
    setBusy(false);
    if (!r.ok) {
      await dlg.alert({
        title: 'AI理解支援に失敗しました',
        message: r.error,
        variant: 'error',
      });
      return;
    }
    setResult(r.result);
    setOpen(true);
    if (save) {
      onSaved?.();
      await dlg.alert({
        title: 'ノートへ保存しました',
        message: 'AI理解支援ブロックをMarkdownへ反映しました。',
        variant: 'success',
      });
    }
  };

  return (
    <>
      <button
        type="button"
        className="subtle learning-agent-trigger"
        onClick={() => run(false)}
        disabled={busy}
        title={title}
      >
        {busy ? '分析中…' : label ?? 'AI理解'}
      </button>
      {open && result && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal learning-agent-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{title}</h3>
            <ResultView result={result} />
            <div className="modal-actions">
              <button onClick={() => setOpen(false)}>閉じる</button>
              <button className="primary" onClick={() => run(true)} disabled={busy}>
                {busy ? '保存中…' : 'ノートへ保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {dialogElement}
    </>
  );
}
