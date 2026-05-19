// Card-grid view for a subject's notes + materials.
import { useEffect, useState, useMemo, useCallback } from 'react';
import { NoteCard } from '../components/cards/NoteCard';
import { MaterialCard } from '../components/cards/MaterialCard';
import { CARD_COLORS, type CardColor } from '../types/objectTypes';
import { parseFrontmatter, stringifyFrontmatter } from '../utils/frontmatter';
import { colorForSubject, emojiForSubject } from '../utils/colors';

type EnrichedFile = {
  name: string;
  path: string;
  kind: 'note' | 'pdf' | 'image' | 'office' | 'other';
  ext: string;
  mtime: number;
  meta?: Record<string, unknown>;
  preview?: string;
};

type Props = {
  vaultPath: string;
  subject: string;
  reloadKey: number;
  onOpenFile: (filePath: string, kind: EnrichedFile['kind']) => void;
  onChanged: () => void;
};

type Sort = 'mtime-desc' | 'mtime-asc' | 'title-asc';
type Filter = 'all' | 'lecture' | 'summary' | 'review' | 'research' | 'memo' | 'free';

export function GalleryView({ vaultPath, subject, reloadKey, onOpenFile, onChanged }: Props) {
  const [data, setData] = useState<{ notes: EnrichedFile[]; materials: EnrichedFile[] }>({
    notes: [],
    materials: [],
  });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('mtime-desc');
  const [filter, setFilter] = useState<Filter>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.vault.listFilesEnriched(vaultPath, subject);
      setData(r);
    } finally {
      setLoading(false);
    }
  }, [vaultPath, subject]);

  useEffect(() => {
    reload();
  }, [reload, reloadKey]);

  const sortedNotes = useMemo(() => {
    let arr = [...data.notes];
    if (filter !== 'all') {
      arr = arr.filter((f) => (f.meta?.type as string | undefined) === filter || (filter === 'free' && !f.meta?.type));
    }
    arr.sort((a, b) => {
      if (sort === 'mtime-desc') return b.mtime - a.mtime;
      if (sort === 'mtime-asc') return a.mtime - b.mtime;
      return a.name.localeCompare(b.name, 'ja');
    });
    return arr;
  }, [data.notes, sort, filter]);

  const changeColor = async (file: EnrichedFile, color: CardColor) => {
    const raw = await window.api.vault.readNote(file.path);
    const { meta, body } = parseFrontmatter(raw);
    if (color === 'default') {
      delete meta.color;
    } else {
      meta.color = color;
    }
    await window.api.vault.writeNote(file.path, stringifyFrontmatter(meta, body));
    onChanged();
  };

  const renameFile = async (file: EnrichedFile) => {
    const cur = file.name.replace(/\.md$/, '');
    const v = prompt('新しい名前 (.md なし)', cur);
    if (!v || v.trim() === cur) return;
    const r = await window.api.vault.renameNote(vaultPath, file.path, v.trim());
    if (!r.ok) alert(`リネーム失敗: ${r.error}`);
    onChanged();
  };

  const c = colorForSubject(subject);
  const emoji = emojiForSubject(subject);

  return (
    <div className="gallery-view">
      <div className="gallery-header" style={{ borderBottom: `2px solid ${c.bg}` }}>
        <div className="gallery-title">
          <span className="gallery-emoji">{emoji}</span>
          <span>{subject}</span>
          <span className="gallery-count">
            ノート {sortedNotes.length} · 資料 {data.materials.length}
          </span>
        </div>
        <div className="gallery-controls">
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">すべてのタイプ</option>
            <option value="lecture">🎓 授業ノート</option>
            <option value="summary">📝 要約</option>
            <option value="review">🔁 復習</option>
            <option value="research">🔬 調査</option>
            <option value="memo">🗒️ メモ</option>
            <option value="free">📄 タイプなし</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="mtime-desc">更新が新しい順</option>
            <option value="mtime-asc">更新が古い順</option>
            <option value="title-asc">タイトル順</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">読み込み中…</div>
      ) : sortedNotes.length === 0 && data.materials.length === 0 ? (
        <div className="empty-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📭</div>
            この科目にはまだノートがありません。<br />
            <span style={{ color: 'var(--text-tertiary)' }}>Ctrl+N で新規ノートを作成</span>
          </div>
        </div>
      ) : (
        <div className="gallery-body">
          {sortedNotes.length > 0 && (
            <>
              <div className="section-label">ノート</div>
              <div className="gallery-grid gallery-grid-animate">
                {sortedNotes.map((f) => (
                  <div className="gallery-item-enter" key={f.path}>
                    <NoteCard
                      filePath={f.path}
                      fileName={f.name}
                      meta={f.meta}
                      preview={f.preview}
                      mtime={f.mtime}
                      subject={subject}
                      onOpen={() => onOpenFile(f.path, 'note')}
                      onChangeColor={(c) => changeColor(f, c)}
                      onRename={() => renameFile(f)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {data.materials.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 18 }}>
                資料
              </div>
              <div className="gallery-grid material-grid gallery-grid-animate">
                {data.materials.map((f) => (
                  <div className="gallery-item-enter" key={f.path}>
                    <MaterialCard
                      filePath={f.path}
                      fileName={f.name}
                      kind={f.kind === 'note' ? 'other' : (f.kind as 'pdf' | 'image' | 'office' | 'other')}
                      mtime={f.mtime}
                      onOpen={() => onOpenFile(f.path, f.kind)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="gallery-footer-hint">
        Color label: {CARD_COLORS.map((c) => c.id).join(' / ')}
      </div>
    </div>
  );
}
