// Display card for a SmartSummaryResult. Used by DocAIPanel after the user
// hits the "要約" quick action.
import type { DocAISummaryResult, DocAICitation } from '../../types';
import type { CitationJumpPayload } from './CitationBadge';

type Props = {
  summary: DocAISummaryResult;
  filePathBySource?: Record<string, string>;
  onJump?: (payload: CitationJumpPayload) => void;
  onCopy?: () => void;
  onInsertIntoNote?: () => void;
};

function importanceIcon(level: DocAISummaryResult['keyPoints'][number]['importance']): string {
  if (level === 'critical') return '🔴';
  if (level === 'important') return '🟡';
  return '🟢';
}

function citationLabel(c: DocAICitation): string {
  if (c.pageNumber) return `p.${c.pageNumber}`;
  return c.section || c.source;
}

export function SummaryCard({ summary, filePathBySource, onJump, onCopy, onInsertIntoNote }: Props) {
  return (
    <div className="summary-card" role="region" aria-label="AI 要約結果">
      <div className="summary-card-header">
        <span className="summary-card-icon">⚡</span>
        <span className="summary-card-headline">{summary.headline || '要約'}</span>
      </div>

      {summary.keyPoints.length > 0 && (
        <ol className="summary-card-keypoints">
          {summary.keyPoints.map((kp, i) => (
            <li key={i} className={`summary-card-keypoint summary-card-keypoint-${kp.importance}`}>
              <span className="summary-card-keypoint-importance" aria-label={kp.importance}>
                {importanceIcon(kp.importance)}
              </span>
              <span className="summary-card-keypoint-text">{kp.point}</span>
              <button
                type="button"
                className="summary-card-keypoint-jump"
                onClick={() =>
                  onJump?.({
                    filePath: filePathBySource?.[kp.citation.source],
                    source: kp.citation.source,
                    section: kp.citation.section,
                    pageNumber: kp.citation.pageNumber,
                    startLine: kp.citation.startLine,
                  })
                }
                aria-label={`出典に移動: ${citationLabel(kp.citation)}`}
              >
                → {citationLabel(kp.citation)}
              </button>
            </li>
          ))}
        </ol>
      )}

      {summary.structure && (
        <details className="summary-card-structure">
          <summary>文書の論理構成</summary>
          <pre>{summary.structure}</pre>
        </details>
      )}

      {summary.actionItems.length > 0 && (
        <div className="summary-card-actions-list">
          <div className="summary-card-actions-label">次にやること</div>
          <ul>
            {summary.actionItems.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="summary-card-buttons">
        {onCopy && (
          <button type="button" className="summary-card-button" onClick={onCopy}>
            📋 コピー
          </button>
        )}
        {onInsertIntoNote && (
          <button type="button" className="summary-card-button" onClick={onInsertIntoNote}>
            📝 ノートに挿入
          </button>
        )}
      </div>
    </div>
  );
}
