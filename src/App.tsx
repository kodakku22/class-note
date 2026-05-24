import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Sidebar } from './components/Sidebar';
import { VaultPicker } from './components/VaultPicker';
import { CommandPalette } from './components/CommandPalette';
import { TypeSelector } from './components/TypeSelector';
import { IconRail } from './components/layout/IconRail';
import { RailCustomizeDialog } from './components/layout/RailCustomizeDialog';
import { AppTitleBar } from './components/layout/AppTitleBar';
import { WorkspaceRouter } from './components/layout/WorkspaceRouter';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useRailConfig } from './hooks/useRailConfig';
import { useFileNavigation } from './hooks/useFileNavigation';
import { useWorkspaceLoader } from './hooks/useWorkspaceLoader';
import { useCommandPalette } from './hooks/useCommandPalette';
import { FAQPanel } from './components/help/FAQPanel';
import { WebClipDialog } from './components/skills/WebClipDialog';
import { CitationPicker } from './components/papers/CitationPicker';

// Lazy-loaded modals — these only render in response to a user action
// (Settings cog, first-launch wizard) so excluding them from the initial
// bundle measurably shrinks startup. Each lazy import becomes its own
// Vite chunk; React Suspense paints null while the chunk streams in.
const Settings = lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
);
const OnboardingWizard = lazy(() =>
  import('./components/onboarding/OnboardingWizard').then((m) => ({
    default: m.OnboardingWizard,
  }))
);
import type { ActivePluginView } from './components/plugins/PluginView';
import { insertAtActiveCaret } from './state/activeEditor';
import { applyTheme } from './utils/theme';

const SUBJECT_PANEL_WIDTH_KEY = 'classnotes:subjectPanelWidth';
// HANDOFF grid spec: 72px rail · 268px sidebar · 336px subject panel · 1fr viewer.
const SUBJECT_PANEL_DEFAULT_WIDTH = 336;
const SUBJECT_PANEL_MIN_WIDTH = 280;
const SUBJECT_PANEL_MAX_WIDTH = 760;

function clampSubjectPanelWidth(value: number): number {
  return Math.min(SUBJECT_PANEL_MAX_WIDTH, Math.max(SUBJECT_PANEL_MIN_WIDTH, Math.round(value)));
}

import type { RecentEntry } from './components/Sidebar';
import { useVault } from './hooks/useVault';
import { useAppNav } from './state/useAppNav';
import { basename } from './utils/paths';
import type { FileEntry, LinkTarget, SearchHit } from './types';
import { OBJECT_TYPES, DEFAULT_TEMPLATES, type ObjectTypeId } from './types/objectTypes';
import type { SubjectView } from './components/FileList';

type VirtualFile = { kind: 'qa' } | null;

export function App() {
  const { vaultPath, setVaultPath, clearVaultPath, recentVaults, removeRecent } = useVault();

  // Navigation state lives in a single reducer (src/state/appReducer.ts) so
  // that view transitions are canonical: opening a Books-detail file always
  // clears activeSubject; opening QA always clears activeFile; etc. Before
  // this, those invariants were maintained by ~9 scattered setActiveSubject(null)
  // calls and were a regular source of bugs.
  //
  // We expose legacy-style setX adapters so the rest of this file (which
  // was written against useState) doesn't need to be rewritten in one pass.
  const nav = useAppNav();
  const { activeSubject, activeFile, virtualFile, viewMode } = nav.state;
  const setActiveSubject = useCallback(
    (s: string | null) => {
      if (s === null) {
        nav.clearSubject();
        return;
      }
      nav.openSubject(s);
    },
    [nav]
  );
  const setActiveFile = useCallback(
    (f: FileEntry | null) => {
      if (f === null) nav.clearFile();
      else nav.openFile(f);
    },
    [nav]
  );
  const setVirtualFile = useCallback(
    (v: VirtualFile) => {
      if (v?.kind === 'qa') nav.openQA();
      else nav.clearFile();
    },
    [nav]
  );
  const setViewMode = nav.setViewMode;
  const rail = useRailConfig({ viewMode, setViewMode });
  const workspace = useWorkspaceLoader({ vaultPath, activeSubject, setActiveSubject });
  const { subjects, files, favorites, plugins, reloadKey, linkTargetsRef } = workspace;
  const setReloadKey = useCallback(
    (fn: (k: number) => number) => {
      // Compat shim: useFileNavigation still expects a setter-style API.
      // The hook bumps reloadKey internally, so we just trigger a bump.
      void fn;
      workspace.bumpReload();
    },
    [workspace]
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWebClip, setShowWebClip] = useState(false);
  const [showCitation, setShowCitation] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showRailCustomize, setShowRailCustomize] = useState(false);
  const [activePluginView, setActivePluginView] = useState<ActivePluginView | null>(null);
  const [subjectView, setSubjectView] = useState<SubjectView>(() => {
    const saved = localStorage.getItem('classnotes:subjectView');
    if (
      saved === 'list' ||
      saved === 'gallery' ||
      saved === 'database' ||
      saved === 'board' ||
      saved === 'graph'
    ) return saved;
    return 'list';
  });
  const [subjectPanelWidth, setSubjectPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SUBJECT_PANEL_WIDTH_KEY));
    return Number.isFinite(saved) && saved > 0
      ? clampSubjectPanelWidth(saved)
      : SUBJECT_PANEL_DEFAULT_WIDTH;
  });
  const [recents, setRecents] = useState<RecentEntry[]>(() => {
    try {
      const raw = localStorage.getItem('classnotes:recents');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  // First-launch: show the OnboardingWizard if the user hasn't completed it
  // and there's no recent vault. The wizard handles vault selection + AI
  // provider configuration in one flow.
  // Theme is applied separately below — keep IPC reads single-purpose so
  // re-running this effect on vaultPath changes doesn't redundantly hit
  // applyTheme().
  useEffect(() => {
    let cancelled = false;
    window.api.settings.get().then((s) => {
      if (cancelled) return;
      const completed = s.onboardingCompleted ?? false;
      if (!completed && !vaultPath) {
        setShowOnboarding(true);
      }
    });
    return () => { cancelled = true; };
  }, [vaultPath]);

  const handleOnboardingComplete = useCallback(
    async (cfg: {
      vaultPath: string;
      installSample: boolean;
    }) => {
      await window.api.settings.set({ onboardingCompleted: true });
      if (cfg.installSample) {
        await window.api.vault.installSample(cfg.vaultPath);
      }
      setVaultPath(cfg.vaultPath);
      setShowOnboarding(false);
    },
    [setVaultPath]
  );

  useEffect(() => {
    localStorage.setItem('classnotes:subjectView', subjectView);
  }, [subjectView]);

  useEffect(() => {
    localStorage.setItem(SUBJECT_PANEL_WIDTH_KEY, String(subjectPanelWidth));
  }, [subjectPanelWidth]);

  useEffect(() => {
    localStorage.setItem('classnotes:recents', JSON.stringify(recents));
  }, [recents]);

  const recordRecent = useCallback((file: FileEntry, subject?: string) => {
    setRecents((prev) => {
      const next: RecentEntry[] = [
        { filePath: file.path, fileName: file.name, subject },
        ...prev.filter((r) => r.filePath !== file.path),
      ].slice(0, 20);
      return next;
    });
  }, []);

  // Clear plugin view selection when the workspace closes.
  useEffect(() => {
    if (!vaultPath) setActivePluginView(null);
  }, [vaultPath]);

  // Apply persisted theme on startup. main.tsx already applied the
  // localStorage-cached theme synchronously; this resolves the
  // authoritative value from Electron settings and re-applies if the
  // user's saved choice differs from the cache.
  useEffect(() => {
    window.api.settings.get().then((s) => {
      applyTheme((s.theme as 'light' | 'dark') ?? 'dark');
    });
  }, []);

  const handleNewNote = useCallback(() => {
    if (!vaultPath) return;
    setShowTypeSelector(true);
  }, [vaultPath]);

  const handlePickType = useCallback(
    async (id: ObjectTypeId) => {
      setShowTypeSelector(false);
      if (!vaultPath) return;
      const def = OBJECT_TYPES.find((t) => t.id === id);
      if (!def) return;
      const date = new Date();
      const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const timePart = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
      const title = `${datePart}-${timePart}-${id}`;
      const defaultBody = DEFAULT_TEMPLATES[def.templateName] ?? DEFAULT_TEMPLATES.lecture;
      const { filePath } = await window.api.vault.createTypedNote(
        vaultPath,
        id === 'memo' || id === 'free' ? null : activeSubject,
        def.templateName,
        title,
        defaultBody
      );
      setReloadKey((k) => k + 1);
      setVirtualFile(null);
      setViewMode(id === 'memo' ? 'memos' : 'subject');
      setActiveFile({
        name: basename(filePath),
        path: filePath,
        kind: 'note',
        ext: '.md',
        mtime: Date.now(),
      });
    },
    [vaultPath, activeSubject, setActiveFile, setReloadKey, setViewMode, setVirtualFile]
  );

  // Global keyboard shortcuts (extracted hook)
  useKeyboardShortcuts({
    vaultPath,
    showPalette,
    showSettings,
    showTypeSelector,
    setShowPalette,
    setShowSettings,
    setShowTypeSelector,
    setShowWebClip,
    setShowCitation,
    setViewMode,
    setSubjectView,
    handleNewNote,
  });

  const fileNav = useFileNavigation({
    vaultPath,
    activeSubject,
    activeFile,
    linkTargetsRef,
    setActiveSubject,
    setActiveFile,
    setVirtualFile,
    setViewMode,
    setReloadKey,
    recordRecent,
  });
  const {
    openFileByPath,
    handleJumpToWikilink,
    resolveWikilink,
    handleRenameNote,
    handleFileSelect,
    handleSelectSubject,
    handleSelectVirtual,
    handleJumpToFile,
    handleJumpFromTimetable,
    handleOpenBook,
    handleOpenObsidian,
  } = fileNav;

  const handlePaletteSelectTarget = (t: LinkTarget) => {
    openFileByPath(t.filePath);
  };

  const handlePaletteSelectHit = (h: SearchHit) => {
    if (h.subject) {
      handleJumpToFile(h.subject, h.filePath);
    } else {
      openFileByPath(h.filePath);
    }
  };

  const openPluginView = useCallback(
    (pluginId: string, viewId: string) => {
      setActivePluginView({ pluginId, viewId });
      setViewMode('plugin');
    },
    [setViewMode]
  );

  const paletteCommands = useCommandPalette({
    vaultPath,
    activeSubject,
    activeFile,
    plugins,
    linkTargetsRef,
    handleNewNote,
    openFileByPath,
    openPluginView,
    setViewMode,
    setSubjectView,
    bumpReload: workspace.bumpReload,
    setShowFAQ,
    setShowWebClip,
    setShowCitation,
    setShowSettings,
  });



  const startSubjectPanelResize = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = subjectPanelWidth;
      document.body.classList.add('resizing-subject-panel');

      const onPointerMove = (event: PointerEvent) => {
        setSubjectPanelWidth(clampSubjectPanelWidth(startWidth - (event.clientX - startX)));
      };
      const onPointerUp = () => {
        document.body.classList.remove('resizing-subject-panel');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [subjectPanelWidth]
  );

  if (showOnboarding) {
    return (
      <div className="discord-window">
        <AppTitleBar label="セットアップ" canUseWorkspaceActions={false} />
        <div className="discord-window-content">
          <Suspense fallback={null}>
            <OnboardingWizard
              onComplete={handleOnboardingComplete}
              onSkip={async () => {
                await window.api.settings.set({ onboardingCompleted: true });
                setShowOnboarding(false);
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  if (!vaultPath) {
    return (
      <div className="discord-window">
        <AppTitleBar label="Vaultを選択" canUseWorkspaceActions={false} />
        <div className="discord-window-content">
          <VaultPicker
            onPicked={setVaultPath}
            recentVaults={recentVaults}
            onRemoveRecent={removeRecent}
          />
        </div>
      </div>
    );
  }

  const isBooksDetail = viewMode === 'books-detail';
  const appClassName = [
    'app',
    isBooksDetail ? 'books-detail-mode' : '',
    viewMode === 'subject' ? 'subject-workspace-mode' : '',
  ].filter(Boolean).join(' ');
  const titlebarLabel =
    viewMode === 'subject'
      ? activeSubject ? `# ${activeSubject}` : 'Channels'
      : viewMode === 'daily' ? '今日'
      : viewMode === 'timetable' ? '時間割'
      : viewMode === 'books' || viewMode === 'books-detail' ? '読書'
      : viewMode === 'papers' ? '論文・文献'
      : viewMode === 'memos' ? 'メモ'
      : viewMode === 'wiki' ? 'Wiki'
      : viewMode === 'outputs' ? 'Outputs'
      : viewMode === 'progress' ? '研究進捗'
      : viewMode === 'graph' ? 'グラフ'
      : viewMode === 'plugin'
        ? plugins.find((plugin) => plugin.id === activePluginView?.pluginId)?.name ?? 'Plugin'
      : 'ClassNotes';

  return (
    <div className="discord-window">
      <AppTitleBar
        label={titlebarLabel}
        canUseWorkspaceActions={true}
        onShowPalette={() => setShowPalette(true)}
        onNewNote={handleNewNote}
        onShowSettings={() => setShowSettings(true)}
      />
      <div className={appClassName}>
        <IconRail
          viewItems={rail.railViewItems}
          commandIds={rail.resolvedRailCommandIds}
          commands={paletteCommands}
          onCustomize={() => setShowRailCustomize(true)}
          onShowPalette={() => setShowPalette(true)}
          onShowSettings={() => setShowSettings(true)}
          onReorderViews={rail.handleReorderRailViews}
          onReorderCommands={rail.handleReorderRailCommands}
        />
        <Sidebar
          vaultPath={vaultPath}
          subjects={subjects}
          activeSubject={activeSubject}
          viewMode={viewMode}
          recents={recents}
          favorites={favorites}
          onSelectSubject={handleSelectSubject}
          onShowSettings={() => setShowSettings(true)}
          onShowPalette={() => setShowPalette(true)}
          onOpenObsidian={() => handleOpenObsidian()}
          onSubjectsChanged={() => setReloadKey((k) => k + 1)}
          onResetVault={clearVaultPath}
          onOpenFile={openFileByPath}
          onRemoveRecent={(filePath) =>
            setRecents((prev) => prev.filter((r) => r.filePath !== filePath))
          }
        />

        <WorkspaceRouter
          viewMode={viewMode}
          vaultPath={vaultPath}
          subjects={subjects}
          files={files}
          reloadKey={reloadKey}
          plugins={plugins}
          activePluginView={activePluginView}
          activeFile={activeFile}
          activeSubject={activeSubject}
          virtualFile={virtualFile}
          subjectView={subjectView}
          setSubjectView={setSubjectView}
          subjectPanelWidth={subjectPanelWidth}
          startSubjectPanelResize={startSubjectPanelResize}
          setActiveFile={setActiveFile}
          setVirtualFile={setVirtualFile}
          bumpReload={workspace.bumpReload}
          handleJumpToWikilink={handleJumpToWikilink}
          handleJumpToFile={handleJumpToFile}
          handleJumpFromTimetable={handleJumpFromTimetable}
          handleOpenBook={handleOpenBook}
          handleOpenObsidian={handleOpenObsidian}
          openFileByPath={openFileByPath}
          resolveWikilink={resolveWikilink}
          handleRenameNote={handleRenameNote}
          handleFileSelect={handleFileSelect}
          handleSelectVirtual={handleSelectVirtual}
          setShowSettings={setShowSettings}
        />
      </div>

      {showSettings && (
        <Suspense fallback={null}>
          <Settings
            vaultPath={vaultPath}
            uiMode={rail.uiMode}
            onChangeUiMode={rail.handleChangeRailMode}
            onCustomizeRail={() => setShowRailCustomize(true)}
            onResetRailSimple={rail.handleResetRailSimple}
            onSetRailFull={rail.handleSetRailFull}
            onClose={() => setShowSettings(false)}
          />
        </Suspense>
      )}

      {showRailCustomize && (
        <RailCustomizeDialog
          uiMode={rail.uiMode}
          railItems={rail.railItems}
          railCommandIds={rail.railCommandIds}
          viewOptions={rail.railViewOptions}
          commands={paletteCommands}
          onChangeMode={rail.handleChangeRailMode}
          onAddView={rail.handleAddRailView}
          onAddCommand={rail.handleAddRailCommand}
          onResetSimple={rail.handleResetRailSimple}
          onSetFull={rail.handleSetRailFull}
          onClose={() => setShowRailCustomize(false)}
        />
      )}

      {showTypeSelector && (
        <TypeSelector
          onPick={handlePickType}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      <CommandPalette
        open={showPalette}
        vaultPath={vaultPath}
        commands={paletteCommands}
        onClose={() => setShowPalette(false)}
        onSelectTarget={handlePaletteSelectTarget}
        onSelectHit={handlePaletteSelectHit}
      />

      {showWebClip && (
        <WebClipDialog
          vaultPath={vaultPath}
          onClose={() => setShowWebClip(false)}
          onClipped={(filePath) => {
            setShowWebClip(false);
            openFileByPath(filePath);
          }}
        />
      )}

      {showCitation && (
        <CitationPicker
          vaultPath={vaultPath}
          onClose={() => setShowCitation(false)}
          onInsert={(citation) => {
            // Phase 3: drop directly at the active TipTap caret if any
            // editor registered itself. Falls back to clipboard so the
            // shortcut is still useful in non-editor contexts (preview,
            // QA chat, etc.).
            const inserted = insertAtActiveCaret(citation);
            if (!inserted) {
              navigator.clipboard.writeText(citation).catch(() => {});
            }
          }}
        />
      )}

      {showFAQ && <FAQPanel onClose={() => setShowFAQ(false)} />}
    </div>
  );
}
