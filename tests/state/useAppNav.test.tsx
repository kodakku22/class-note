import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAppNav } from '../../src/state/useAppNav';
import type { FileEntry } from '../../src/types';

const note: FileEntry = {
  name: 'Note.md',
  path: 'C:\\Vault\\Math\\notes\\Note.md',
  kind: 'note',
  ext: '.md',
  mtime: 1,
};

const book: FileEntry = {
  name: 'Book.md',
  path: 'C:\\Vault\\Books\\Book.md',
  kind: 'note',
  ext: '.md',
  mtime: 2,
};

describe('useAppNav', () => {
  it('drives the main navigation path through subjects, files, QA, and clearing', () => {
    const { result } = renderHook(() => useAppNav());

    act(() => result.current.openSubject('数学'));
    expect(result.current.state.activeSubject).toBe('数学');
    expect(result.current.state.viewMode).toBe('subject');

    act(() => result.current.openFile(note));
    expect(result.current.state.activeFile).toEqual(note);
    expect(result.current.state.activeSubject).toBe('数学');

    act(() => result.current.openQA());
    expect(result.current.state.activeFile).toBeNull();
    expect(result.current.state.virtualFile).toEqual({ kind: 'qa' });

    act(() => result.current.clearSubject());
    expect(result.current.state.activeSubject).toBeNull();
    expect(result.current.state.virtualFile).toBeNull();
  });

  it('switches top-level views and detail contexts without stale state', () => {
    const { result } = renderHook(() => useAppNav());

    act(() => result.current.openSubject('英語'));
    act(() => result.current.openBooksDetail(book));
    expect(result.current.state.viewMode).toBe('books-detail');
    expect(result.current.state.activeSubject).toBeNull();
    expect(result.current.state.activeFile).toEqual(book);

    act(() => result.current.setViewMode('papers'));
    expect(result.current.state.viewMode).toBe('papers');
    expect(result.current.state.virtualFile).toBeNull();

    act(() => result.current.openWikiFile(note));
    expect(result.current.state.activeSubject).toBeNull();
    expect(result.current.state.activeFile).toEqual(note);

    act(() => result.current.setSubjectView('database'));
    expect(result.current.state.subjectView).toBe('database');

    act(() => result.current.clearFile());
    expect(result.current.state.activeFile).toBeNull();
  });
});
