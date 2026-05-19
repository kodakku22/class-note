import { useEffect } from 'react';
import type { ViewMode } from '../state/appReducer';
import type { SubjectView } from '../components/FileList';

export type KeyboardShortcutsOptions = {
  vaultPath: string | null;
  showPalette: boolean;
  showSettings: boolean;
  showTypeSelector: boolean;
  setShowPalette: (fn: (prev: boolean) => boolean) => void;
  setShowSettings: (v: boolean) => void;
  setShowTypeSelector: (v: boolean) => void;
  setShowWebClip: (v: boolean) => void;
  setShowCitation: (v: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setSubjectView: (fn: (prev: SubjectView) => SubjectView) => void;
  handleNewNote: () => void;
};

/**
 * Registers global keyboard shortcuts for the workspace.
 * Ctrl/Cmd+P/K → palette, Ctrl/Cmd+N → new note, Ctrl/Cmd+1-9 → views, etc.
 */
export function useKeyboardShortcuts({
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
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!vaultPath) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'p' || e.key === 'P' || e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        setShowPalette((s) => !s);
      } else if (mod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        e.stopPropagation();
        handleNewNote();
      } else if (mod && /^[1-9]$/.test(e.key)) {
        const n = e.key;
        e.preventDefault();
        e.stopPropagation();
        if (n === '1') setViewMode('subject');
        else if (n === '2') setViewMode('daily');
        else if (n === '3') setViewMode('timetable');
        else if (n === '4') setViewMode('books');
        else if (n === '5') setViewMode('memos');
        else if (n === '6') setViewMode('wiki');
        else if (n === '7') setViewMode('outputs');
        else if (n === '8') setViewMode('papers');
        else if (n === '9') setViewMode('progress');
      } else if (mod && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        setShowWebClip(true);
      } else if (mod && e.shiftKey && (e.key === '@' || e.key === '2')) {
        e.preventDefault();
        setShowCitation(true);
      } else if (mod && (e.key === 'e' || e.key === 'E')) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        setSubjectView((v) => (v === 'gallery' ? 'list' : 'gallery'));
      } else if (mod && (e.key === '\\' || e.code === 'Backslash' || e.code === 'IntlYen')) {
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (showPalette) setShowPalette(() => false);
        else if (showTypeSelector) setShowTypeSelector(false);
        else if (showSettings) setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    vaultPath,
    handleNewNote,
    setViewMode,
    showPalette,
    showSettings,
    showTypeSelector,
    setShowPalette,
    setShowSettings,
    setShowTypeSelector,
    setShowWebClip,
    setShowCitation,
    setSubjectView,
  ]);
}
