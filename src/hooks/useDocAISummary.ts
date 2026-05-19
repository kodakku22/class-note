// useDocAISummary — owns the smartSummary flow + clipboard copy. Extracted
// from DocAIPanel.tsx.
import { useCallback, useState } from 'react';
import type { DocAISummaryResult } from '../types';

export type SummaryMode = 'keypoints' | 'exam-prep' | 'one-liner';

export function useDocAISummary(filePath: string) {
  const [summary, setSummary] = useState<DocAISummaryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSummary = useCallback(
    async (mode: SummaryMode = 'keypoints') => {
      if (busy) return;
      setError(null);
      setSummary(null);
      setBusy(true);
      try {
        const r = await window.api.docai.summarize(filePath, { mode });
        if (r.ok && r.result) setSummary(r.result);
        else setError(r.error ?? '要約に失敗しました');
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(false);
      }
    },
    [filePath, busy]
  );

  const copySummary = useCallback(() => {
    if (!summary) return;
    const text = [
      `# ${summary.headline}`,
      '',
      ...summary.keyPoints.map((kp) => `- (${kp.importance}) ${kp.point} — ${kp.citation.section}`),
      '',
      summary.structure,
      '',
      ...summary.actionItems.map((a) => `- [ ] ${a}`),
    ].join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }, [summary]);

  const reset = useCallback(() => {
    setSummary(null);
    setError(null);
  }, []);

  return { summary, busy, error, runSummary, copySummary, reset };
}
