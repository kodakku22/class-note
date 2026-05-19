import { useEffect, useState } from 'react';
import { Backlink } from '../types';

type Props = {
  vaultPath: string;
  noteName: string;
  onJumpToFile: (filePath: string) => void;
};

const CATEGORY_LABEL: Record<string, string> = {
  'subject-note': 'ノート',
  'subject-overview': '概要',
  book: '本',
  memo: 'メモ',
};

const CATEGORY_ICON: Record<string, string> = {
  'subject-note': '📝',
  'subject-overview': '📋',
  book: '📚',
  memo: '💭',
};

export function BacklinksPanel({ vaultPath, noteName, onJumpToFile }: Props) {
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null);

  useEffect(() => {
    setBacklinks(null);
    window.api.links.backlinks(vaultPath, noteName).then(setBacklinks);
  }, [vaultPath, noteName]);

  if (backlinks === null) return null;
  if (backlinks.length === 0) return null;

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        🔗 このノートへのリンク ({backlinks.length})
      </div>
      <div className="backlinks-list">
        {backlinks.map((b) => (
          <div
            key={b.filePath}
            className="backlink-item"
            onClick={() => onJumpToFile(b.filePath)}
          >
            <span className="backlink-icon">{CATEGORY_ICON[b.category] ?? '📄'}</span>
            <span className="backlink-name">
              {b.fileName.replace(/\.md$/, '')}
              {b.subject && (
                <span className="backlink-subject"> · {b.subject}</span>
              )}
            </span>
            <span className="backlink-snippet">{b.snippet}</span>
            <span className="backlink-cat">{CATEGORY_LABEL[b.category] ?? b.category}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
