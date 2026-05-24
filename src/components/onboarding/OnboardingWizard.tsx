// First-launch wizard. Walks the user through:
//   1. ようこそ + Karpathy 式 Second Brain の哲学
//   2. Vault の選択 / 作成
//   3. AI Provider の選択 (GPT / Gemini / Claude / Off)
//   4. サンプル Vault の投入オプション
//
// `onboardingCompleted` is persisted in settings.json so the wizard runs
// at most once per install. The user can re-run it from Settings.
import { useState } from 'react';
import { AiSettingsPanel } from '../ai/AiSettingsPanel';

type Step = 1 | 2 | 3 | 4 | 5;

type Props = {
  onComplete: (config: {
    vaultPath: string;
    installSample: boolean;
  }) => void;
  onSkip: () => void;
};

export function OnboardingWizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [vaultPath, setVaultPath] = useState<string>('');
  const [installSample, setInstallSample] = useState(true);

  const next = () => setStep((s) => Math.min(5, s + 1) as Step);
  const back = () => setStep((s) => Math.max(1, s - 1) as Step);

  const pickVault = async () => {
    const folder = await window.api.pickFolder();
    if (folder) {
      const r = await window.api.vault.init(folder);
      setVaultPath(r.vaultPath);
    }
  };

  const finish = () => {
    onComplete({
      vaultPath,
      installSample,
    });
  };

  const canAdvance =
    step === 1 ? true
    : step === 2 ? Boolean(vaultPath)
    : step === 3 ? true
    : step === 4 ? true
    : true;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={step}
          aria-label={`Step ${step} of 5`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`onboarding-dot ${n <= step ? 'active' : ''}`}
              aria-hidden="true"
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 id="onboarding-title">ようこそ</h2>
            <div className="onboarding-content">
              <div style={{ fontSize: 64, textAlign: 'center', margin: '20px 0' }}>🧠</div>
              <p>
                ClassNotes は<strong>研究と思考を加速する Second Brain</strong> です。
                大学院生・研究者が論文・実験・気づきを素材として蓄積し、AI で整理するためのアプリです。
              </p>
              <ul>
                <li>📝 <strong>raw</strong> — 論文ノート・実験ログ・思考素材を書き留める</li>
                <li>🧠 <strong>wiki</strong> — AI が素材を整理し、トピック別に再構成する</li>
                <li>📤 <strong>outputs</strong> — ヘルスチェックレポート・要約として蓄積する</li>
              </ul>
              <p className="help">
                「書く → まとめる → 振り返る」の複利学習ループを回すことで、研究の知識構造が時間とともに洗練されます。
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 id="onboarding-title">Vault を選ぶ</h2>
            <div className="onboarding-content">
              <p>
                Vault とは、すべてのノートが保存されるフォルダです。Obsidian と互換のため、
                既存の Obsidian Vault をそのまま使うこともできます。
              </p>
              <button className="primary" onClick={pickVault}>
                📁 フォルダを選択
              </button>
              {vaultPath && (
                <div className="onboarding-vault-display">
                  ✓ <code>{vaultPath}</code>
                </div>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 id="onboarding-title">AI を設定</h2>
            <div className="onboarding-content">
              <p>QA / Wiki コンパイル / ヘルスチェックで使用する AI を選んでください。</p>
              <AiSettingsPanel />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 id="onboarding-title">サンプルを試す</h2>
            <div className="onboarding-content">
              <p>
                「論文ノート」「研究計画」「統計手法」のサンプルを Vault に投入できます。
              </p>
              <p className="help">
                Transformer 論文の読書ノート、実験ログテンプレート、ベイズ vs 頻度論の概念ノート
                など、研究文脈で実用的な内容です。各ノートは <code>[[wikilink]]</code> で
                相互リンクされているため、すぐに Wiki コンパイルとヘルスチェックを試せます。
                不要な場合は後で削除できます。
              </p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={installSample}
                  onChange={(e) => setInstallSample(e.target.checked)}
                />
                <span>サンプル Vault を投入する</span>
              </label>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h2 id="onboarding-title">準備完了</h2>
            <div className="onboarding-content">
              <p>セットアップが完了しました。これから次の流れで使えます:</p>
              <ol style={{ lineHeight: 1.8 }}>
                <li>📝 論文・実験・気づきをノートに書く</li>
                <li>💬 わからない箇所を選択中AIに質問し、回答を Wiki に保存する</li>
                <li>🧠 週に一度、Wiki をコンパイルしてトピックを整理する</li>
                <li>📤 月に一度、ヘルスチェックで矛盾・盲点を発見する</li>
              </ol>
              <p className="help" style={{ marginTop: 16 }}>
                すべての設定は後から ⚙️ Settings で変更できます。
              </p>
            </div>
          </>
        )}

        <div className="onboarding-actions">
          <button onClick={onSkip}>スキップ</button>
          <span style={{ flex: 1 }} />
          {step > 1 && <button onClick={back}>戻る</button>}
          {step < 5 ? (
            <button className="primary" onClick={next} disabled={!canAdvance}>
              次へ
            </button>
          ) : (
            <button className="primary" onClick={finish}>
              はじめる
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
