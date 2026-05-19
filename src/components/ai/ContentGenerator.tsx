// ContentGenerator — modal form for the docai:generate flow.
//
// Lets the user pick a format (email / presentation / report / memo / general)
// and an instruction, then calls window.api.docai.generate(...) and displays
// the result with copy / save-to-note actions.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocAICitation } from '../../types';
import type { CitationJumpPayload } from './CitationBadge';
import { CitationBadge } from './CitationBadge';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { useFocusTrap } from '../../utils/focusTrap';

export type ContentFormat = 'email' | 'presentation' | 'report' | 'memo' | 'general';

type Props = {
  filePath: string;
  filePathBySource?: Record<string, string>;
  onClose: () => void;
  onJumpToSource?: (payload: CitationJumpPayload) => void;
};

const FORMAT_OPTIONS: Array<{ id: ContentFormat; icon: string; label: string; example: string }> = [
  { id: 'email', icon: '✉️', label: 'メール文面', example: '指導教員に進捗報告のメールを書いて' },
  { id: 'presentation', icon: '🎤', label: '発表原稿', example: '10分の発表原稿を作成。スライド構成も併記。' },
  { id: 'report', icon: '📄', label: 'レポート構成案', example: '5章構成のレポート骨子を提案して' },
  { id: 'memo', icon: '📋', label: '議事録 / メモ', example: '箇条書きとアクションアイテム付きでまとめて' },
  { id: 'general', icon: '✏️', label: '自由入力', example: '' },
];

type GenerateResult = {
  content: string;
  format: string;
  citations: DocAICitation[];
  wordCount: number;
};

export function ContentGenerator({
  filePath,
  filePathBySource,
  onClose,
  onJumpToSource,
}: Props) {
  const [format, setFormat] = useState<ContentFormat>('email');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const example = FORMAT_OPTIONS.find((o) => o.id === format)?.example ?? '';

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const r = await window.api.docai.generate(filePath, format, instruction);
      if (r.ok && r.result) {
        setResult({
          content: r.result.content,
          format: r.result.format,
          citations: r.result.citations,
          wordCount: r.result.wordCount,
        });
      } else {
        setError(r.error ?? 'コンテンツ生成に失敗しました');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [filePath, format, instruction]);

  const copy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore — clipboard rejected (focus / permissions).
    }
  }, [result]);

  return (
    <div
      className="docai-generator-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="コンテンツ生成"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="docai-generator"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <header className="docai-generator-header">
          <span className="docai-generator-title">✉️ コンテンツ生成</span>
          <button
            type="button"
            className="docai-generator-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </header>

        <div className="docai-generator-formats" role="radiogroup" aria-label="フォーマット">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={format === opt.id}
              className={`docai-generator-format${format === opt.id ? ' active' : ''}`}
              onClick={() => setFormat(opt.id)}
            >
              <span className="docai-generator-format-icon">{opt.icon}</span>
              <span className="docai-generator-format-label">{opt.label}</span>
            </button>
          ))}
        </div>

        <label className="docai-generator-instruction-label">
          指示
          <textarea
            ref={textareaRef}
            className="docai-generator-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={example || '指示を入力…'}
            rows={4}
            aria-label="生成指示"
            disabled={busy}
          />
        </label>

        {error && (
          <div className="docai-generator-error" role="alert">
            ⚠️ {error}
          </div>
        )}

        {result && (
          <div className="docai-generator-result">
            <div className="docai-generator-result-meta">
              <span>📝 {result.wordCount} 語</span>
              <button type="button" onClick={copy} className="docai-generator-copy">
                {copied ? '✓ コピーしました' : '📋 コピー'}
              </button>
            </div>
            <div className="docai-generator-result-body docai-generator-result-markdown">
              <MarkdownRenderer
                content={result.content}
                citations={result.citations}
                citationFilePathBySource={filePathBySource}
                onJumpToSource={onJumpToSource}
              />
            </div>
            {result.citations.length > 0 && (
              <div className="docai-generator-citations">
                <div className="docai-generator-citations-label">出典:</div>
                {result.citations.map((c) => (
                  <CitationBadge
                    key={c.id}
                    id={c.id}
                    citations={result.citations}
                    filePathBySource={filePathBySource}
                    onJump={onJumpToSource}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="docai-generator-footer">
          <button
            type="button"
            className="docai-generator-cancel"
            onClick={onClose}
            disabled={busy}
          >
            閉じる
          </button>
          <button
            type="button"
            className="docai-generator-submit"
            onClick={generate}
            disabled={busy || !instruction.trim()}
          >
            {busy ? '生成中…' : '生成'}
          </button>
        </footer>
      </div>
    </div>
  );
}
