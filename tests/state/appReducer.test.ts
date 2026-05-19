import { describe, expect, it } from 'vitest';
import { appReducer, initialAppState } from '../../src/state/appReducer';
import type { FileEntry } from '../../src/types';

const note: FileEntry = {
  name: 'Paper.md',
  path: 'C:/Vault/Papers/Paper.md',
  kind: 'note',
  ext: '.md',
  mtime: 1,
};

describe('appReducer navigation invariants', () => {
  it('clears activeSubject when moving to a top-level document context', () => {
    const subjectState = appReducer(initialAppState, {
      type: 'OPEN_SUBJECT',
      subject: '数学',
    });

    const cleared = appReducer(subjectState, { type: 'CLEAR_SUBJECT' });

    expect(cleared.activeSubject).toBeNull();
    expect(cleared.virtualFile).toBeNull();
    expect(cleared.viewMode).toBe('subject');
  });

  it('opens book detail with no stale subject left behind', () => {
    const subjectState = appReducer(initialAppState, {
      type: 'OPEN_SUBJECT',
      subject: '英語',
    });

    const detail = appReducer(subjectState, {
      type: 'OPEN_BOOKS_DETAIL',
      file: note,
    });

    expect(detail.viewMode).toBe('books-detail');
    expect(detail.activeSubject).toBeNull();
    expect(detail.activeFile).toEqual(note);
    expect(detail.virtualFile).toBeNull();
  });
});
