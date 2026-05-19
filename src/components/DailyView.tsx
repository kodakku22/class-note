import { useEffect, useState, useCallback } from 'react';
import { colorForSubject, emojiForSubject } from '../utils/colors';

type Props = {
  vaultPath: string;
  onJumpToFile: (subject: string, filePath: string) => void;
};

type DailyEntry = {
  subject: string;
  filePath: string;
  exists: boolean;
  preview: string;
};

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DailyView({ vaultPath, onJumpToFile }: Props) {
  const [date, setDate] = useState(todayString());
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.vault.listDailyNotes(vaultPath, date);
      setEntries(r.entries);
    } finally {
      setLoading(false);
    }
  }, [vaultPath, date]);

  useEffect(() => { reload(); }, [reload, reloadKey]);

  const createForSubject = async (subject: string) => {
    if (date !== todayString()) {
      // Only support creating today's note via the existing API
      alert('今日以外の日付のノートは Obsidian / エディタから作成してください');
      return;
    }
    await window.api.vault.createTodaysNote(vaultPath, subject);
    setReloadKey((k) => k + 1);
  };

  const existing = entries.filter((e) => e.exists);
  const missing = entries.filter((e) => !e.exists);
  const isToday = date === todayString();

  return (
    <div className="daily-view">
      <div className="daily-header">
        <div className="daily-title">
          <span className="daily-emoji">📅</span>
          <span className="daily-date">{date}</span>
          {isToday && <span className="daily-today-badge">今日</span>}
        </div>
        <div className="daily-nav">
          <button onClick={() => setDate((d) => shiftDate(d, -1))}>◀ 前日</button>
          <button onClick={() => setDate(todayString())} disabled={isToday}>今日</button>
          <button onClick={() => setDate((d) => shiftDate(d, 1))}>翌日 ▶</button>
        </div>
      </div>

      <div className="daily-body">
        {loading && <div className="empty-state">読み込み中…</div>}
        {!loading && entries.length === 0 && (
          <div className="empty-state">科目がまだありません</div>
        )}

        {existing.length > 0 && (
          <>
            <div className="section-label">この日のノート ({existing.length})</div>
            {existing.map((e) => {
              const c = colorForSubject(e.subject);
              return (
                <div
                  key={e.subject}
                  className="daily-card"
                  style={{ borderLeft: `4px solid ${c.accent}` }}
                  onClick={() => onJumpToFile(e.subject, e.filePath)}
                >
                  <div className="daily-card-head">
                    <span className="icon">{emojiForSubject(e.subject)}</span>
                    <span className="subject-name">{e.subject}</span>
                  </div>
                  <div className="daily-card-preview">
                    {e.preview || <em style={{ opacity: 0.6 }}>(本文なし)</em>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {missing.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>
              未作成 ({missing.length})
            </div>
            {missing.map((e) => {
              const c = colorForSubject(e.subject);
              return (
                <div
                  key={e.subject}
                  className="daily-card daily-card-missing"
                  style={{ borderLeft: `4px solid ${c.accent}` }}
                >
                  <div className="daily-card-head">
                    <span className="icon">{emojiForSubject(e.subject)}</span>
                    <span className="subject-name">{e.subject}</span>
                    {isToday && (
                      <button
                        className="daily-create-btn"
                        onClick={(ev) => { ev.stopPropagation(); createForSubject(e.subject); }}
                      >
                        ＋ 今日のノートを作成
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
