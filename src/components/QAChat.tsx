import { useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { emojiForSubject } from '../utils/colors';
import { useDialog } from './common/Dialog';
import { LearningAgentPanel } from './LearningAgentPanel';
import { joinPath } from '../utils/paths';
import {
  DEFAULT_AI_CONFIG,
  aiStatusText,
  aiStatusTone,
  providerDisplayName,
  type AiConfig,
} from './ai/AiSettingsPanel';
import type { ProviderAuthStatus } from '../types';

// HANDOFF AI Coach spec: each assistant message carries a 36px gradient
// avatar with a two-letter monogram, and the composer carries a
// persistent provider pill. Avatar gradients and pill colors are keyed
// off the same provider slug so the visual identity stays consistent
// between the message stream and the composer.
const PROVIDER_VISUALS: Record<
  string,
  { gradient: string; mono: string; label: string }
> = {
  openai: {
    gradient: 'linear-gradient(135deg, #10a37f, #0d8f6f)',
    mono: 'GP',
    label: 'GPT',
  },
  claude: {
    gradient: 'linear-gradient(135deg, #d97757, #b85a3c)',
    mono: 'CL',
    label: 'Claude',
  },
  gemini: {
    gradient: 'linear-gradient(135deg, #4285F4, #2c6cdb)',
    mono: 'GE',
    label: 'Gemini',
  },
  off: {
    gradient: 'linear-gradient(135deg, #8b949e, #6e7681)',
    mono: '–',
    label: 'Off',
  },
};

function providerVisual(provider: string): {
  gradient: string;
  mono: string;
  label: string;
} {
  return PROVIDER_VISUALS[provider] ?? PROVIDER_VISUALS.off;
}

type Turn = { role: 'user' | 'assistant'; content: string };

type Props = {
  vaultPath: string;
  subject: string;
  onOpenSettings: () => void;
  onJumpToWikilink?: (name: string) => void;
  onJumpToFile?: (filePath: string) => void;
};

function parseLog(log: string): Turn[] {
  const turns: Turn[] = [];
  const blocks = log.split(/\n## /).slice(1);
  for (const b of blocks) {
    const newlineIdx = b.indexOf('\n');
    if (newlineIdx < 0) continue;
    const header = b.slice(0, newlineIdx);
    const body = b.slice(newlineIdx + 1).replace(/\n+---\s*$/m, '').trim();
    if (header.endsWith('— Q')) turns.push({ role: 'user', content: body });
    else if (header.endsWith('— A')) turns.push({ role: 'assistant', content: body });
  }
  return turns;
}

export function QAChat({ vaultPath, subject, onOpenSettings, onJumpToWikilink, onJumpToFile }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [aiReadiness, setAiReadiness] = useState('状態確認中');
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dlg, dialogElement] = useDialog();

  useEffect(() => {
    let cancelled = false;
    window.api.qa.readLog(vaultPath, subject).then((log) => {
      if (!cancelled) setTurns(parseLog(log));
    });
    Promise.all([
      window.api.settings.getAiConfig(),
      window.api.settings.getProviderAuthStatus(),
    ])
      .then(([config, statusResult]) => {
        if (cancelled) return;
        const nextConfig: AiConfig = {
          provider: config.provider,
          authMode: config.authMode,
          model: config.model,
          models: { ...DEFAULT_AI_CONFIG.models, ...config.models },
        };
        const activeStatus: ProviderAuthStatus | null =
          nextConfig.provider === 'none' || !statusResult.ok
            ? null
            : statusResult.providers[nextConfig.provider] ?? null;
        const statusText = aiStatusText(nextConfig, activeStatus);
        setAiConfig(nextConfig);
        setAiReadiness(statusText);
        setReady(aiStatusTone(nextConfig, activeStatus) === 'ready');
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setAiReadiness('状態確認に失敗');
        }
      });
    return () => { cancelled = true; };
  }, [vaultPath, subject]);

  useEffect(() => {
    const offChunk = window.api.qa.onChunk(({ text }) => {
      setStreamingText((t) => t + text);
    });
    const offDone = window.api.qa.onDone(({ text, usage }) => {
      setTurns((prev) => [...prev, { role: 'assistant', content: text }]);
      setStreamingText('');
      setStreaming(false);
      setUsage(usage);
    });
    const offErr = window.api.qa.onError(({ error }) => {
      setError(error);
      setStreamingText('');
      setStreaming(false);
    });
    return () => { offChunk(); offDone(); offErr(); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, streamingText]);

  const send = async () => {
    if (!input.trim() || streaming) return;
    if (!ready) {
      const provider = providerDisplayName(aiConfig.provider);
      setError(`現在のAI: ${provider} (${aiReadiness})。まず ⚙️ からAI設定を完了してください`);
      return;
    }
    setError(null);
    setUsage(null);
    const q = input.trim();
    setInput('');
    setTurns((prev) => [...prev, { role: 'user', content: q }]);
    setStreaming(true);
    setStreamingText('');
    await window.api.qa.ask(vaultPath, subject, q);
  };

  return (
    <div className="qa-chat">
      <div className="qa-header">
        <span>{emojiForSubject(subject)}</span>
        <span>{subject}</span>
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
          · 現在のAI: {providerDisplayName(aiConfig.provider)}
        </span>
        <span style={{ flex: 1 }} />
        <LearningAgentPanel
          filePath={joinPath(vaultPath, subject, '_概要.md')}
          kind="lecture"
          label="授業AI"
        />
        {!ready && (
          <button onClick={onOpenSettings}>⚙️ ログイン</button>
        )}
      </div>

      <div className="qa-messages" ref={scrollRef}>
        {turns.length === 0 && !streaming && (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div>
              <div style={{ fontSize: 44, marginBottom: 16 }}>💭</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>
                {subject} について質問してみよう
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360 }}>
                過去の質問・回答は <code>{subject}/qa/log.md</code> に保存され、<br />
                次の質問のコンテキストとして使われます。
              </div>
            </div>
          </div>
        )}
        {turns.map((t, i) => {
          const prevUser =
            t.role === 'assistant' && i > 0 && turns[i - 1].role === 'user'
              ? turns[i - 1]
              : null;
          const saveToWiki = async () => {
            if (!prevUser) return;
            const dateStr = new Date()
              .toISOString()
              .slice(0, 10)
              .replace(/-/g, '');
            const defaultTitle = `${subject}_QA_${dateStr}`;
            const title = await dlg.prompt({
              title: 'Wiki に保存',
              message: 'ページ名を入力してください',
              defaultValue: defaultTitle,
              placeholder: '例: 機械学習_勾配降下法',
              okLabel: '保存',
            });
            if (!title || !title.trim()) return;
            const dateLabel = new Date().toLocaleDateString('ja-JP');
            const content = `# ${title.trim()}\n\n## 質問\n\n${prevUser.content}\n\n## 回答\n\n${t.content}\n\n## 出典\n\n${subject} Q&A ログ (${dateLabel})\n`;
            const r = await window.api.wiki.write(vaultPath, `${title.trim()}.md`, content);
            if (r.ok) {
              await dlg.alert({
                title: '保存しました',
                message: `${title.trim()}.md を Wiki に追加しました`,
                variant: 'success',
              });
            } else {
              await dlg.alert({
                title: '保存に失敗しました',
                message: 'もう一度試してください',
                variant: 'error',
              });
            }
          };
          return (
            <div key={i} className={`qa-bubble ${t.role}`}>
              {t.role === 'assistant' && (
                <div className="qa-role-row">
                  <div
                    className={`qa-avatar qa-avatar-${aiConfig.provider}`}
                    style={{ background: providerVisual(aiConfig.provider).gradient }}
                    aria-label={`${providerVisual(aiConfig.provider).label} の回答`}
                  >
                    {providerVisual(aiConfig.provider).mono}
                  </div>
                  <span className="qa-role">{providerVisual(aiConfig.provider).label}</span>
                  {prevUser && (
                    <button
                      className="qa-save-wiki-btn"
                      onClick={saveToWiki}
                      title="この回答を Wiki に保存"
                    >
                      🧠 Wiki に保存
                    </button>
                  )}
                </div>
              )}
              <div className="qa-body markdown">
                <MarkdownRenderer
                  content={t.content}
                  onJumpToWikilink={onJumpToWikilink}
                  onJumpToFile={onJumpToFile}
                />
              </div>
            </div>
          );
        })}
        {streaming && (
          <div
            className="qa-bubble assistant streaming"
            role="status"
            aria-live="polite"
            aria-atomic="false"
          >
            <div className="qa-role-row">
              <div
                className={`qa-avatar qa-avatar-${aiConfig.provider}`}
                style={{ background: providerVisual(aiConfig.provider).gradient }}
                aria-hidden
              >
                {providerVisual(aiConfig.provider).mono}
              </div>
              <span className="qa-role">{providerVisual(aiConfig.provider).label}</span>
            </div>
            <div className="qa-body markdown">
              {streamingText ? (
                <MarkdownRenderer
                  content={streamingText}
                  onJumpToWikilink={onJumpToWikilink}
                  onJumpToFile={onJumpToFile}
                />
              ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>考えています...</span>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="qa-bubble error" role="alert" aria-live="assertive">
            ⚠️ {error}
          </div>
        )}
        {usage && !streaming && (
          <div className="qa-usage">
            tokens · in {usage.input} · out {usage.output} · cached {usage.cacheRead}
            {usage.costUsdMicro ? ` · ~$${(usage.costUsdMicro / 1_000_000).toFixed(4)}` : ''}
          </div>
        )}
      </div>

      <div className="qa-input-area">
        <div className="qa-input-wrap">
          <span
            className={`qa-provider-pill qa-provider-${aiConfig.provider}`}
            aria-label={`現在の AI プロバイダ: ${providerVisual(aiConfig.provider).label}`}
          >
            <span
              className="qa-provider-dot"
              style={{ background: providerVisual(aiConfig.provider).gradient }}
              aria-hidden
            />
            {providerVisual(aiConfig.provider).label}
          </span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`${subject} について質問...`}
            rows={2}
            disabled={streaming}
          />
          <button className="send-btn" onClick={send} disabled={!input.trim() || streaming}>
            {streaming ? '...' : '送信'}
          </button>
        </div>
        <div className="qa-hint">Ctrl+Enter で送信</div>
      </div>
      {dialogElement}
    </div>
  );
}
