// DocAIPanel — right-side AI assistant for the currently-open document.
//
// Listens to the docai:* streaming events and renders:
//   - quick actions (⚡要約 / 📝試験対策 / 📊比較 / ✉生成)
//   - turn-by-turn Q&A history with [出典 N] citations
//   - SummaryCard / MultiAnalyzeCard when the matching action runs
//   - suggested follow-up questions
//   - multi-doc mode chips when extra docs are attached via 📎+
//   - ContentGenerator modal for ✉生成
//
// Mirrors the streaming pattern from QAChat.tsx so error handling and
// unsubscribe semantics stay consistent.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocAICitation } from '../../types';
import { CitationBadge, type CitationJumpPayload } from './CitationBadge';
import { SummaryCard } from './SummaryCard';
import { MultiDocPicker } from './MultiDocPicker';
import { ContentGenerator } from './ContentGenerator';
import { MultiAnalyzeCard } from './MultiAnalyzeCard';
import { useDocAIStream } from '../../hooks/useDocAIStream';
import { useDocAISummary } from '../../hooks/useDocAISummary';
import { useDocAIMultiAnalyze } from '../../hooks/useDocAIMultiAnalyze';
import { t } from '../../i18n/strings';

type Props = {
  filePath: string;
  /** Vault root path. Required for the MultiDocPicker. */
  vaultPath?: string;
  onClose: () => void;
  onJumpToSource?: (payload: CitationJumpPayload) => void;
};

function fileNameOf(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function renderAnswerWithCitations(
  text: string,
  citations: DocAICitation[],
  filePathBySource: Record<string, string>,
  onJump?: (payload: CitationJumpPayload) => void
) {
  // Replace "[出典 N]" markers (also accepts half-width [出典: p.N]) with badges.
  const parts: Array<string | { id: number }> = [];
  const re = /\[出典\s*[: ]?\s*(\d+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push({ id: Number(m[1]) });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      <span key={i}>{p}</span>
    ) : (
      <CitationBadge
        key={i}
        id={p.id}
        citations={citations}
        filePathBySource={filePathBySource}
        onJump={onJump}
      />
    )
  );
}

export function DocAIPanel({ filePath, vaultPath, onClose, onJumpToSource }: Props) {
  const [input, setInput] = useState('');
  const [extraDocs, setExtraDocs] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stream = useDocAIStream({ filePath });
  const summaryFlow = useDocAISummary(filePath);
  const analyzeFlow = useDocAIMultiAnalyze();

  const filePathBySource = useMemo(() => {
    const out: Record<string, string> = { [fileNameOf(filePath)]: filePath };
    for (const ed of extraDocs) out[fileNameOf(ed)] = ed;
    return out;
  }, [filePath, extraDocs]);
  const allActivePaths = useMemo(() => [filePath, ...extraDocs], [filePath, extraDocs]);
  const isMultiDoc = extraDocs.length > 0;

  // Reset summary/analyze + extraDocs when the target file changes.
  const resetSummary = summaryFlow.reset;
  const resetAnalysis = analyzeFlow.reset;

  useEffect(() => {
    resetSummary();
    resetAnalysis();
    setExtraDocs([]);
  }, [filePath, resetSummary, resetAnalysis]);

  // Auto-scroll on streaming updates.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream.turns, stream.streamingText]);

  const ask = useCallback(
    async (question: string) => {
      setInput('');
      await stream.ask(question, { isMultiDoc, allActivePaths });
    },
    [stream, isMultiDoc, allActivePaths]
  );

  const runSummary = useCallback(
    async (mode: 'keypoints' | 'exam-prep' | 'one-liner' = 'keypoints') => {
      await summaryFlow.runSummary(mode);
    },
    [summaryFlow]
  );

  const runMultiAnalyze = useCallback(
    async (mode: 'compare' | 'synthesize' | 'presentation') => {
      if (!isMultiDoc) return;
      await analyzeFlow.runMultiAnalyze(allActivePaths, mode);
    },
    [isMultiDoc, allActivePaths, analyzeFlow]
  );

  const removeExtraDoc = useCallback((absPath: string) => {
    setExtraDocs((prev) => prev.filter((p) => p !== absPath));
  }, []);

  const handlePickerConfirm = useCallback(
    (paths: string[]) => {
      const filtered = paths.filter((p) => p !== filePath);
      setExtraDocs(filtered);
      setPickerOpen(false);
    },
    [filePath]
  );

  // Backwards-compat aliases for the JSX below (kept short to minimise diff).
  const turns = stream.turns;
  const streaming = stream.streaming;
  const streamingText = stream.streamingText;
  const streamingCitations = stream.streamingCitations;
  const followUps = stream.followUps;
  const summary = summaryFlow.summary;
  const analysis = analyzeFlow.analysis;
  const busyMode: 'idle' | 'asking' | 'summarizing' | 'analyzing' =
    stream.streaming ? 'asking' : summaryFlow.busy ? 'summarizing' : analyzeFlow.busy ? 'analyzing' : 'idle';
  const error = stream.error ?? summaryFlow.error ?? analyzeFlow.error;
  const copySummary = summaryFlow.copySummary;

  return (
    <aside className="docai-panel" role="complementary" aria-label="AI アシスタント">
      <header className="docai-panel-header">
        <span className="docai-panel-title">{t('docai.panel.title')}</span>
        <button
          type="button"
          className="docai-panel-close"
          onClick={onClose}
          aria-label={t('docai.panel.close')}
        >
          ✕
        </button>
      </header>

      <div className="docai-panel-file">
        <span className="docai-panel-file-icon">📄</span>
        <span className="docai-panel-file-name">{fileNameOf(filePath)}</span>
        {vaultPath && (
          <button
            type="button"
            className="docai-panel-file-add"
            onClick={() => setPickerOpen(true)}
            title="他の文書を追加 (複数文書モード)"
            aria-label="複数文書を選択"
          >
            📎+
          </button>
        )}
      </div>

      {extraDocs.length > 0 && (
        <div className="docai-panel-extra-docs" aria-label="追加された文書">
          {extraDocs.map((p) => (
            <span key={p} className="docai-panel-doc-chip">
              <span className="docai-panel-doc-chip-name">{fileNameOf(p)}</span>
              <button
                type="button"
                className="docai-panel-doc-chip-remove"
                onClick={() => removeExtraDoc(p)}
                aria-label={`${fileNameOf(p)} を外す`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="docai-panel-quick-actions">
        <button
          type="button"
          className="docai-panel-action"
          onClick={() => runSummary('keypoints')}
          disabled={busyMode !== 'idle' || isMultiDoc}
          title={isMultiDoc ? '単一文書モードのみ利用可能' : ''}
        >
          ⚡ 要約
        </button>
        <button
          type="button"
          className="docai-panel-action"
          onClick={() => runSummary('exam-prep')}
          disabled={busyMode !== 'idle' || isMultiDoc}
        >
          📝 試験対策
        </button>
        <button
          type="button"
          className="docai-panel-action"
          onClick={() => runSummary('one-liner')}
          disabled={busyMode !== 'idle' || isMultiDoc}
        >
          📌 1行要約
        </button>
        <button
          type="button"
          className="docai-panel-action"
          onClick={() => runMultiAnalyze('compare')}
          disabled={busyMode !== 'idle' || !isMultiDoc}
          title={isMultiDoc ? '' : '📎+ で2つ以上の文書を選択してください'}
        >
          📊 比較
        </button>
        <button
          type="button"
          className="docai-panel-action"
          onClick={() => setGeneratorOpen(true)}
          disabled={busyMode !== 'idle'}
        >
          ✉ 生成
        </button>
      </div>

      <div className="docai-panel-scroll" ref={scrollRef}>
        {error && (
          <div className="docai-panel-error" role="alert">
            ⚠️ {error}
          </div>
        )}

        {summary && (
          <SummaryCard
            summary={summary}
            filePathBySource={filePathBySource}
            onJump={onJumpToSource}
            onCopy={copySummary}
            onInsertIntoNote={async () => {
              try {
                const raw = await window.api.vault.readNote(filePath);
                const sumMd = [
                  '<!-- ai:docai-summary:start -->',
                  '## AI 要約',
                  '',
                  `**${summary.headline}**`,
                  '',
                  ...summary.keyPoints.map(
                    (kp) => `- (${kp.importance}) ${kp.point} — ${kp.citation.section}`
                  ),
                  '',
                  summary.structure,
                  '',
                  ...summary.actionItems.map((a) => `- [ ] ${a}`),
                  '<!-- ai:docai-summary:end -->',
                ].join('\n');
                // Replace prior summary block or prepend new one (mirrors existing
                // `ai:summary:*` convention from agents.ts).
                const stripped = raw.replace(
                  /<!-- ai:docai-summary:start -->[\s\S]*?<!-- ai:docai-summary:end -->\n?/,
                  ''
                );
                const next = `${sumMd}\n\n${stripped}`;
                await window.api.vault.writeNote(filePath, next);
                window.alert('ノートに要約を挿入しました。');
              } catch (err) {
                window.alert(`挿入に失敗しました: ${String(err)}`);
              }
            }}
          />
        )}

        {analysis && (
          <MultiAnalyzeCard
            analysis={analysis}
            filePathBySource={filePathBySource}
            onJump={onJumpToSource}
          />
        )}

        {busyMode === 'analyzing' && (
          <div className="docai-panel-busy">📊 分析中…</div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`docai-turn docai-turn-${t.role}`}>
            <div className="docai-turn-role">{t.role === 'user' ? 'あなた' : 'AI'}</div>
            <div className="docai-turn-body">
              {t.role === 'assistant' && t.citations
                ? renderAnswerWithCitations(t.content, t.citations, filePathBySource, onJumpToSource)
                : t.content}
            </div>
          </div>
        ))}

        {streaming && streamingText && (
          <div className="docai-turn docai-turn-assistant">
            <div className="docai-turn-role">AI (回答中…)</div>
            <div className="docai-turn-body">
              {renderAnswerWithCitations(
                streamingText,
                streamingCitations,
                filePathBySource,
                onJumpToSource
              )}
            </div>
          </div>
        )}

        {streamingCitations.length > 0 && streamingText === '' && (
          <div className="docai-turn docai-turn-assistant">
            <div className="docai-turn-role">関連する出典を取得中…</div>
            <ul className="docai-citation-preview">
              {streamingCitations.map((c) => (
                <li key={c.id}>
                  [{c.id}] {c.section}
                  {c.pageNumber ? ` (p.${c.pageNumber})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {followUps.length > 0 && !streaming && (
          <div className="docai-followups">
            <div className="docai-followups-label">💡 サジェスト質問:</div>
            <ul>
              {followUps.map((q, i) => (
                <li key={i}>
                  <button type="button" className="docai-followup-button" onClick={() => ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form
        className="docai-panel-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          type="text"
          value={input}
          placeholder="この文書について質問..."
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          aria-label="文書への質問"
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          送信
        </button>
      </form>

      {pickerOpen && vaultPath && (
        <MultiDocPicker
          vaultPath={vaultPath}
          initialSelected={[filePath, ...extraDocs]}
          primaryFilePath={filePath}
          onCancel={() => setPickerOpen(false)}
          onConfirm={handlePickerConfirm}
        />
      )}

      {generatorOpen && (
        <ContentGenerator
          filePath={filePath}
          filePathBySource={filePathBySource}
          onClose={() => setGeneratorOpen(false)}
          onJumpToSource={onJumpToSource}
        />
      )}
    </aside>
  );
}
