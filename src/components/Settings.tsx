import { useCallback, useEffect, useState } from 'react';
import { TemplateEditor } from './TemplateEditor';
import { SkillsPanel } from './skills/SkillsPanel';
import { AiSettingsPanel } from './ai/AiSettingsPanel';
import type { RailUiMode } from '../navigation/rail';
import type { ResearchReproducibilityReport, VaultSafetyAudit } from '../types';

const EFFORTS = [
  { id: 'low', label: 'low', sub: '軽い質問・短い回答' },
  { id: 'medium', label: 'medium', sub: 'バランス' },
  { id: 'high', label: 'high', sub: 'じっくり考える' },
  { id: 'xhigh', label: 'xhigh (超高)', sub: '難問向け (Opus 4.7) — 推奨' },
  { id: 'max', label: 'max', sub: '最大思考 (Opus)' },
];

type Theme = 'light' | 'dark';

type Props = {
  onClose: () => void;
  vaultPath: string;
  uiMode: RailUiMode;
  onChangeUiMode: (mode: RailUiMode) => void;
  onCustomizeRail: () => void;
  onResetRailSimple: () => void;
  onSetRailFull: () => void;
};

export function Settings({
  onClose,
  vaultPath,
  uiMode,
  onChangeUiMode,
  onCustomizeRail,
  onResetRailSimple,
  onSetRailFull,
}: Props) {
  const [model, setModel] = useState('opus');
  const [effort, setEffort] = useState('xhigh');
  const [theme, setTheme] = useState<Theme>('light');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);

  useEffect(() => {
    window.api.settings.get().then((s) => {
      setModel(s.model);
      setEffort(s.effort);
      setTheme((s.theme as Theme) ?? 'light');
      setTelemetryEnabled(Boolean(s.telemetryEnabled));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    await window.api.settings.set({
      model,
      effort,
      theme,
      telemetryEnabled,
    });
    document.body.classList.toggle('dark', theme === 'dark');
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ 設定</h3>

        <div className="settings-modal-body" data-testid="settings-modal-body">
          <div className="modal-section">
            <label>AI</label>
            <AiSettingsPanel compact />
            <div className="help">
              GPT / Gemini / Claude をアプリ全体で切り替えます。APIキーは OS の暗号化ストレージへ保存され、
              ログイン方式は公式CLIまたはGoogle ADCだけを使います。
            </div>
          </div>

          <div className="modal-section">
            <label>思考の深さ (effort)</label>
            <select value={effort} onChange={(e) => setEffort(e.target.value)}>
              {EFFORTS.map((e) => (
                <option key={e.id} value={e.id}>{e.label} — {e.sub}</option>
              ))}
            </select>
            <div className="help">
              adaptive thinking と組み合わせて回答品質と所要時間のバランスを決めます。
            </div>
          </div>

          <div className="modal-section">
            <label>外観</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={theme === 'light' ? 'primary' : ''}
                onClick={() => setTheme('light')}
              >
                ☀️ ライト
              </button>
              <button
                className={theme === 'dark' ? 'primary' : ''}
                onClick={() => setTheme('dark')}
              >
                🌙 ダーク
              </button>
            </div>
          </div>

          <div className="modal-section">
            <label>左アイコン</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button
                className={uiMode === 'simple' ? 'primary' : ''}
                onClick={() => onChangeUiMode('simple')}
              >
                シンプル
              </button>
              <button
                className={uiMode === 'custom' ? 'primary' : ''}
                onClick={() => onChangeUiMode('custom')}
              >
                カスタム
              </button>
              <button
                className={uiMode === 'full' ? 'primary' : ''}
                onClick={() => onChangeUiMode('full')}
              >
                全機能
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={onCustomizeRail}>＋ 左アイコンを編集</button>
              <button onClick={onResetRailSimple}>シンプルに戻す</button>
              <button onClick={onSetRailFull}>全機能を表示</button>
            </div>
            <div className="help">
              初期はシンプル。必要に応じて＋から機能を追加し、慣れたら全機能へ切り替えられます。
            </div>
          </div>

          <div className="modal-section">
            <label>プライバシー</label>
            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                fontWeight: 400,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={telemetryEnabled}
                onChange={(e) => setTelemetryEnabled(e.target.checked)}
              />
              <div>
                <div>匿名利用統計とクラッシュレポートを送信</div>
                <div className="help">
                  送信内容は <code>app_launched</code> 等のカウンタとクラッシュ時のスタックトレースのみ。
                  ノート内容・ファイル名・API キーは送信しません。
                  {' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.api.materials.openUrl(
                        'https://github.com/kodakku22/class-note/blob/main/docs/privacy.md'
                      );
                    }}
                    style={{ color: 'var(--accent)' }}
                  >
                    詳細
                  </a>
                  。変更は次回起動時に反映されます。
                </div>
              </div>
            </label>
          </div>

          <div className="modal-section">
            <label>テンプレート</label>
            <button onClick={() => setShowTemplates(true)}>📋 テンプレートを編集</button>
            <div className="help">
              <code>daily</code>（今日のノート）と <code>subject</code>（科目概要）はノート作成時に自動で使われます。
              プレースホルダ: <code>{'{{date}}'}</code>, <code>{'{{subject}}'}</code>, <code>{'{{title}}'}</code>
            </div>
          </div>

          <SkillsPanel vaultPath={vaultPath} />

          <div className="modal-section">
            <label>Vault インデックス</label>
            <IndexMaintenancePanel vaultPath={vaultPath} />
            <div className="help">
              検索・backlinks・研究ダッシュボードが不自然な時は、派生キャッシュだけを再構築できます。
              ノート本文は変更しません。
            </div>
          </div>

          <div className="modal-section">
            <label>データ保護</label>
            <VaultSafetyPanel vaultPath={vaultPath} />
            <div className="help">
              Vault の読み取り異常、frontmatter、wikilink、citation の危険信号を確認し、
              userData 側にローカルバックアップを作成します。
            </div>
          </div>

          <div className="modal-section">
            <label>研究再現性</label>
            <ResearchReproducibilityPanel vaultPath={vaultPath} />
            <div className="help">
              Paper の bibkey、重複 citation key、実験ログの dataset / commit / seed / environment を検査します。
            </div>
          </div>

          <div className="modal-section">
            <label>診断</label>
            <DiagnosticsExportButton />
            <OpenLogDirButton />
            <div className="help">
              ノート本文・API キー・絶対パスを除外したローカル JSON を書き出します。
            </div>
          </div>

          <div className="modal-section">
            <label>アップデート</label>
            <UpdateCheckButton />
            <div className="help">
              アップデートはコード署名済みの installer 配布時のみ動作します。
              開発ビルドではボタンを押しても何も起きません。
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>閉じる</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? '保存中...' : saved ? '✓ 保存しました' : '保存'}
          </button>
        </div>
      </div>

      {showTemplates && (
        <TemplateEditor vaultPath={vaultPath} onClose={() => setShowTemplates(false)} />
      )}
    </div>
  );
}

function VaultSafetyPanel({ vaultPath }: { vaultPath: string }) {
  const [audit, setAudit] = useState<VaultSafetyAudit | null>(null);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'backing-up' }
    | { kind: 'backup-done'; fileCount: number; skipped: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const runAudit = async () => {
    if (!vaultPath) {
      setStatus({ kind: 'error', message: 'Vault が開かれていません' });
      return;
    }
    setStatus({ kind: 'checking' });
    const result = await window.api.vaultSafety.audit(vaultPath);
    if (result.ok) {
      setAudit(result.audit);
      setStatus({ kind: 'idle' });
    } else {
      setStatus({ kind: 'error', message: result.error });
    }
  };

  const createBackup = async () => {
    if (!vaultPath) {
      setStatus({ kind: 'error', message: 'Vault が開かれていません' });
      return;
    }
    setStatus({ kind: 'backing-up' });
    const result = await window.api.vaultSafety.createBackup(vaultPath);
    if (result.ok) {
      setStatus({
        kind: 'backup-done',
        fileCount: result.fileCount,
        skipped: result.skipped.length,
      });
    } else {
      setStatus({ kind: 'error', message: result.error });
    }
  };

  const disabled = status.kind === 'checking' || status.kind === 'backing-up';
  const issueSummary = audit
    ? `files ${audit.fileCount} / errors ${audit.issueCounts.error} / warnings ${audit.issueCounts.warning}`
    : '未確認';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: audit?.issueCounts.error ? 'var(--danger, #d33)' : 'var(--muted, #666)' }}>
          {issueSummary}
        </span>
        <button onClick={runAudit} disabled={disabled}>
          {status.kind === 'checking' ? '確認中...' : '安全性チェック'}
        </button>
        <button onClick={createBackup} disabled={disabled}>
          {status.kind === 'backing-up' ? '作成中...' : 'バックアップを作成'}
        </button>
      </div>
      {status.kind === 'backup-done' && (
        <span style={{ fontSize: 12, color: 'var(--good, #4caf50)' }}>
          バックアップを作成しました ({status.fileCount} files, skipped {status.skipped})
        </span>
      )}
      {status.kind === 'error' && (
        <span style={{ fontSize: 12, color: 'var(--danger, #d33)' }}>
          {status.message.slice(0, 160)}
        </span>
      )}
      {audit && audit.issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
          {audit.issues.slice(0, 3).map((issue, index) => (
            <li key={`${issue.code}-${issue.relPath ?? index}`}>
              {issue.severity}: {issue.code}
              {issue.relPath ? ` (${issue.relPath})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResearchReproducibilityPanel({ vaultPath }: { vaultPath: string }) {
  const [report, setReport] = useState<ResearchReproducibilityReport | null>(null);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const runCheck = async () => {
    if (!vaultPath) {
      setStatus({ kind: 'error', message: 'Vault が開かれていません' });
      return;
    }
    setStatus({ kind: 'checking' });
    const result = await window.api.research.reproducibilityReport(vaultPath);
    if (result.ok) {
      setReport(result.report);
      setStatus({ kind: 'idle' });
    } else {
      setStatus({ kind: 'error', message: result.error });
    }
  };

  const color =
    report && report.score >= 90
      ? 'var(--good, #4caf50)'
      : report && report.score < 70
        ? 'var(--danger, #d33)'
        : 'var(--muted, #666)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color }}>
          {report
            ? `score ${report.score} / papers ${report.papers.withBibkey}/${report.papers.total} / experiments ${report.experiments.complete}/${report.experiments.total}`
            : '未確認'}
        </span>
        <button onClick={runCheck} disabled={status.kind === 'checking'}>
          {status.kind === 'checking' ? '確認中...' : '再現性チェック'}
        </button>
      </div>
      {status.kind === 'error' && (
        <span style={{ fontSize: 12, color: 'var(--danger, #d33)' }}>
          {status.message.slice(0, 160)}
        </span>
      )}
      {report && report.issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
          {report.issues.slice(0, 3).map((issue, index) => (
            <li key={`${issue.code}-${issue.relPath ?? index}`}>
              {issue.code}
              {issue.relPath ? ` (${issue.relPath})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IndexMaintenancePanel({ vaultPath }: { vaultPath: string }) {
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; fileCount: number; builtAt?: string }
    | { kind: 'missing'; fileCount: number }
    | { kind: 'rebuilding' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const refresh = useCallback(async () => {
    if (!vaultPath) {
      setStatus({ kind: 'error', message: 'Vault が開かれていません' });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const result = await window.api.index.status(vaultPath);
      setStatus(
        result.ready
          ? { kind: 'ready', fileCount: result.fileCount, builtAt: result.builtAt }
          : { kind: 'missing', fileCount: result.fileCount }
      );
    } catch (err) {
      setStatus({ kind: 'error', message: String(err) });
    }
  }, [vaultPath]);

  useEffect(() => {
    if (vaultPath) void refresh();
  }, [refresh, vaultPath]);

  const rebuild = async () => {
    if (!vaultPath) {
      setStatus({ kind: 'error', message: 'Vault が開かれていません' });
      return;
    }
    setStatus({ kind: 'rebuilding' });
    try {
      const result = await window.api.index.rebuild(vaultPath);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? 'インデックスを再構築できませんでした' });
        return;
      }
      setStatus({
        kind: 'ready',
        fileCount: result.fileCount ?? 0,
        builtAt: new Date().toISOString(),
      });
    } catch (err) {
      setStatus({ kind: 'error', message: String(err) });
    }
  };

  const summary =
    status.kind === 'idle'
      ? '未確認'
      : status.kind === 'loading'
        ? '確認中...'
        : status.kind === 'rebuilding'
          ? '再構築中...'
          : status.kind === 'ready'
            ? `利用可能 (${status.fileCount} files${
                status.builtAt ? `, ${new Date(status.builtAt).toLocaleString()}` : ''
              })`
            : status.kind === 'missing'
              ? '未構築または古い形式'
              : status.message.slice(0, 160);

  const tone =
    status.kind === 'ready'
      ? 'var(--good, #4caf50)'
      : status.kind === 'error'
        ? 'var(--danger, #d33)'
        : 'var(--muted, #666)';

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: tone }}>{summary}</span>
      <button onClick={refresh} disabled={status.kind === 'loading' || status.kind === 'rebuilding'}>
        状態を更新
      </button>
      <button onClick={rebuild} disabled={status.kind === 'loading' || status.kind === 'rebuilding'}>
        インデックスを再構築
      </button>
    </div>
  );
}

function DiagnosticsExportButton() {
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'exporting' }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const onExport = async () => {
    setStatus({ kind: 'exporting' });
    const result = await window.api.diagnostics.export();
    if (result.ok && result.filePath) {
      setStatus({ kind: 'done' });
    } else {
      setStatus({ kind: 'error', message: result.error ?? '診断レポートを書き出せませんでした' });
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={onExport} disabled={status.kind === 'exporting'}>
        {status.kind === 'exporting' ? '書き出し中…' : '診断レポートを書き出す'}
      </button>
      {status.kind === 'done' && (
        <span style={{ fontSize: 12, color: 'var(--good, #4caf50)' }}>
          書き出しました
        </span>
      )}
      {status.kind === 'error' && (
        <span style={{ fontSize: 12, color: 'var(--danger, #d33)' }}>
          ✗ {status.message.slice(0, 120)}
        </span>
      )}
    </div>
  );
}

function OpenLogDirButton() {
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'opening' }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const openLogs = async () => {
    setStatus({ kind: 'opening' });
    const result = await window.api.materials.openLogDir();
    if (result.ok) {
      setStatus({ kind: 'done' });
    } else {
      setStatus({ kind: 'error', message: result.error ?? 'ログフォルダを開けませんでした' });
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <button onClick={openLogs} disabled={status.kind === 'opening'}>
        {status.kind === 'opening' ? '開いています...' : 'ログフォルダを開く'}
      </button>
      {status.kind === 'done' && (
        <span style={{ fontSize: 12, color: 'var(--good, #4caf50)' }}>開きました</span>
      )}
      {status.kind === 'error' && (
        <span style={{ fontSize: 12, color: 'var(--danger, #d33)' }}>
          {status.message.slice(0, 120)}
        </span>
      )}
    </div>
  );
}

/**
 * "Check for updates" button. Subscribes to update events for the lifetime
 * of the modal and surfaces the latest status (idle / checking / available /
 * downloaded / error).
 */
function UpdateCheckButton() {
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'available'; version: string }
    | { kind: 'downloaded'; version: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  useEffect(() => {
    const offAvail = window.api.update.onAvailable((info) =>
      setStatus({ kind: 'available', version: info.version })
    );
    const offDone = window.api.update.onDownloaded((info) =>
      setStatus({ kind: 'downloaded', version: info.version })
    );
    return () => {
      offAvail();
      offDone();
    };
  }, []);

  const onCheck = async () => {
    setStatus({ kind: 'checking' });
    const r = await window.api.update.check();
    if (!r.ok) {
      setStatus({ kind: 'error', message: r.error ?? '不明なエラー' });
      return;
    }
    if (!r.version) {
      setStatus({ kind: 'idle' });
    }
  };

  const onInstall = async () => {
    await window.api.update.install();
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={onCheck} disabled={status.kind === 'checking'}>
        {status.kind === 'checking' ? '⏳ 確認中…' : '🔄 アップデートを確認'}
      </button>
      {status.kind === 'available' && (
        <span style={{ fontSize: 12, color: 'var(--accent)' }}>
          ⬇ v{status.version} をダウンロード中…
        </span>
      )}
      {status.kind === 'downloaded' && (
        <>
          <span style={{ fontSize: 12, color: 'var(--good, #4caf50)' }}>
            ✓ v{status.version} 準備完了
          </span>
          <button className="primary" onClick={onInstall}>
            再起動して適用
          </button>
        </>
      )}
      {status.kind === 'error' && (
        <span style={{ fontSize: 12, color: 'var(--danger, #d33)' }}>
          ✗ {status.message.slice(0, 100)}
        </span>
      )}
    </div>
  );
}
