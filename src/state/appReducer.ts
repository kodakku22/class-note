// Centralized navigation reducer for App.tsx.
//
// Why: App.tsx had 11 useState calls for activeSubject / activeFile / viewMode
// / virtualFile / subjectView. Updating any of them required remembering to
// reset the others (e.g. setActiveSubject(null) appeared in 9 places). The
// invariant "exactly one of {subject, virtualFile, books-detail file} is
// active" wasn't enforced anywhere.
//
// This reducer makes the invariant explicit. Each dispatch produces a
// canonical state, and every transition lives in one switch — easy to read,
// easy to test, no scattered null-resets.
import type { FileEntry } from '../types';

export type ViewMode =
  | 'subject'
  | 'timetable'
  | 'books'
  | 'books-detail'
  | 'memos'
  | 'daily'
  | 'graph'
  | 'wiki'
  | 'outputs'
  | 'papers'
  | 'progress'
  | 'plugin';

export type SubjectView = 'list' | 'gallery' | 'database' | 'graph' | 'board';

export type VirtualFile = { kind: 'qa' } | null;

export type AppState = {
  viewMode: ViewMode;
  activeSubject: string | null;
  activeFile: FileEntry | null;
  virtualFile: VirtualFile;
  subjectView: SubjectView;
};

export const initialAppState: AppState = {
  viewMode: 'subject',
  activeSubject: null,
  activeFile: null,
  virtualFile: null,
  subjectView: 'list',
};

export type AppAction =
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'OPEN_SUBJECT'; subject: string }
  | { type: 'OPEN_FILE'; file: FileEntry; subject?: string | null }
  | { type: 'OPEN_QA' }
  | { type: 'OPEN_OVERVIEW'; file: FileEntry }
  | { type: 'OPEN_BOOKS_DETAIL'; file: FileEntry }
  | { type: 'OPEN_WIKI_FILE'; file: FileEntry }
  | { type: 'CLEAR_SUBJECT' }
  | { type: 'CLEAR_FILE' }
  | { type: 'SET_SUBJECT_VIEW'; subjectView: SubjectView };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW_MODE':
      // Switching modes clears any virtual file but preserves the file itself
      // so users can return to a note via Ctrl+1.
      return {
        ...state,
        viewMode: action.viewMode,
        virtualFile: null,
      };

    case 'OPEN_SUBJECT':
      return {
        ...state,
        viewMode: 'subject',
        activeSubject: action.subject,
        virtualFile: null,
      };

    case 'OPEN_FILE':
      return {
        ...state,
        viewMode: 'subject',
        activeFile: action.file,
        activeSubject:
          action.subject !== undefined ? action.subject : state.activeSubject,
        virtualFile: null,
      };

    case 'OPEN_QA':
      return {
        ...state,
        activeFile: null,
        virtualFile: { kind: 'qa' },
      };

    case 'OPEN_OVERVIEW':
      return {
        ...state,
        viewMode: 'subject',
        activeFile: action.file,
        virtualFile: null,
      };

    case 'OPEN_BOOKS_DETAIL':
      return {
        ...state,
        viewMode: 'books-detail',
        activeSubject: null,
        activeFile: action.file,
        virtualFile: null,
      };

    case 'OPEN_WIKI_FILE':
      // Wiki / Outputs files: viewer with no active subject.
      return {
        ...state,
        activeSubject: null,
        activeFile: action.file,
        virtualFile: null,
      };

    case 'CLEAR_SUBJECT':
      return {
        ...state,
        activeSubject: null,
        virtualFile: null,
      };

    case 'CLEAR_FILE':
      return { ...state, activeFile: null, virtualFile: null };

    case 'SET_SUBJECT_VIEW':
      return { ...state, subjectView: action.subjectView };

    default:
      return state;
  }
}
