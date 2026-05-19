// arXiv / DOI 取込ダイアログ。
//
// 入力ボックス 1 つで両方を判別:
//   - "1706.03762" or "arxiv.org/abs/..." → arXiv API
//   - "10.1145/..." or "doi.org/..."     → Crossref API
//
// 取込成功後、オプションで AI 要約を実行 (summarizeAndApply) して
// frontmatter.summary + 本文先頭 3 セクションを自動充填。
// これが Phase 3 機能 #1「論文ノート自動生成」の最低限の形。
import { useState } from 'react';
import type { PaperStatus } from '../../types';
import { basename } from '../../utils/paths';

type Source = 'arxiv' | 'doi' | 'pdf' | 'unknown';

function detectSource(input: string): Source {
  const s = input.trim();
  if (/(arxiv\.org|^arxiv:|^\d{4}\.\d{4,5})/i.test(s)) return 'arxiv';
  if (/(doi\.org|^10\.\d+\/)/i.test(s)) return 'doi';
  return 'unknown';
}

type ManualDraft = {
  title: string;
  authors: string;
  year: string;
  venue: string;
  doi: string;
  arxiv: string;
  bibkey: string;
  status: PaperStatus;
};

function emptyManualDraft(): ManualDraft {
  return {
    title: '',
    authors: '',
    year: '',
    venue: '',
    doi: '',
    arxiv: '',
    bibkey: '',
    status: 'to-read',
  };
}

function splitAuthors(input: string): string[] {
  return input
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function deriveBibkey(authors: string, year: string, title: string): string {
  const firstAuthor = splitAuthors(authors)[0] ?? 'unknown';
  const lastName = firstAuthor.split(/\s+/).pop() ?? 'unknown';
  const yearPart = year.trim() || 'nd';
  const word = (title.match(/[A-Za-z]+/) ?? ['paper'])[0].toLowerCase();
  return `${lastName.toLowerCase()}${yearPart}${word}`.replace(/[^a-z0-9]/g, '');
}

type Props = {
  vaultPath: string;
  onClose: () => void;
  onImported: (filePath: string) => void;
};

export function PaperImportDialog({ vaultPath, onClose, onImported }: Props) {
  const [tab, setTab] = useState<'identifier' | 'pdf' | 'manual'>('identifier');
  const [input, setInput] = useState('');
  const [manual, setManual] = useState<ManualDraft>(emptyManualDraft);
  const [autoSummary, setAutoSummary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'idle' | 'fetching' | 'summarizing' | 'pdf'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const source = detectSource(input);

  const prefillManualFromInput = () => {
    const s = input.trim();
    setManual((draft) => ({
      ...draft,
      doi: source === 'doi' && !draft.doi ? s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : draft.doi,
      arxiv:
        source === 'arxiv' && !draft.arxiv
          ? (s.match(/(\d{4}\.\d{4,5})(v\d+)?/)?.[0] ?? s)
          : draft.arxiv,
    }));
  };

  const pickAndImportPDF = async () => {
    setError(null);
    setSuccess(null);
    const grant = await window.api.papers.pickPDFFile();
    if (!grant) return;
    setBusy(true);
    setStep('pdf');
    const r = await window.api.papers.importFromPDF(vaultPath, grant.token);
    setBusy(false);
    setStep('idle');
    if (!r.ok || !r.filePath) {
      setManual((draft) => ({
        ...draft,
        title: draft.title || basename(grant.fileName).replace(/\.pdf$/i, ''),
      }));
      setError(`${r.error ?? 'PDF 取込に失敗しました'}。手動入力で登録できます。`);
      setTab('manual');
      return;
    }
    setSuccess(`✓ ${r.title ?? 'paper'} を取込みました`);
    setTimeout(() => {
      if (r.filePath) onImported(r.filePath);
    }, 700);
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!input.trim()) {
      setError('arXiv ID または DOI を入力してください');
      return;
    }
    if (source === 'unknown') {
      setError('arXiv ID / DOI としては判定できません。手動入力で登録できます。');
      setManual((draft) => ({ ...draft, title: draft.title || input.trim() }));
      setTab('manual');
      return;
    }
    setBusy(true);
    setStep('fetching');
    const r =
      source === 'arxiv'
        ? await window.api.papers.importFromArxiv(vaultPath, input.trim())
        : await window.api.papers.importFromDOI(vaultPath, input.trim());
    if (!r.ok || !r.filePath) {
      prefillManualFromInput();
      setError(`${r.error ?? '取込に失敗しました'}。手動入力で登録できます。`);
      setBusy(false);
      setStep('idle');
      setTab('manual');
      return;
    }
    setSuccess(`✓ ${r.title ?? 'paper'} を取込みました`);

    if (autoSummary) {
      setStep('summarizing');
      const s = await window.api.ai.summarizeAndApply(r.filePath);
      if (!s.ok) {
        // 取込は成功しているので、要約失敗だけを警告として表示
        setError(`取込成功 / 要約失敗: ${s.error}`);
      } else {
        setSuccess(`✓ 取込 + AI 要約完了: ${s.result.oneLiner}`);
      }
    }
    setBusy(false);
    setStep('idle');
    setTimeout(() => {
      if (r.filePath) onImported(r.filePath);
    }, 700);
  };

  const submitManual = async () => {
    setError(null);
    setSuccess(null);
    const title = manual.title.trim();
    if (!title) {
      setError('タイトルは必須です');
      return;
    }
    const yearNum = manual.year.trim() ? Number(manual.year.trim()) : undefined;
    if (manual.year.trim() && (!yearNum || !Number.isFinite(yearNum))) {
      setError('年は数字で入力してください');
      return;
    }
    setBusy(true);
    const bibkey = manual.bibkey.trim() || deriveBibkey(manual.authors, manual.year, title);
    const r = await window.api.papers.create(vaultPath, {
      title,
      authors: splitAuthors(manual.authors),
      year: yearNum,
      venue: manual.venue.trim() || undefined,
      doi: manual.doi.trim() || undefined,
      arxiv: manual.arxiv.trim() || undefined,
      bibkey: bibkey || undefined,
      status: manual.status,
    });
    setBusy(false);
    if (!r.ok || !r.filePath) {
      setError(r.error ?? '作成に失敗しました');
      return;
    }
    setSuccess(`✓ ${title} を登録しました`);
    setTimeout(() => onImported(r.filePath!), 500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: 520 }}
      >
        <h3>📥 論文を取込む</h3>
        <div className="paper-import-tabs">
          <button
            className={tab === 'identifier' ? 'primary' : ''}
            onClick={() => setTab('identifier')}
          >
            arXiv / DOI
          </button>
          <button
            className={tab === 'pdf' ? 'primary' : ''}
            onClick={() => setTab('pdf')}
          >
            ローカル PDF
          </button>
          <button
            className={tab === 'manual' ? 'primary' : ''}
            onClick={() => setTab('manual')}
          >
            手動入力
          </button>
        </div>

        {tab === 'pdf' ? (
          <>
            <p className="help">
              ローカルの PDF を選択中AIで解析して、タイトル・著者・abstract・主要貢献・手法・限界を
              自動抽出します。ログイン方式ではローカル抽出テキストを使い、画像のみPDFはAPI方式を案内します。
            </p>
            <div className="modal-section">
              <button className="primary" onClick={pickAndImportPDF} disabled={busy}>
                📄 PDF を選択して取込
              </button>
              {step === 'pdf' && (
                <div className="help" style={{ color: 'var(--accent)', marginTop: 8 }}>
                  ⏳ PDF を選択中AIで解析中… (大きな PDF は数分かかります)
                </div>
              )}
              {success && (
                <div className="help" style={{ color: 'var(--good, #4caf50)', marginTop: 8 }}>
                  {success}
                </div>
              )}
              {error && (
                <div className="help" style={{ color: 'var(--danger)', marginTop: 8 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={onClose} disabled={busy}>
                閉じる
              </button>
            </div>
            {/* Early return for PDF tab so we don't render the identifier UI below */}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(null as any)}
          </>
        ) : tab === 'manual' ? (
          <>
            <p className="help">
              外部APIが使えない場合でも、最小限のメタデータから論文ノートを作成できます。
            </p>
            <div className="paper-manual-grid">
              <div className="modal-section paper-manual-wide">
                <label>タイトル *</label>
                <input
                  value={manual.title}
                  onChange={(e) => setManual((d) => ({ ...d, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="modal-section paper-manual-wide">
                <label>著者 (カンマ区切り)</label>
                <input
                  value={manual.authors}
                  onChange={(e) => setManual((d) => ({ ...d, authors: e.target.value }))}
                  placeholder="Vaswani, Shazeer, Parmar"
                />
              </div>
              <div className="modal-section">
                <label>年</label>
                <input
                  value={manual.year}
                  onChange={(e) => setManual((d) => ({ ...d, year: e.target.value }))}
                  placeholder="2017"
                />
              </div>
              <div className="modal-section">
                <label>ステータス</label>
                <select
                  value={manual.status}
                  onChange={(e) =>
                    setManual((d) => ({ ...d, status: e.target.value as PaperStatus }))
                  }
                >
                  <option value="to-read">to-read</option>
                  <option value="reading">reading</option>
                  <option value="read">read</option>
                  <option value="cited">cited</option>
                  <option value="skimmed">skimmed</option>
                </select>
              </div>
              <div className="modal-section paper-manual-wide">
                <label>学会 / 誌</label>
                <input
                  value={manual.venue}
                  onChange={(e) => setManual((d) => ({ ...d, venue: e.target.value }))}
                  placeholder="NeurIPS / Nature / arXiv"
                />
              </div>
              <div className="modal-section">
                <label>DOI</label>
                <input
                  value={manual.doi}
                  onChange={(e) => setManual((d) => ({ ...d, doi: e.target.value }))}
                />
              </div>
              <div className="modal-section">
                <label>arXiv ID</label>
                <input
                  value={manual.arxiv}
                  onChange={(e) => setManual((d) => ({ ...d, arxiv: e.target.value }))}
                  placeholder="1706.03762"
                />
              </div>
              <div className="modal-section paper-manual-wide">
                <label>引用キー</label>
                <input
                  value={manual.bibkey}
                  onChange={(e) => setManual((d) => ({ ...d, bibkey: e.target.value }))}
                  placeholder={deriveBibkey(manual.authors, manual.year, manual.title)}
                />
                <div className="help">空欄なら自動生成します。</div>
              </div>
            </div>
            {success && (
              <div className="help" style={{ color: 'var(--good, #4caf50)' }}>
                {success}
              </div>
            )}
            {error && (
              <div className="help" style={{ color: 'var(--danger)' }}>
                ⚠️ {error}
              </div>
            )}
            <div className="modal-actions">
              <button onClick={onClose} disabled={busy}>
                閉じる
              </button>
              <button
                className="primary"
                onClick={submitManual}
                disabled={busy || !manual.title.trim()}
              >
                {busy ? '作成中…' : '論文ノートを作成'}
              </button>
            </div>
          </>
        ) : (
        <>
        <p className="help">
          arXiv ID または DOI を貼り付けると、自動でメタデータ (タイトル・著者・年・venue) を取得して
          <code> Papers/</code> に保存します。
        </p>

        <div className="modal-section">
          <label>arXiv ID または DOI</label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="1706.03762  /  arxiv.org/abs/1706.03762  /  10.1145/3292500.3330701"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {input && (
            <div className="help" style={{ marginTop: 4 }}>
              検出: <strong>{source === 'arxiv' ? 'arXiv' : source === 'doi' ? 'DOI (Crossref)' : '未確定'}</strong>
            </div>
          )}
        </div>

        <div className="modal-section">
          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontWeight: 400,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={autoSummary}
              onChange={(e) => setAutoSummary(e.target.checked)}
              disabled={busy}
            />
            <span>取込後に AI で 3 パス読法要約を実行する</span>
          </label>
          <div className="help">
            (チェックを入れると選択中AIの利用コストが発生する場合があります。Settings の Provider 設定に従います)
          </div>
        </div>

        {step === 'fetching' && (
          <div className="help" style={{ color: 'var(--accent)' }}>
            ⏳ {source === 'arxiv' ? 'arXiv' : 'Crossref'} からメタデータを取得中…
          </div>
        )}
        {step === 'summarizing' && (
          <div className="help" style={{ color: 'var(--accent)' }}>
            🤖 選択中AIで要約中… (30 秒程度)
          </div>
        )}
        {success && (
          <div className="help" style={{ color: 'var(--good, #4caf50)' }}>
            {success}
          </div>
        )}
        {error && (
          <div className="help" style={{ color: 'var(--danger)' }}>
            ⚠️ {error}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            閉じる
          </button>
          <button
            className="primary"
            onClick={submit}
            disabled={busy || !input.trim() || source === 'unknown'}
          >
            {busy ? '⏳ 取込中…' : '取込'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
