// Hook that wraps the navigation reducer with typed dispatchers.
//
// App.tsx used to manage navigation as 5 separate useState calls
// (viewMode, activeSubject, activeFile, virtualFile, subjectView). Each
// transition required remembering to clear the others, leading to bugs
// like `setActiveSubject(null)` being scattered in 9 places. This hook
// pulls the entire navigation tuple into one reducer so transitions are
// canonical and testable.
//
// Non-navigation state (subjects, files, recents, favorites, modal flags)
// stays in App.tsx as useState because it has no invariants between
// fields.
import { useCallback, useMemo, useReducer } from 'react';
import {
  appReducer,
  initialAppState,
  type ViewMode,
  type SubjectView,
} from './appReducer';
import type { FileEntry } from '../types';

export function useAppNav() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const openSubject = useCallback((subject: string) => dispatch({ type: 'OPEN_SUBJECT', subject }), []);
  const openFile = useCallback(
    (file: FileEntry, subject?: string | null) => dispatch({ type: 'OPEN_FILE', file, subject }),
    []
  );
  const openQA = useCallback(() => dispatch({ type: 'OPEN_QA' }), []);
  const setViewMode = useCallback(
    (viewMode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', viewMode }),
    []
  );
  const setSubjectView = useCallback(
    (subjectView: SubjectView) => dispatch({ type: 'SET_SUBJECT_VIEW', subjectView }),
    []
  );
  const openBooksDetail = useCallback(
    (file: FileEntry) => dispatch({ type: 'OPEN_BOOKS_DETAIL', file }),
    []
  );
  const openWikiFile = useCallback(
    (file: FileEntry) => dispatch({ type: 'OPEN_WIKI_FILE', file }),
    []
  );
  const openOverview = useCallback(
    (file: FileEntry) => dispatch({ type: 'OPEN_OVERVIEW', file }),
    []
  );
  const clearSubject = useCallback(() => dispatch({ type: 'CLEAR_SUBJECT' }), []);
  const clearFile = useCallback(() => dispatch({ type: 'CLEAR_FILE' }), []);

  return useMemo(() => ({
    state,
    openSubject,
    openFile,
    openQA,
    setViewMode,
    setSubjectView,
    openBooksDetail,
    openWikiFile,
    openOverview,
    clearSubject,
    clearFile,
  }), [
    clearSubject,
    clearFile,
    openBooksDetail,
    openFile,
    openOverview,
    openQA,
    openSubject,
    openWikiFile,
    setSubjectView,
    setViewMode,
    state,
  ]);
}

export type AppNav = ReturnType<typeof useAppNav>;
