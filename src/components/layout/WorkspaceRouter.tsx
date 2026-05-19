// WorkspaceRouter — the viewMode-driven main area renderer.
//
// Extracted from App.tsx, where it was a 240-line nested ternary chain
// switching between Timetable / DailyView / GraphView / BooksView / MemosView
// / WikiView / OutputsView / PapersView / ProgressDashboard / PluginView and
// the default subject workspace. The component accepts a single typed options
// object so App.tsx isn't drowned in 25 prop assignments.
import { lazy, Suspense, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react';
import { Timetable } from '../Timetable';
import { DailyView } from '../DailyView';
import { FileList, type SubjectView } from '../FileList';
import { Viewer } from '../Viewer';
import { ErrorBoundary } from '../ErrorBoundary';
import { SubjectViewTabs } from './SubjectViewTabs';
import { PluginView, type ActivePluginView } from '../plugins/PluginView';
import type { FileEntry, PluginManifest } from '../../types';
import type { ViewMode } from '../../state/appReducer';
import { basename } from '../../utils/paths';

const GraphView = lazy(() => import('../GraphView').then((m) => ({ default: m.GraphView })));
const GalleryView = lazy(() => import('../../views/GalleryView').then((m) => ({ default: m.GalleryView })));
const CanvasView = lazy(() => import('../../views/CanvasView').then((m) => ({ default: m.CanvasView })));
const QAChat = lazy(() => import('../QAChat').then((m) => ({ default: m.QAChat })));
const BooksView = lazy(() => import('../BooksView').then((m) => ({ default: m.BooksView })));
const MemosView = lazy(() => import('../MemosView').then((m) => ({ default: m.MemosView })));
const WikiView = lazy(() => import('../WikiView').then((m) => ({ default: m.WikiView })));
const OutputsView = lazy(() => import('../OutputsView').then((m) => ({ default: m.OutputsView })));
const PapersView = lazy(() => import('../papers/PapersView').then((m) => ({ default: m.PapersView })));
const ProgressDashboard = lazy(() =>
  import('../progress/ProgressDashboard').then((m) => ({ default: m.ProgressDashboard }))
);
const DatabaseView = lazy(() => import('../DatabaseView').then((m) => ({ default: m.DatabaseView })));

const LazyFallback: ComponentType = () => (
  <div className="empty-state" style={{ padding: '40px 20px' }}>
    <div style={{ color: 'var(--text-tertiary)' }}>読み込み中…</div>
  </div>
);

export type WorkspaceRouterProps = {
  viewMode: ViewMode;
  vaultPath: string;
  // Data
  subjects: string[];
  files: { notes: FileEntry[]; materials: FileEntry[] };
  reloadKey: number;
  plugins: PluginManifest[];
  activePluginView: ActivePluginView | null;
  // Navigation state
  activeFile: FileEntry | null;
  activeSubject: string | null;
  virtualFile: { kind: 'qa' } | null;
  subjectView: SubjectView;
  setSubjectView: (v: SubjectView) => void;
  subjectPanelWidth: number;
  startSubjectPanelResize: (e: ReactPointerEvent<HTMLDivElement>) => void;
  // Actions
  setActiveFile: (f: FileEntry | null) => void;
  setVirtualFile: (v: { kind: 'qa' } | null) => void;
  bumpReload: () => void;
  // File navigation handlers
  handleJumpToWikilink: (name: string) => void;
  handleJumpToFile: (subject: string, filePath: string) => Promise<void>;
  handleJumpFromTimetable: (subject: string) => void;
  handleOpenBook: (filePath: string) => void;
  handleOpenObsidian: (filePath?: string) => void;
  openFileByPath: (filePath: string) => Promise<void>;
  resolveWikilink: (name: string) => string | null;
  handleRenameNote: (oldPath: string, newName: string) => Promise<void>;
  handleFileSelect: (file: FileEntry) => Promise<void>;
  handleSelectVirtual: (kind: 'qa' | 'overview') => void;
  // Other handlers
  setShowSettings: (v: boolean) => void;
};

export function WorkspaceRouter(props: WorkspaceRouterProps) {
  const {
    viewMode,
    vaultPath,
    subjects,
    files,
    reloadKey,
    plugins,
    activePluginView,
    activeFile,
    activeSubject,
    virtualFile,
    subjectView,
    setSubjectView,
    subjectPanelWidth,
    startSubjectPanelResize,
    setActiveFile,
    setVirtualFile,
    bumpReload,
    handleJumpToWikilink,
    handleJumpToFile,
    handleJumpFromTimetable,
    handleOpenBook,
    handleOpenObsidian,
    openFileByPath,
    resolveWikilink,
    handleRenameNote,
    handleFileSelect,
    handleSelectVirtual,
    setShowSettings,
  } = props;

  if (viewMode === 'timetable') {
    return (
      <div className="main-area">
        <ErrorBoundary label="時間割">
          <Timetable
            vaultPath={vaultPath}
            subjects={subjects}
            onJumpToSubject={handleJumpFromTimetable}
          />
        </ErrorBoundary>
      </div>
    );
  }
  if (viewMode === 'daily') {
    return (
      <div className="main-area">
        <ErrorBoundary label="今日のノート">
          <DailyView vaultPath={vaultPath} onJumpToFile={handleJumpToFile} />
        </ErrorBoundary>
      </div>
    );
  }
  if (viewMode === 'graph') {
    return (
      <div className="main-area">
        <ErrorBoundary label="グラフビュー">
          <Suspense fallback={<LazyFallback />}>
            <GraphView vaultPath={vaultPath} onJumpToFile={openFileByPath} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }
  if (viewMode === 'books') {
    return (
      <div className="main-area">
        <ErrorBoundary label="読書リスト">
          <Suspense fallback={<LazyFallback />}>
            <BooksView vaultPath={vaultPath} onOpenBook={handleOpenBook} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }
  if (viewMode === 'books-detail') {
    return (
      <>
        <ErrorBoundary label="読書リスト">
          <Suspense fallback={<LazyFallback />}>
            <BooksView
              vaultPath={vaultPath}
              onOpenBook={handleOpenBook}
              activeFilePath={activeFile?.path}
            />
          </Suspense>
        </ErrorBoundary>
        <Viewer
          file={activeFile}
          subject={null}
          vaultPath={vaultPath}
          onJumpToWikilink={handleJumpToWikilink}
          onJumpToFile={openFileByPath}
          onOpenInObsidian={handleOpenObsidian}
          resolveWikilink={resolveWikilink}
          onRename={handleRenameNote}
        />
      </>
    );
  }
  if (viewMode === 'memos') {
    return (
      <div className="main-area">
        <ErrorBoundary label="メモ">
          <Suspense fallback={<LazyFallback />}>
            <MemosView
              vaultPath={vaultPath}
              onJumpToWikilink={handleJumpToWikilink}
              onJumpToFile={openFileByPath}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }
  if (viewMode === 'wiki') {
    return (
      <ErrorBoundary label="Wiki">
        <Suspense fallback={<LazyFallback />}>
          <WikiView
            vaultPath={vaultPath}
            onJumpToWikilink={handleJumpToWikilink}
            onOpenFile={openFileByPath}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }
  if (viewMode === 'outputs') {
    return (
      <ErrorBoundary label="Outputs">
        <Suspense fallback={<LazyFallback />}>
          <OutputsView vaultPath={vaultPath} onOpenFile={openFileByPath} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  if (viewMode === 'papers') {
    return (
      <ErrorBoundary label="論文・文献">
        <Suspense fallback={<LazyFallback />}>
          <PapersView
            vaultPath={vaultPath}
            activeFilePath={activeFile?.path}
            reloadKey={reloadKey}
            onOpenFile={openFileByPath}
            onChanged={bumpReload}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }
  if (viewMode === 'progress') {
    return (
      <ErrorBoundary label="研究進捗ダッシュボード">
        <Suspense fallback={<LazyFallback />}>
          <ProgressDashboard
            vaultPath={vaultPath}
            reloadKey={reloadKey}
            onOpenFile={openFileByPath}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }
  if (viewMode === 'plugin') {
    return (
      <ErrorBoundary label="Plugin">
        <PluginView vaultPath={vaultPath} plugins={plugins} active={activePluginView} />
      </ErrorBoundary>
    );
  }

  // Default: subject workspace (notes/files/AI split panel).
  return (
    <div
      className="subject-workspace"
      style={{ ['--subject-panel-width' as string]: `${subjectPanelWidth}px` }}
    >
      <div className="subject-main-pane">
        {virtualFile?.kind === 'qa' && activeSubject ? (
          <Suspense fallback={<LazyFallback />}>
            <QAChat
              vaultPath={vaultPath}
              subject={activeSubject}
              onOpenSettings={() => setShowSettings(true)}
              onJumpToWikilink={handleJumpToWikilink}
              onJumpToFile={openFileByPath}
            />
          </Suspense>
        ) : (
          <Viewer
            file={activeFile}
            subject={activeSubject}
            vaultPath={vaultPath}
            onJumpToWikilink={handleJumpToWikilink}
            onJumpToFile={openFileByPath}
            onOpenInObsidian={handleOpenObsidian}
            resolveWikilink={resolveWikilink}
            onRename={handleRenameNote}
          />
        )}
      </div>

      <aside className="subject-side-panel" aria-label="ノート表示パネル">
        <div
          className="subject-panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="ノート表示パネルの幅を変更"
          onPointerDown={startSubjectPanelResize}
        />
        <div className="subject-panel-header">
          <SubjectViewTabs view={subjectView} onChange={setSubjectView} />
        </div>
        <div className="subject-panel-content">
          {subjectView === 'list' ? (
            <FileList
              vaultPath={vaultPath}
              subject={activeSubject}
              files={files}
              activeFile={activeFile}
              virtualFile={virtualFile}
              onSelect={handleFileSelect}
              onSelectVirtual={handleSelectVirtual}
              onChanged={bumpReload}
              onOpenInObsidian={(filePath) => {
                if (!vaultPath) return;
                const vaultName = basename(vaultPath) || 'Vault';
                const rel = filePath.startsWith(vaultPath)
                  ? filePath
                      .slice(vaultPath.length)
                      .replace(/^[\\/]/, '')
                      .replace(/\\/g, '/')
                  : '';
                if (!rel) return;
                const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}`;
                window.api.materials.openUrl(uri);
              }}
            />
          ) : subjectView === 'gallery' && activeSubject ? (
            <Suspense fallback={<LazyFallback />}>
              <GalleryView
                vaultPath={vaultPath}
                subject={activeSubject}
                reloadKey={reloadKey}
                onOpenFile={(filePath, kind) => {
                  if (kind === 'office' || kind === 'other') {
                    window.api.materials.openExternal(filePath);
                    return;
                  }
                  setVirtualFile(null);
                  setActiveFile({
                    name: basename(filePath),
                    path: filePath,
                    kind: kind as FileEntry['kind'],
                    ext: '',
                    mtime: Date.now(),
                  });
                }}
                onChanged={bumpReload}
              />
            </Suspense>
          ) : subjectView === 'database' && activeSubject ? (
            <Suspense fallback={<LazyFallback />}>
              <DatabaseView
                vaultPath={vaultPath}
                subject={activeSubject}
                reloadKey={reloadKey}
                onOpenFile={openFileByPath}
              />
            </Suspense>
          ) : subjectView === 'graph' && activeSubject ? (
            <Suspense fallback={<LazyFallback />}>
              <GraphView vaultPath={vaultPath} onJumpToFile={openFileByPath} />
            </Suspense>
          ) : subjectView === 'board' && activeSubject ? (
            <Suspense fallback={<LazyFallback />}>
              <CanvasView
                vaultPath={vaultPath}
                subject={activeSubject}
                reloadKey={reloadKey}
                onOpenFile={(filePath, kind) => {
                  if (kind === 'office' || kind === 'other') {
                    window.api.materials.openExternal(filePath);
                    return;
                  }
                  setVirtualFile(null);
                  setActiveFile({
                    name: basename(filePath),
                    path: filePath,
                    kind: kind as FileEntry['kind'],
                    ext: '',
                    mtime: Date.now(),
                  });
                }}
              />
            </Suspense>
          ) : (
            <div className="empty-state">表示する科目を選択してください</div>
          )}
        </div>
      </aside>
    </div>
  );
}
