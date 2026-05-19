import { useCallback, useEffect, useState } from 'react';

type Props = {
  vaultPath: string;
  onClose: () => void;
};

type TemplateMeta = { name: string; filePath: string };

const SAMPLE_VARS = `利用可能なプレースホルダ:
  {{date}}      → 今日の日付 (YYYY-MM-DD)
  {{subject}}   → 科目名 (科目テンプレート使用時)
  {{title}}     → ノート名`;

export function TemplateEditor({ vaultPath, onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [newName, setNewName] = useState('');
  const [savedHint, setSavedHint] = useState(false);

  const reload = useCallback(async () => {
    const list = await window.api.vault.listTemplates(vaultPath);
    setTemplates(list);
    if (list.length > 0 && !selected) {
      setSelected(list[0].name);
    }
  }, [selected, vaultPath]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!selected) {
      setContent('');
      return;
    }
    window.api.vault.readTemplate(vaultPath, selected).then(setContent);
  }, [vaultPath, selected]);

  const save = async () => {
    if (!selected) return;
    await window.api.vault.writeTemplate(vaultPath, selected, content);
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1500);
  };

  const create = async () => {
    const n = newName.trim();
    if (!n) return;
    await window.api.vault.writeTemplate(
      vaultPath,
      n,
      `# {{title}}\n\n## 内容\n\n`
    );
    setNewName('');
    await reload();
    setSelected(n);
  };

  const remove = async () => {
    if (!selected) return;
    if (!confirm(`テンプレート「${selected}」を削除しますか？`)) return;
    await window.api.vault.deleteTemplate(vaultPath, selected);
    setSelected(null);
    await reload();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>📋 テンプレート管理</h3>
        <div className="template-editor">
          <div className="template-list">
            <div className="section-label">テンプレート</div>
            {templates.length === 0 && (
              <div style={{ padding: 8, color: 'var(--text-tertiary)', fontSize: 12 }}>
                まだありません
              </div>
            )}
            {templates.map((t) => (
              <div
                key={t.name}
                className={`file-item ${selected === t.name ? 'active' : ''}`}
                onClick={() => setSelected(t.name)}
              >
                <span className="icon">📋</span>
                <span className="name">{t.name}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <input
                placeholder="新規テンプレート名"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                style={{ flex: 1 }}
              />
              <button onClick={create} disabled={!newName.trim()}>追加</button>
            </div>
          </div>
          <div className="template-edit-area">
            {selected ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{selected}</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {savedHint && <span style={{ fontSize: 12, color: 'var(--success, #4caf50)' }}>保存しました</span>}
                    <button onClick={remove} style={{ color: 'var(--danger, #d33)' }}>削除</button>
                    <button className="primary" onClick={save}>保存</button>
                  </div>
                </div>
                <textarea
                  className="template-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                />
                <pre style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {SAMPLE_VARS}
                </pre>
              </>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                左から選択するか、新規追加してください
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
