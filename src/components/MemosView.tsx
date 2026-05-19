import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MemoEntry } from '../types';

type Props = {
  vaultPath: string;
  onJumpToWikilink: (name: string) => void;
  onJumpToFile?: (filePath: string) => void;
};

export function MemosView({ vaultPath, onJumpToWikilink, onJumpToFile }: Props) {
  const [memos, setMemos] = useState<MemoEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const reload = useCallback(() => window.api.memos.list(vaultPath).then(setMemos), [vaultPath]);

  useEffect(() => { reload(); }, [reload]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    memos.forEach((m) => m.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [memos]);

  const filtered = tagFilter ? memos.filter((m) => m.tags.includes(tagFilter)) : memos;

  const submit = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    await window.api.memos.create(vaultPath, draft, []);
    setDraft('');
    setSaving(false);
    reload();
  };

  const remove = async (m: MemoEntry) => {
    if (!confirm('このメモを削除しますか?')) return;
    await window.api.memos.delete(m.filePath);
    reload();
  };

  const startEdit = (m: MemoEntry) => {
    setEditing(m.filePath);
    setEditValue(m.body);
  };

  const commitEdit = async () => {
    if (!editing) return;
    await window.api.memos.update(editing, editValue);
    setEditing(null);
    reload();
  };

  return (
    <div className="memos-view">
      <div className="library-header">
        <h2>💭 メモ</h2>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          思いつきを即記録。<code>#タグ</code> でグループ化、<code>[[名前]]</code> で授業ノートや本にリンク。
        </div>
      </div>

      <div className="memo-quickadd">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="メモを書く...   #思いつき [[微分]] のように使えます"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="memo-quickadd-row">
          <span className="qa-hint">Ctrl+Enter で投稿</span>
          <span style={{ flex: 1 }} />
          <button className="primary" onClick={submit} disabled={!draft.trim() || saving}>
            投稿
          </button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="tag-filter-bar">
          <button
            className={`tag-chip ${tagFilter === null ? 'active' : ''}`}
            onClick={() => setTagFilter(null)}
          >
            すべて
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`tag-chip ${tagFilter === t ? 'active' : ''}`}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="memo-list">
        {filtered.length === 0 && (
          <div className="empty-state" style={{ padding: 60 }}>
            <div>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>💭</div>
              {tagFilter ? `#${tagFilter} のメモはまだありません` : 'メモはまだありません'}
            </div>
          </div>
        )}
        {filtered.map((m) => (
          <div key={m.filePath} className="memo-item">
            <div className="memo-item-header">
              <span className="memo-time">{m.created}</span>
              <span style={{ flex: 1 }} />
              {editing === m.filePath ? (
                <>
                  <button onClick={() => setEditing(null)}>取消</button>
                  <button className="primary" onClick={commitEdit}>保存</button>
                </>
              ) : (
                <div className="memo-actions">
                  <button className="subtle" onClick={() => startEdit(m)} title="編集">✏️</button>
                  <button className="subtle" onClick={() => remove(m)} title="削除">🗑️</button>
                </div>
              )}
            </div>
            {editing === m.filePath ? (
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={Math.min(20, editValue.split('\n').length + 1)}
                style={{ width: '100%' }}
              />
            ) : (
              <div className="memo-body markdown">
                <MarkdownRenderer
                  content={m.body}
                  onJumpToWikilink={onJumpToWikilink}
                  onJumpToFile={onJumpToFile}
                />
              </div>
            )}
            {m.tags.length > 0 && (
              <div className="tag-row">
                {m.tags.map((t) => (
                  <span
                    key={t}
                    className="tag-chip clickable"
                    onClick={() => setTagFilter(t)}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
