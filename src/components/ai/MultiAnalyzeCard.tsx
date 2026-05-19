// MultiAnalyzeCard — renders a docai.multiAnalyze result (comparison matrix,
// common points, differences, synthesis).
import type { DocAICitation } from '../../types';
import type { CitationJumpPayload } from './CitationBadge';
import { CitationBadge } from './CitationBadge';

export type MultiAnalysisData = {
  comparison: Array<{
    aspect: string;
    documents: Array<{
      source: string;
      position: string;
      citation: DocAICitation;
    }>;
  }>;
  commonPoints: string[];
  differences: string[];
  synthesis: string;
  suggestedStructure?: string;
};

type Props = {
  analysis: MultiAnalysisData;
  filePathBySource?: Record<string, string>;
  onJump?: (payload: CitationJumpPayload) => void;
};

export function MultiAnalyzeCard({ analysis, filePathBySource, onJump }: Props) {
  return (
    <div className="multi-analyze-card" role="region" aria-label="複数文書分析結果">
      <div className="multi-analyze-card-header">
        <span className="multi-analyze-card-icon">📊</span>
        <span className="multi-analyze-card-headline">複数文書分析</span>
      </div>

      {analysis.comparison.length > 0 && (
        <section className="multi-analyze-section">
          <h4>観点別比較</h4>
          <table className="multi-analyze-table">
            <thead>
              <tr>
                <th scope="col">観点</th>
                <th scope="col">文書ごとの立場</th>
              </tr>
            </thead>
            <tbody>
              {analysis.comparison.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{row.aspect}</th>
                  <td>
                    <ul>
                      {row.documents.map((d, j) => (
                        <li key={j}>
                          <strong>{d.source}:</strong> {d.position}{' '}
                          <CitationBadge
                            id={d.citation.id}
                            citations={[d.citation]}
                            filePathBySource={filePathBySource}
                            onJump={onJump}
                          />
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {analysis.commonPoints.length > 0 && (
        <section className="multi-analyze-section">
          <h4>共通点</h4>
          <ul>
            {analysis.commonPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {analysis.differences.length > 0 && (
        <section className="multi-analyze-section">
          <h4>違い</h4>
          <ul>
            {analysis.differences.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {analysis.synthesis && (
        <section className="multi-analyze-section">
          <h4>統合的結論</h4>
          <p>{analysis.synthesis}</p>
        </section>
      )}

      {analysis.suggestedStructure && (
        <section className="multi-analyze-section">
          <h4>発表/レポート構成案</h4>
          <pre className="multi-analyze-structure">{analysis.suggestedStructure}</pre>
        </section>
      )}
    </div>
  );
}
