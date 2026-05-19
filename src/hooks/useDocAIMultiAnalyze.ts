// useDocAIMultiAnalyze — owns the multi-document analysis flow.
// Extracted from DocAIPanel.tsx.
import { useCallback, useState } from 'react';
import type { MultiAnalysisData } from '../components/ai/MultiAnalyzeCard';

export type MultiAnalyzeMode = 'compare' | 'synthesize' | 'presentation';

export function useDocAIMultiAnalyze() {
  const [analysis, setAnalysis] = useState<MultiAnalysisData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runMultiAnalyze = useCallback(
    async (paths: string[], mode: MultiAnalyzeMode = 'compare') => {
      if (busy) return;
      setError(null);
      setAnalysis(null);
      setBusy(true);
      try {
        const r = await window.api.docai.multiAnalyze(paths, mode);
        if (r.ok && r.result) setAnalysis(r.result as MultiAnalysisData);
        else setError(r.error ?? '複数文書分析に失敗しました');
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return { analysis, busy, error, runMultiAnalyze, reset };
}
