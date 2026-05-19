import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { FileEntry } from '../types';
import { NoteViewer } from './NoteViewer';
import { ImageViewer } from './ImageViewer';
import { LearningAgentPanel } from './LearningAgentPanel';
import { emojiForSubject } from '../utils/colors';
import { parseFrontmatter } from '../utils/frontmatter';
import { DocAIPanel } from './ai/DocAIPanel';
import type { CitationJumpPayload } from './ai/CitationBadge';

const BookViewer = lazy(() => import('./BookViewer').then((m) => ({ default: m.BookViewer })));
const PaperViewer = lazy(() => import('./papers/PaperViewer').then((m) => ({ default: m.PaperViewer })));
const PDFViewer = lazy(() => import('./PDFViewer').then((m) => ({ default: m.PDFViewer })));
const ExperimentEditor = lazy(() =>
  import('./experiment/ExperimentEditor').then((m) => ({ default: m.ExperimentEditor }))
);

const ViewerFallback = () => <div className="empty-state">読み込み中…</div>;

type Props = {
  file: FileEntry | null;
  subject: string | null;
  vaultPath: string;
  onJumpToWikilink: (name: string) => void;
  onJumpToFile: (filePath: string) => void;
  onOpenInObsidian: (filePath?: string) => void;
  resolveWikilink?: (name: string) => string | null;
  onRename?: (oldPath: string, newName: string) => void;
};

export function Viewer({
  file,
  subject,
  vaultPath,
  onJumpToWikilink,
  onJumpToFile,
  onOpenInObsidian,
  resolveWikilink,
  onRename,
}: Props) {
  if (!file) {
    return (
      <div className="viewer">
        <div className="empty-state">
          <div>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📄</div>
            ファイルを選択して表示
          </div>
        </div>
      </div>
    );
  }

  const displayName = file.name.replace(/\.md$/, '');
  const isBook = file.path.toLowerCase().includes(`\\books\\`) ||
    file.path.toLowerCase().includes(`/books/`);

  // Sniff frontmatter once per file to detect `type: experiment` notes.
  // Cheap (the file is already loaded by NoteViewer right after this) and
  // gives us a clean way to route to the structured editor.
  return <ViewerInner
    file={file}
    subject={subject}
    vaultPath={vaultPath}
    isBook={isBook}
    displayName={displayName}
    onJumpToWikilink={onJumpToWikilink}
    onJumpToFile={onJumpToFile}
    onOpenInObsidian={onOpenInObsidian}
    resolveWikilink={resolveWikilink}
    onRename={onRename}
  />;
}

type InnerProps = Props & {
  isBook: boolean;
  displayName: string;
};

function ViewerInner({
  file,
  subject,
  vaultPath,
  isBook,
  displayName,
  onJumpToWikilink,
  onJumpToFile,
  onOpenInObsidian,
  resolveWikilink,
  onRename,
}: InnerProps) {
  const [type, setType] = useState<string | null>(null);
  const [docAIOpen, setDocAIOpen] = useState(false);
  // Signal-based page request: `seq` always increments so PDFViewer re-jumps
  // even when the same `page` is requested consecutively.
  const [pdfPageSignal, setPdfPageSignal] = useState<{ page: number; seq: number } | undefined>(
    undefined
  );

  useEffect(() => {
    if (!file || file.kind !== 'note') {
      setType(null);
      return;
    }
    let cancelled = false;
    window.api.vault.readNote(file.path).then((c) => {
      if (cancelled) return;
      const { meta } = parseFrontmatter(c);
      const t = (meta as { type?: unknown }).type;
      setType(typeof t === 'string' ? t : null);
    });
    return () => {
      cancelled = true;
    };
  }, [file?.path, file]);

  // Reset DocAI panel + page jumps when switching files.
  useEffect(() => {
    setPdfPageSignal(undefined);
  }, [file?.path]);

  const handleJumpToSource = useCallback(
    (payload: CitationJumpPayload) => {
      if (!file) return;
      if (file.kind === 'pdf' && payload.pageNumber != null) {
        const target = payload.pageNumber;
        setPdfPageSignal((prev) => ({ page: target, seq: (prev?.seq ?? 0) + 1 }));
        return;
      }
      // For notes / books, defer to the existing file navigator.
      if (payload.filePath && payload.filePath !== file.path) {
        onJumpToFile(payload.filePath);
      }
    },
    [file, onJumpToFile]
  );

  if (!file) return null;

  const isExperiment = type === 'experiment';
  const isPaper =
    file.path.toLowerCase().includes('\\papers\\') ||
    file.path.toLowerCase().includes('/papers/') ||
    type === 'paper';
  const learningKind = isBook ? 'book' : isPaper ? 'paper' : 'lecture';

  return (
    <div className="viewer">
      <div className="viewer-header">
        <div className="breadcrumb">
          {isBook ? (
            <>
              <span className="breadcrumb-item">
                <span>📚</span>
                <span>読書リスト</span>
              </span>
              <span className="breadcrumb-sep">›</span>
            </>
          ) : subject ? (
            <>
              <span className="breadcrumb-item">
                <span>{emojiForSubject(subject)}</span>
                <span>{subject}</span>
              </span>
              <span className="breadcrumb-sep">›</span>
            </>
          ) : null}
          <span className="breadcrumb-item last">
            <span>{displayName}</span>
          </span>
        </div>
        {(file.kind === 'note' || file.kind === 'pdf') && (
          <button
            className={`subtle${docAIOpen ? ' active' : ''}`}
            onClick={() => setDocAIOpen((v) => !v)}
            title="AI アシスタント (DocAI)"
            aria-pressed={docAIOpen}
          >
            🤖
          </button>
        )}
        {file.kind === 'note' && (
          <LearningAgentPanel
            filePath={file.path}
            kind={learningKind}
            label="AI理解"
          />
        )}
        {file.kind === 'note' && (
          <button
            className="subtle"
            onClick={() => onOpenInObsidian(file.path)}
            title="Obsidian で開く (グラフ・プラグイン用)"
          >
            🕸
          </button>
        )}
        <button
          className="subtle"
          onClick={() => window.api.materials.revealInFolder(file.path)}
          title="フォルダで表示"
        >
          📁
        </button>
        {(file.kind === 'office' || file.kind === 'other') && (
          <button
            className="subtle"
            onClick={() => window.api.materials.openExternal(file.path)}
            title="外部アプリで開く"
          >
            ↗
          </button>
        )}
      </div>
      <div className={`viewer-body${docAIOpen ? ' viewer-body-with-docai' : ''}`}>
        <div className="viewer-body-main">
        {file.kind === 'note' && isBook && (
          <Suspense fallback={<ViewerFallback />}>
            <BookViewer
              key={file.path}
              filePath={file.path}
              vaultPath={vaultPath}
              onJumpToWikilink={onJumpToWikilink}
              onJumpToFile={onJumpToFile}
              resolveWikilink={resolveWikilink}
              onRename={onRename}
            />
          </Suspense>
        )}
        {file.kind === 'note' && !isBook && isPaper && (
          <Suspense fallback={<ViewerFallback />}>
            <PaperViewer
              key={file.path}
              filePath={file.path}
              vaultPath={vaultPath}
              onJumpToWikilink={onJumpToWikilink}
              onJumpToFile={onJumpToFile}
              resolveWikilink={resolveWikilink}
              onRename={onRename}
            />
          </Suspense>
        )}
        {file.kind === 'note' && !isBook && !isPaper && isExperiment && (
          <Suspense fallback={<ViewerFallback />}>
            <ExperimentEditor key={file.path} filePath={file.path} vaultPath={vaultPath} />
          </Suspense>
        )}
        {file.kind === 'note' && !isBook && !isPaper && !isExperiment && (
          <NoteViewer
            key={file.path}
            filePath={file.path}
            vaultPath={vaultPath}
            onJumpToWikilink={onJumpToWikilink}
            onJumpToFile={onJumpToFile}
            resolveWikilink={resolveWikilink}
            onRename={onRename}
          />
        )}
        {file.kind === 'pdf' && (
          <Suspense fallback={<ViewerFallback />}>
            <PDFViewer key={file.path} filePath={file.path} requestedPageSignal={pdfPageSignal} />
          </Suspense>
        )}
        {file.kind === 'image' && <ImageViewer filePath={file.path} />}
        {(file.kind === 'office' || file.kind === 'other') && (
          <div className="office-fallback">
            <div className="icon">📘</div>
            <h3>{file.name}</h3>
            <p>このファイル形式はアプリ内で表示できません。</p>
            <button className="primary" onClick={() => window.api.materials.openExternal(file.path)}>
              外部アプリで開く
            </button>
          </div>
        )}
        </div>
        {docAIOpen && (file.kind === 'note' || file.kind === 'pdf') && (
          <DocAIPanel
            filePath={file.path}
            vaultPath={vaultPath}
            onClose={() => setDocAIOpen(false)}
            onJumpToSource={handleJumpToSource}
          />
        )}
      </div>
    </div>
  );
}
