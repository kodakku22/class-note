import { useEffect, useState } from 'react';
import { Timetable as TimetableData } from '../types';
import { colorForSubject, emojiForSubject } from '../utils/colors';

type Props = {
  vaultPath: string;
  subjects: string[];
  onJumpToSubject: (subject: string) => void;
};

export function Timetable({ vaultPath, subjects, onJumpToSubject }: Props) {
  const [data, setData] = useState<TimetableData | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    window.api.timetable.read(vaultPath).then(setData);
  }, [vaultPath]);

  if (!data) return <div className="empty-state">読み込み中...</div>;

  const save = async (next: TimetableData) => {
    setData(next);
    await window.api.timetable.write(vaultPath, next);
  };

  const startEdit = (key: string) => {
    setEditing(key);
    setEditValue(data.cells[key] ?? '');
  };

  const commit = async () => {
    if (!editing) return;
    const next: TimetableData = { ...data, cells: { ...data.cells } };
    if (editValue.trim()) next.cells[editing] = editValue.trim();
    else delete next.cells[editing];
    await save(next);
    setEditing(null);
  };

  const setPeriods = async (n: number) => {
    await save({ ...data, periods: Math.max(1, Math.min(10, n)) });
  };

  const toggleSaturday = async () => {
    const has土 = data.days.includes('土');
    const days = has土 ? data.days.filter((d) => d !== '土') : [...data.days, '土'];
    await save({ ...data, days });
  };

  return (
    <div className="timetable-view">
      <div className="timetable-header">
        <h2>📅 時間割</h2>
        <div className="timetable-controls">
          <span>時限</span>
          <button onClick={() => setPeriods(data.periods - 1)}>−</button>
          <span style={{ fontWeight: 500, minWidth: 18, textAlign: 'center' }}>{data.periods}</span>
          <button onClick={() => setPeriods(data.periods + 1)}>＋</button>
          <span style={{ marginLeft: 12 }}>·</span>
          <button onClick={toggleSaturday}>
            {data.days.includes('土') ? '土曜を非表示' : '土曜を表示'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
            セルをクリックして編集 / 科目名と一致するセルはクリックでジャンプ
          </span>
        </div>
      </div>

      <div className="timetable-grid-wrapper">
        <table className="timetable-grid">
          <thead>
            <tr>
              <th></th>
              {data.days.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: data.periods }, (_, i) => i + 1).map((p) => (
              <tr key={p}>
                <th>{p}</th>
                {data.days.map((d) => {
                  const key = `${d}-${p}`;
                  const value = data.cells[key] ?? '';
                  const isSubject = value && subjects.includes(value);
                  if (editing === key) {
                    return (
                      <td key={key} className="cell editing">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commit();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          list={`subjects-list-${key}`}
                          placeholder="科目名"
                        />
                        <datalist id={`subjects-list-${key}`}>
                          {subjects.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      </td>
                    );
                  }
                  const cellStyle = isSubject
                    ? {
                        background: colorForSubject(value).bg,
                        color: colorForSubject(value).fg,
                        boxShadow: `inset 3px 0 0 ${colorForSubject(value).accent}`,
                      }
                    : undefined;
                  return (
                    <td
                      key={key}
                      className={`cell ${value ? 'filled' : ''} ${isSubject ? 'jumpable' : ''}`}
                      style={cellStyle}
                      onClick={() => {
                        if (isSubject) onJumpToSubject(value);
                        else startEdit(key);
                      }}
                      onDoubleClick={() => startEdit(key)}
                      title={
                        isSubject
                          ? `${value} に移動 (ダブルクリックで編集)`
                          : 'クリックで編集'
                      }
                    >
                      {isSubject ? (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <span style={{ fontSize: 18 }}>{emojiForSubject(value)}</span>
                          <span style={{ fontSize: 13 }}>{value}</span>
                        </span>
                      ) : (
                        <span>{value || '+'}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
