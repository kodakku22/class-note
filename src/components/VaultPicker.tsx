import { useState } from 'react';

type Props = {
  onPicked: (vaultPath: string) => void;
  recentVaults?: string[];
  onRemoveRecent?: (path: string) => void;
};

export function VaultPicker({ onPicked, recentVaults = [], onRemoveRecent }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async () => {
    setBusy(true);
    setError(null);
    try {
      const folder = await window.api.pickFolder();
      if (!folder) {
        setBusy(false);
        return;
      }
      const { vaultPath } = await window.api.vault.init(folder);
      onPicked(vaultPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openExistingVault = (p: string) => onPicked(p);

  return (
    <div className="vault-picker">
      <h1>📚 ClassNotes へようこそ</h1>
      <p>
        授業のノートと資料を保存する場所を選んでください。
        選んだフォルダの中に <code>ClassVault</code> フォルダが作られ、
        Obsidian でも同じフォルダを Vault として開くことができます。
      </p>
      <button onClick={handlePick} disabled={busy}>
        {busy ? '作成中...' : 'フォルダを選んで Vault を作成'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {recentVaults.length > 0 && (
        <div className="vault-recent">
          <div className="section-label">最近使った Vault</div>
          {recentVaults.map((p) => (
            <div key={p} className="vault-recent-item">
              <button className="vault-recent-open" onClick={() => openExistingVault(p)} title={p}>
                <span className="vault-recent-icon">📂</span>
                <span className="vault-recent-path">{p}</span>
              </button>
              {onRemoveRecent && (
                <button
                  className="vault-recent-remove"
                  onClick={() => onRemoveRecent(p)}
                  title="リストから削除"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
