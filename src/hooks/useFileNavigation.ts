import { useCallback, type RefObject } from 'react';
import type { FileEntry, LinkTarget } from '../types';
import type { ViewMode } from '../state/appReducer';
import { joinPath, basename, isUnderVaultDir } from '../utils/paths';

export type FileNavigationOptions = {
  vaultPath: string | null;
  activeSubject: string | null;
  activeFile: FileEntry | null;
  linkTargetsRef: RefObject<LinkTarget[]>;
  setActiveSubject: (s: string | null) => void;
  setActiveFile: (f: FileEntry | null) => void;
  setVirtualFile: (v: { kind: 'qa' } | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setReloadKey: (fn: (k: number) => number) => void;
  recordRecent: (file: FileEntry, subject?: string) => void;
};

export type FileNavigationResult = {
  openFileByPath: (filePath: string) => Promise<void>;
  handleJumpToWikilink: (name: string) => void;
  resolveWikilink: (name: string) => string | null;
  handleRenameNote: (oldPath: string, newName: string) => Promise<void>;
  handleFileSelect: (file: FileEntry) => Promise<void>;
  handleSelectSubject: (s: string) => void;
  handleSelectVirtual: (kind: 'qa' | 'overview') => void;
  handleJumpToFile: (subject: string, filePath: string) => Promise<void>;
  handleJumpFromTimetable: (subject: string) => void;
  handleOpenBook: (filePath: string) => void;
  handleOpenObsidian: (filePath?: string) => void;
};

/**
 * File navigation handlers: opening files by path, wikilink resolution,
 * subject/file selection, rename, and cross-view jumps.
 */
export function useFileNavigation({
  vaultPath,
  activeSubject,
  linkTargetsRef,
  setActiveSubject,
  setActiveFile,
  setVirtualFile,
  setViewMode,
  setReloadKey,
  recordRecent,
}: FileNavigationOptions): FileNavigationResult {
  const openFileByPath = useCallback(async (filePath: string) => {
    if (!vaultPath) return;
    const targets = linkTargetsRef.current ?? [];
    const t = targets.find((x) => x.filePath === filePath);

    if (isUnderVaultDir(filePath, 'books') || t?.category === 'book') {
      setActiveSubject(null);
      setVirtualFile(null);
      setActiveFile({
        name: basename(filePath),
        path: filePath,
        kind: 'note',
        ext: '.md',
        mtime: Date.now(),
      });
      setViewMode('books-detail');
      return;
    }
    if (isUnderVaultDir(filePath, 'memos') || t?.category === 'memo') {
      setViewMode('memos');
      return;
    }
    if (isUnderVaultDir(filePath, 'papers')) {
      setActiveSubject(null);
      setVirtualFile(null);
      setActiveFile({
        name: basename(filePath),
        path: filePath,
        kind: 'note',
        ext: '.md',
        mtime: Date.now(),
      });
      setViewMode('papers');
      return;
    }
    if (isUnderVaultDir(filePath, 'wiki') || isUnderVaultDir(filePath, 'outputs')) {
      setActiveSubject(null);
      setVirtualFile(null);
      setActiveFile({
        name: basename(filePath),
        path: filePath,
        kind: 'note',
        ext: '.md',
        mtime: Date.now(),
      });
      setViewMode('subject');
      return;
    }
    if (t?.subject) {
      setActiveSubject(t.subject);
      setViewMode('subject');
      setVirtualFile(null);
      const result = await window.api.vault.listFiles(vaultPath, t.subject);
      const all = [...result.notes, ...result.materials];
      const target = all.find((f) => f.path === filePath);
      if (target) {
        setActiveFile(target);
      } else {
        setActiveFile({
          name: basename(filePath),
          path: filePath,
          kind: 'note',
          ext: '.md',
          mtime: Date.now(),
        });
      }
    }
  }, [vaultPath, linkTargetsRef, setActiveFile, setActiveSubject, setViewMode, setVirtualFile]);

  const handleJumpToWikilink = useCallback((name: string) => {
    const targets = linkTargetsRef.current ?? [];
    const target = targets.find((t) => t.name === name);
    if (target) {
      openFileByPath(target.filePath);
    } else {
      alert(`「${name}」というノートが見つかりません。`);
    }
  }, [linkTargetsRef, openFileByPath]);

  const resolveWikilink = useCallback((name: string): string | null => {
    const targets = linkTargetsRef.current ?? [];
    const target = targets.find((t) => t.name === name);
    return target?.filePath ?? null;
  }, [linkTargetsRef]);

  const handleRenameNote = useCallback(
    async (oldPath: string, newName: string) => {
      if (!vaultPath) return;
      const r = await window.api.vault.renameNote(vaultPath, oldPath, newName);
      if (!r.ok) {
        alert(`リネーム失敗: ${r.error}`);
        return;
      }
      setReloadKey((k) => k + 1);
      if (r.newPath) {
        setActiveFile({
          name: basename(r.newPath),
          path: r.newPath,
          kind: 'note',
          ext: '.md',
          mtime: Date.now(),
        });
      }
    },
    [vaultPath, setActiveFile, setReloadKey]
  );

  const handleFileSelect = useCallback(
    async (file: FileEntry) => {
      if (file.kind === 'office' || file.kind === 'other') {
        await window.api.materials.openExternal(file.path);
        return;
      }
      setVirtualFile(null);
      setActiveFile(file);
      recordRecent(file, activeSubject ?? undefined);
    },
    [recordRecent, activeSubject, setActiveFile, setVirtualFile]
  );

  const handleSelectSubject = useCallback((s: string) => {
    setActiveSubject(s);
    setActiveFile(null);
    setVirtualFile(null);
    setViewMode('subject');
  }, [setActiveSubject, setActiveFile, setVirtualFile, setViewMode]);

  const handleSelectVirtual = useCallback((kind: 'qa' | 'overview') => {
    if (kind === 'qa') {
      setActiveFile(null);
      setVirtualFile({ kind: 'qa' });
    } else if (kind === 'overview' && vaultPath && activeSubject) {
      const overviewPath = joinPath(vaultPath, activeSubject, '_概要.md');
      setVirtualFile(null);
      setActiveFile({
        name: '_概要.md',
        path: overviewPath,
        kind: 'note',
        ext: '.md',
        mtime: Date.now(),
      });
    }
  }, [vaultPath, activeSubject, setActiveFile, setVirtualFile]);

  const handleJumpToFile = useCallback(
    async (subject: string, filePath: string) => {
      setActiveSubject(subject);
      setViewMode('subject');
      setVirtualFile(null);
      const result = await window.api.vault.listFiles(vaultPath!, subject);
      const all = [...result.notes, ...result.materials];
      const target = all.find((f) => f.path === filePath);
      if (target) setActiveFile(target);
    },
    [vaultPath, setActiveFile, setActiveSubject, setViewMode, setVirtualFile]
  );

  const handleJumpFromTimetable = useCallback((subject: string) => {
    setActiveSubject(subject);
    setActiveFile(null);
    setVirtualFile(null);
    setViewMode('subject');
  }, [setActiveSubject, setActiveFile, setVirtualFile, setViewMode]);

  const handleOpenBook = useCallback((filePath: string) => {
    setActiveSubject(null);
    setVirtualFile(null);
    setViewMode('books-detail');
    setActiveFile({
      name: basename(filePath),
      path: filePath,
      kind: 'note',
      ext: '.md',
      mtime: Date.now(),
    });
  }, [setActiveSubject, setActiveFile, setVirtualFile, setViewMode]);

  const handleOpenObsidian = useCallback(
    (filePath?: string) => {
      if (!vaultPath) return;
      const vaultName = basename(vaultPath) || 'Vault';
      let uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}`;
      if (filePath && filePath.startsWith(vaultPath)) {
        const rel = filePath
          .slice(vaultPath.length)
          .replace(/^[\\/]/, '')
          .replace(/\\/g, '/')
          .replace(/\.md$/, '');
        if (rel) uri += `&file=${encodeURIComponent(rel)}`;
      }
      window.api.materials.openUrl(uri);
    },
    [vaultPath]
  );

  return {
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
  };
}
