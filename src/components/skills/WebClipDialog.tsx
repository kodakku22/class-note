// Web Clip dialog — Obsidian Skill #2 entry point.
//
// Prompts for a URL, calls the Defuddle-backed `web:clip` IPC, and on
// success navigates the user to the freshly clipped note. Failures are
// surfaced inline.
import { useState } from 'react';

type Props = {
  vaultPath: string;
  onClose: () => void;
  onClipped: (filePath: string) => void;
};

export function WebClipDialog({ vaultPath, onClose, onClipped }: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!url.trim()) {
      setError('URL を入力してください');
      return;
    }
    setBusy(true);
    setInfo('取得中… (Defuddle で本文を抽出)');
    const r = await window.api.web.clip(vaultPath, url.trim());
    setBusy(false);
    if (r.ok) {
      setInfo(`✓ ${r.title} (${r.wordCount} words)`);
      // Brief delay so the user sees confirmation, then navigate.
      setTimeout(() => onClipped(r.filePath), 600);
    } else {
      setError(r.error);
      setInfo(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: 480 }}
      >
        <h3>🌐 Web ページをクリップ</h3>
        <p className="help">
          URL から広告・ナビ・サイドバーを除外し、クリーンな Markdown として
          <code> Web/</code> フォルダに保存します。Defuddle 利用、トークン節約に最適。
        </p>
        <div className="modal-section">
          <label>URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        {info && <div className="help" style={{ color: 'var(--good, #4caf50)' }}>{info}</div>}
        {error && (
          <div className="help" style={{ color: 'var(--danger)' }}>
            ⚠️ {error}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            閉じる
          </button>
          <button className="primary" onClick={submit} disabled={busy || !url.trim()}>
            {busy ? '⏳ クリップ中…' : 'クリップ'}
          </button>
        </div>
      </div>
    </div>
  );
}
