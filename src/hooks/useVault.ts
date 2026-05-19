import { useEffect, useState, useCallback } from 'react';

const KEY = 'classnotes:vaultPath';
const RECENT_KEY = 'classnotes:recentVaults';
const MAX_RECENT = 6;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useVault() {
  const [vaultPath, setVaultPathState] = useState<string | null>(() => {
    return localStorage.getItem(KEY);
  });
  const [recentVaults, setRecentVaults] = useState<string[]>(loadRecent);

  useEffect(() => {
    if (vaultPath) {
      localStorage.setItem(KEY, vaultPath);
      setRecentVaults((prev) => {
        const next = [vaultPath, ...prev.filter((p) => p !== vaultPath)].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
    } else {
      localStorage.removeItem(KEY);
    }
  }, [vaultPath]);

  const removeRecent = useCallback((p: string) => {
    setRecentVaults((prev) => {
      const next = prev.filter((x) => x !== p);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    vaultPath,
    setVaultPath: setVaultPathState,
    clearVaultPath: () => setVaultPathState(null),
    recentVaults,
    removeRecent,
  };
}
