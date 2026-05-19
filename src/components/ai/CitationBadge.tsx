// Inline citation badge. Renders a small clickable chip that scrolls to the
// source on click and shows the excerpt on hover.
import { useState } from 'react';
import type { DocAICitation } from '../../types';

export type CitationJumpPayload = {
  filePath?: string;
  source: string;
  section: string;
  pageNumber?: number;
  startLine?: number;
};

type Props = {
  id: number;
  citations: DocAICitation[];
  /** Resolved absolute path of the source document — passed by the panel. */
  filePathBySource?: Record<string, string>;
  onJump?: (payload: CitationJumpPayload) => void;
};

export function CitationBadge({ id, citations, filePathBySource, onJump }: Props) {
  const [hovered, setHovered] = useState(false);
  const citation = citations.find((c) => c.id === id);

  if (!citation) {
    // Out-of-range citation id: render the bare marker so the user still sees
    // the original "[出典 N]" text and can flag a hallucination.
    return <span className="citation-badge citation-badge-missing">[出典 {id}]</span>;
  }

  const label = citation.pageNumber
    ? `p.${citation.pageNumber}`
    : citation.section || '出典';

  const handleClick = () => {
    if (!onJump) return;
    onJump({
      filePath: filePathBySource?.[citation.source],
      source: citation.source,
      section: citation.section,
      pageNumber: citation.pageNumber,
      startLine: citation.startLine,
    });
  };

  return (
    <span
      className="citation-badge"
      role="button"
      tabIndex={0}
      aria-label={`出典 ${id}: ${citation.source} ${citation.section}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="citation-badge-id">[{id}]</span>
      <span className="citation-badge-label">{label}</span>
      {hovered && citation.excerpt && (
        <span className="citation-badge-tooltip" role="tooltip">
          <span className="citation-badge-tooltip-source">{citation.source}</span>
          {citation.section ? <span className="citation-badge-tooltip-section">{citation.section}</span> : null}
          <span className="citation-badge-tooltip-excerpt">{citation.excerpt}</span>
        </span>
      )}
    </span>
  );
}
