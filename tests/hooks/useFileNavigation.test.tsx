import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useFileNavigation, type FileNavigationOptions } from '../../src/hooks/useFileNavigation';
import type { FileEntry, LinkTarget } from '../../src/types';

const NOOP_REF = { current: [] as LinkTarget[] };

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    name: 'Sample.md',
    path: 'C:\\vault\\Math\\notes\\Sample.md',
    kind: 'note',
    ext: '.md',
    mtime: Date.now(),
    ...overrides,
  };
}

function makeOptions(overrides: Partial<FileNavigationOptions> = {}): FileNavigationOptions {
  return {
    vaultPath: 'C:\\vault',
    activeSubject: 'Math',
    activeFile: null,
    linkTargetsRef: { current: [] },
    setActiveSubject: vi.fn(),
    setActiveFile: vi.fn(),
    setVirtualFile: vi.fn(),
    setViewMode: vi.fn(),
    setReloadKey: vi.fn(),
    recordRecent: vi.fn(),
    ...overrides,
  };
}

const originalAlert = window.alert;

beforeEach(() => {
  // Suppress alert dialogs jsdom prints to console.
  window.alert = vi.fn();
});

afterEach(() => {
  window.alert = originalAlert;
});

describe('useFileNavigation / openFileByPath', () => {
  it('does nothing when vaultPath is null', async () => {
    const opts = makeOptions({ vaultPath: null });
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Math\\notes\\Foo.md');
    });
    expect(opts.setActiveFile).not.toHaveBeenCalled();
    expect(opts.setViewMode).not.toHaveBeenCalled();
  });

  it('routes books-detail for paths under /books/', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Books\\some-book.md');
    });
    expect(opts.setActiveSubject).toHaveBeenCalledWith(null);
    expect(opts.setVirtualFile).toHaveBeenCalledWith(null);
    expect(opts.setActiveFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:\\vault\\Books\\some-book.md', kind: 'note' })
    );
    expect(opts.setViewMode).toHaveBeenCalledWith('books-detail');
  });

  it('routes memos view for paths under /memos/', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Memos\\quick.md');
    });
    expect(opts.setViewMode).toHaveBeenCalledWith('memos');
    // memos branch returns without touching active file.
    expect(opts.setActiveFile).not.toHaveBeenCalled();
  });

  it('routes papers view for paths under /papers/', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Papers\\some-paper.md');
    });
    expect(opts.setViewMode).toHaveBeenCalledWith('papers');
    expect(opts.setActiveSubject).toHaveBeenCalledWith(null);
    expect(opts.setActiveFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:\\vault\\Papers\\some-paper.md' })
    );
  });

  it('routes subject viewer for files under /wiki/', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\wiki\\index.md');
    });
    expect(opts.setViewMode).toHaveBeenCalledWith('subject');
    expect(opts.setActiveSubject).toHaveBeenCalledWith(null);
  });

  it('routes by linkTarget.category=book even outside /books/', async () => {
    const opts = makeOptions({
      linkTargetsRef: {
        current: [
          { name: 'Foo', filePath: 'C:\\vault\\Other\\foo.md', category: 'book' },
        ],
      },
    });
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Other\\foo.md');
    });
    expect(opts.setViewMode).toHaveBeenCalledWith('books-detail');
  });

  it('switches to subject view and lists files when linkTarget has subject', async () => {
    const listFiles = vi.fn().mockResolvedValue({
      notes: [makeFile({ name: 'Target.md', path: 'C:\\vault\\Math\\notes\\Target.md' })],
      materials: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { vault: { listFiles } };
    const opts = makeOptions({
      linkTargetsRef: {
        current: [
          {
            name: 'Target',
            filePath: 'C:\\vault\\Math\\notes\\Target.md',
            category: 'subject-note',
            subject: 'Math',
          },
        ],
      },
    });
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Math\\notes\\Target.md');
    });
    expect(opts.setActiveSubject).toHaveBeenCalledWith('Math');
    expect(opts.setViewMode).toHaveBeenCalledWith('subject');
    expect(listFiles).toHaveBeenCalledWith('C:\\vault', 'Math');
    expect(opts.setActiveFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Target.md' })
    );
  });

  it('falls back to a synthetic FileEntry when listFiles misses the target', async () => {
    const listFiles = vi.fn().mockResolvedValue({ notes: [], materials: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { vault: { listFiles } };
    const opts = makeOptions({
      linkTargetsRef: {
        current: [
          {
            name: 'Missing',
            filePath: 'C:\\vault\\Math\\notes\\Missing.md',
            category: 'subject-note',
            subject: 'Math',
          },
        ],
      },
    });
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.openFileByPath('C:\\vault\\Math\\notes\\Missing.md');
    });
    const calls = (opts.setActiveFile as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.at(-1)?.[0]).toMatchObject({ name: 'Missing.md', path: 'C:\\vault\\Math\\notes\\Missing.md' });
  });
});

describe('useFileNavigation / handleJumpToWikilink + resolveWikilink', () => {
  it('opens the matching link target', async () => {
    const opts = makeOptions({
      linkTargetsRef: {
        current: [
          { name: 'Foo', filePath: 'C:\\vault\\Memos\\foo.md', category: 'memo' },
        ],
      },
    });
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      result.current.handleJumpToWikilink('Foo');
    });
    expect(opts.setViewMode).toHaveBeenCalledWith('memos');
  });

  it('alerts the user when the wikilink is unresolved', () => {
    const opts = makeOptions({ linkTargetsRef: NOOP_REF });
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => {
      result.current.handleJumpToWikilink('Nope');
    });
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Nope'));
  });

  it('resolveWikilink returns filePath on hit and null on miss', () => {
    const opts = makeOptions({
      linkTargetsRef: {
        current: [{ name: 'A', filePath: '/v/A.md', category: 'subject-note' }],
      },
    });
    const { result } = renderHook(() => useFileNavigation(opts));
    expect(result.current.resolveWikilink('A')).toBe('/v/A.md');
    expect(result.current.resolveWikilink('Missing')).toBeNull();
  });
});

describe('useFileNavigation / handleRenameNote', () => {
  it('renames a note and updates active file', async () => {
    const renameNote = vi.fn().mockResolvedValue({ ok: true, newPath: 'C:\\vault\\Math\\notes\\Renamed.md' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { vault: { renameNote } };
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.handleRenameNote('C:\\vault\\Math\\notes\\Sample.md', 'Renamed');
    });
    expect(renameNote).toHaveBeenCalledWith('C:\\vault', 'C:\\vault\\Math\\notes\\Sample.md', 'Renamed');
    expect(opts.setReloadKey).toHaveBeenCalled();
    expect(opts.setActiveFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed.md' })
    );
  });

  it('surfaces a rename failure via alert', async () => {
    const renameNote = vi.fn().mockResolvedValue({ ok: false, error: 'already exists' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { vault: { renameNote } };
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.handleRenameNote('a', 'b');
    });
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('リネーム失敗'));
    expect(opts.setReloadKey).not.toHaveBeenCalled();
  });

  it('no-ops when vaultPath is null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renameNote = vi.fn();
    (window as any).api = { vault: { renameNote } };
    const opts = makeOptions({ vaultPath: null });
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.handleRenameNote('a', 'b');
    });
    expect(renameNote).not.toHaveBeenCalled();
  });
});

describe('useFileNavigation / handleFileSelect', () => {
  it('opens external for office and other kinds without setting active', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { materials: { openExternal } };
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.handleFileSelect(makeFile({ kind: 'office', path: 'C:\\f.pptx' }));
    });
    expect(openExternal).toHaveBeenCalledWith('C:\\f.pptx');
    expect(opts.setActiveFile).not.toHaveBeenCalled();
  });

  it('sets active file and records recent for notes', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    const f = makeFile();
    await act(async () => {
      await result.current.handleFileSelect(f);
    });
    expect(opts.setActiveFile).toHaveBeenCalledWith(f);
    expect(opts.recordRecent).toHaveBeenCalledWith(f, 'Math');
    expect(opts.setVirtualFile).toHaveBeenCalledWith(null);
  });
});

describe('useFileNavigation / handleSelectSubject / handleJumpFromTimetable / handleOpenBook', () => {
  it('handleSelectSubject sets subject + view + clears file', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleSelectSubject('Phys'));
    expect(opts.setActiveSubject).toHaveBeenCalledWith('Phys');
    expect(opts.setActiveFile).toHaveBeenCalledWith(null);
    expect(opts.setVirtualFile).toHaveBeenCalledWith(null);
    expect(opts.setViewMode).toHaveBeenCalledWith('subject');
  });

  it('handleJumpFromTimetable mirrors handleSelectSubject', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleJumpFromTimetable('Bio'));
    expect(opts.setActiveSubject).toHaveBeenCalledWith('Bio');
    expect(opts.setViewMode).toHaveBeenCalledWith('subject');
  });

  it('handleOpenBook routes to books-detail with synthetic file', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleOpenBook('C:\\vault\\Books\\some.md'));
    expect(opts.setViewMode).toHaveBeenCalledWith('books-detail');
    expect(opts.setActiveSubject).toHaveBeenCalledWith(null);
    expect(opts.setActiveFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:\\vault\\Books\\some.md' })
    );
  });
});

describe('useFileNavigation / handleSelectVirtual', () => {
  it('opens QA virtual file', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleSelectVirtual('qa'));
    expect(opts.setActiveFile).toHaveBeenCalledWith(null);
    expect(opts.setVirtualFile).toHaveBeenCalledWith({ kind: 'qa' });
  });

  it('opens subject overview when activeSubject is set', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleSelectVirtual('overview'));
    expect(opts.setVirtualFile).toHaveBeenCalledWith(null);
    expect(opts.setActiveFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: '_概要.md' })
    );
  });

  it('does nothing for overview when activeSubject is null', () => {
    const opts = makeOptions({ activeSubject: null });
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleSelectVirtual('overview'));
    expect(opts.setActiveFile).not.toHaveBeenCalled();
  });
});

describe('useFileNavigation / handleJumpToFile', () => {
  it('switches subject and selects the file when found', async () => {
    const f = makeFile({ name: 'X.md', path: 'C:\\vault\\Math\\notes\\X.md' });
    const listFiles = vi.fn().mockResolvedValue({ notes: [f], materials: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { vault: { listFiles } };
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    await act(async () => {
      await result.current.handleJumpToFile('Math', f.path);
    });
    expect(opts.setActiveSubject).toHaveBeenCalledWith('Math');
    expect(opts.setViewMode).toHaveBeenCalledWith('subject');
    expect(opts.setActiveFile).toHaveBeenCalledWith(f);
  });
});

describe('useFileNavigation / handleOpenObsidian', () => {
  it('builds an obsidian:// URL with relative file path', () => {
    const openUrl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { materials: { openUrl } };
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleOpenObsidian('C:\\vault\\Math\\notes\\Sample.md'));
    expect(openUrl).toHaveBeenCalledTimes(1);
    const url = openUrl.mock.calls[0][0] as string;
    expect(url.startsWith('obsidian://open?vault=')).toBe(true);
    expect(url).toContain('file=');
    expect(url).toContain('Math');
  });

  it('omits the file query when path is outside the vault', () => {
    const openUrl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { materials: { openUrl } };
    const opts = makeOptions();
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleOpenObsidian('D:\\elsewhere\\foo.md'));
    expect(openUrl).toHaveBeenCalled();
    expect(openUrl.mock.calls[0][0]).not.toContain('file=');
  });

  it('no-ops without vault path', () => {
    const openUrl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = { materials: { openUrl } };
    const opts = makeOptions({ vaultPath: null });
    const { result } = renderHook(() => useFileNavigation(opts));
    act(() => result.current.handleOpenObsidian('any'));
    expect(openUrl).not.toHaveBeenCalled();
  });
});
