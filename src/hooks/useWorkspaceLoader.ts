// useWorkspaceLoader — owns the vault-data fetch lifecycle:
// subjects + files (notes/materials) + link targets + favorites + plugins
// + the file-system watcher that triggers reloads.
//
// Inputs are minimal (vaultPath + activeSubject + setActiveSubject) so the
// hook is independent of App.tsx layout/UI concerns. The returned state and
// callbacks are what App.tsx used to manage inline.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry, LinkTarget, PluginManifest } from '../types';
import type { FavoriteEntry } from '../components/Sidebar';

export type WorkspaceLoaderOptions = {
  vaultPath: string | null;
  activeSubject: string | null;
  setActiveSubject: (s: string | null) => void;
};

export type WorkspaceLoaderResult = {
  subjects: string[];
  files: { notes: FileEntry[]; materials: FileEntry[] };
  favorites: FavoriteEntry[];
  plugins: PluginManifest[];
  reloadKey: number;
  /** Bump the reload key to force subjects / files / link-targets / favorites refresh. */
  bumpReload: () => void;
  /** Persistent ref to the loaded link targets (read by useFileNavigation etc.). */
  linkTargetsRef: React.MutableRefObject<LinkTarget[]>;
};

export function useWorkspaceLoader({
  vaultPath,
  activeSubject,
  setActiveSubject,
}: WorkspaceLoaderOptions): WorkspaceLoaderResult {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [files, setFiles] = useState<{ notes: FileEntry[]; materials: FileEntry[] }>({
    notes: [],
    materials: [],
  });
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const linkTargetsRef = useRef<LinkTarget[]>([]);

  const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Subjects --------------------------------------------------------------
  const reloadSubjects = useCallback(async () => {
    if (!vaultPath) return;
    const subs = await window.api.vault.listSubjects(vaultPath);
    setSubjects(subs);
    if (subs.length > 0 && !activeSubject) setActiveSubject(subs[0]);
    if (activeSubject && !subs.includes(activeSubject)) setActiveSubject(subs[0] ?? null);
  }, [vaultPath, activeSubject, setActiveSubject]);

  useEffect(() => { reloadSubjects(); }, [reloadSubjects, reloadKey]);

  // Files (notes + materials for the current subject) ---------------------
  const reloadFiles = useCallback(async () => {
    if (!vaultPath || !activeSubject) {
      setFiles({ notes: [], materials: [] });
      return;
    }
    const result = await window.api.vault.listFiles(vaultPath, activeSubject);
    setFiles(result);
  }, [vaultPath, activeSubject]);

  useEffect(() => { reloadFiles(); }, [reloadFiles, reloadKey]);

  // Link targets (wikilink resolution) -----------------------------------
  const reloadLinkTargets = useCallback(async () => {
    if (!vaultPath) return;
    const targets = await window.api.links.listTargets(vaultPath);
    linkTargetsRef.current = targets;
  }, [vaultPath]);

  useEffect(() => { reloadLinkTargets(); }, [reloadLinkTargets, reloadKey]);

  // Favorites (pinned: true frontmatter, via graphData index) ------------
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await window.api.vault.graphData(vaultPath);
        const favs: FavoriteEntry[] = [];
        for (const n of data.nodes) {
          if (favs.length >= 30) break;
          try {
            const raw = await window.api.vault.readNote(n.id);
            const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (m && /\bpinned:\s*true\b/.test(m[1])) {
              favs.push({ filePath: n.id, fileName: n.label, subject: n.subject });
            }
          } catch {}
        }
        if (!cancelled) setFavorites(favs);
      } catch {
        if (!cancelled) setFavorites([]);
      }
    })();
    return () => { cancelled = true; };
  }, [vaultPath, reloadKey]);

  // Plugins ---------------------------------------------------------------
  useEffect(() => {
    if (!vaultPath) {
      setPlugins([]);
      return;
    }
    let cancelled = false;
    window.api.plugins
      .list(vaultPath)
      .then((items) => { if (!cancelled) setPlugins(items); })
      .catch(() => { if (!cancelled) setPlugins([]); });
    return () => { cancelled = true; };
  }, [vaultPath, reloadKey]);

  // File-system watcher ---------------------------------------------------
  useEffect(() => {
    if (!vaultPath) return;
    window.api.watcher.start(vaultPath);
    const off = window.api.watcher.onChanged(() => {
      setReloadKey((k) => k + 1);
    });
    return () => {
      off();
      window.api.watcher.stop();
    };
  }, [vaultPath]);

  return {
    subjects,
    files,
    favorites,
    plugins,
    reloadKey,
    bumpReload,
    linkTargetsRef,
  };
}
