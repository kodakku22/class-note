import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { NoteViewer } from '../NoteViewer';
import { LearningAgentPanel } from '../LearningAgentPanel';
import { parseFrontmatter } from '../../utils/frontmatter';

type PaperTab = 'overview' | 'reading-notes' | 'edit';

type Props = {
  filePath: string;
  vaultPath: string;
  onJumpToWikilink: (name: string) => void;
  onJumpToFile: (filePath: string) => void;
  resolveWikilink?: (name: string) => string | null;
  onRename?: (oldPath: string, newName: string) => void;
};

export function PaperViewer({
  filePath,
  vaultPath,
  onJumpToWikilink,
  onJumpToFile,
  resolveWikilink,
  onRename,
}: Props) {
  const [tab, setTab] = useState<PaperTab>('overview');
  const [overviewSource, setOverviewSource] = useState('');
  const [readingNotes, setReadingNotes] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [saving, setSaving] = useState(false);

  const overviewBody = useMemo(() => parseFrontmatter(overviewSource).body, [overviewSource]);

  const loadAll = useCallback(async () => {
    const raw = await window.api.vault.readNote(filePath);
    setOverviewSource(raw);
    const { content } = await window.api.papers.getReadingNote(filePath);
    setReadingNotes(content);
  }, [filePath]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const appendNote = async () => {
    if (!quickNote.trim() || saving) return;
    setSaving(true);
    const r = await window.api.papers.appendReadingNote(filePath, quickNote);
    if (r.ok) {
      const { content } = await window.api.papers.getReadingNote(filePath);
      setReadingNotes(content);
      setQuickNote('');
    } else {
      alert(`保存失敗: ${r.error ?? '不明なエラー'}`);
    }
    setSaving(false);
  };

  return (
    <div className="paper-viewer viewer">
      <div className="note-tabs book-tabs">
        <button
          className={`note-tab ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          概要・引用価値
        </button>
        <button
          className={`note-tab ${tab === 'reading-notes' ? 'active' : ''}`}
          onClick={() => setTab('reading-notes')}
        >
          読書ノート
        </button>
        <button
          className={`note-tab ${tab === 'edit' ? 'active' : ''}`}
          onClick={() => setTab('edit')}
        >
          編集
        </button>
        <span style={{ flex: 1 }} />
        <LearningAgentPanel filePath={filePath} kind="paper" label="論文AI" onSaved={loadAll} />
      </div>

      {tab === 'overview' && (
        <div className="viewer-body book-overview">
          <div className="markdown">
            <MarkdownRenderer
              content={overviewBody}
              onJumpToWikilink={onJumpToWikilink}
              onJumpToFile={onJumpToFile}
              resolveWikilink={resolveWikilink}
            />
          </div>
        </div>
      )}

      {tab === 'reading-notes' && (
        <div className="viewer-body reading-notes-tab">
          <div className="reading-notes-quickadd">
            <textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="読んで分かった手法・限界・引用したい理由をメモ... (Ctrl+Enter で追記)"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  appendNote();
                }
              }}
            />
            <div className="quickadd-row">
              <span className="toolbar-hint">Ctrl+Enter で追記</span>
              <button className="primary" onClick={appendNote} disabled={saving || !quickNote.trim()}>
                {saving ? '保存中...' : '追記'}
              </button>
            </div>
          </div>
          <div className="reading-notes-history markdown">
            {readingNotes ? (
              <MarkdownRenderer
                content={readingNotes}
                onJumpToWikilink={onJumpToWikilink}
                onJumpToFile={onJumpToFile}
                resolveWikilink={resolveWikilink}
              />
            ) : (
              <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div>研究メモを残して、あとで引用や再現実験に戻れるようにしよう</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'edit' && (
        <div className="viewer-body book-edit">
          <NoteViewer
            filePath={filePath}
            vaultPath={vaultPath}
            onJumpToWikilink={onJumpToWikilink}
            onJumpToFile={onJumpToFile}
            resolveWikilink={resolveWikilink}
            onRename={onRename}
          />
        </div>
      )}
    </div>
  );
}
