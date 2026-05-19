import { useEffect, useState } from 'react';
import { SearchHit } from '../types';

type Props = {
  vaultPath: string;
  onJumpToFile: (subject: string, filePath: string) => void;
};

export function SearchBar({ vaultPath, onJumpToFile }: Props) {
  const [keyword, setKeyword] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!keyword.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await window.api.search.query(vaultPath, keyword);
      setHits(res);
    }, 200);
    return () => clearTimeout(t);
  }, [keyword, vaultPath]);

  return (
    <div>
      <div className="search-box">
        <input
          placeholder="🔍 全体検索..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && keyword && (
        <div className="search-results">
          {hits.length === 0 && (
            <div style={{ padding: 8, color: 'var(--text-dim)', fontSize: 12 }}>
              一致なし
            </div>
          )}
          {hits.map((h) => (
            <div
              key={h.filePath}
              className="search-hit"
              onClick={() => {
                onJumpToFile(h.subject, h.filePath);
                setOpen(false);
              }}
            >
              <div className="hit-name">{h.fileName}</div>
              <div className="hit-meta">{h.subject}</div>
              {h.snippet && <div className="hit-snippet">{h.snippet}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
