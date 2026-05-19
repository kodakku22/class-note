import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVault } from '../../src/hooks/useVault';

describe('useVault', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null vaultPath initially', () => {
    const { result } = renderHook(() => useVault());
    expect(result.current.vaultPath).toBeNull();
  });

  it('loads vaultPath from localStorage', () => {
    localStorage.setItem('classnotes:vaultPath', '/my/vault');
    const { result } = renderHook(() => useVault());
    expect(result.current.vaultPath).toBe('/my/vault');
  });

  it('setVaultPath updates state and localStorage', () => {
    const { result } = renderHook(() => useVault());

    act(() => {
      result.current.setVaultPath('/new/vault');
    });

    expect(result.current.vaultPath).toBe('/new/vault');
    expect(localStorage.getItem('classnotes:vaultPath')).toBe('/new/vault');
  });

  it('clearVaultPath sets null and removes from localStorage', () => {
    localStorage.setItem('classnotes:vaultPath', '/some/path');
    const { result } = renderHook(() => useVault());

    act(() => {
      result.current.clearVaultPath();
    });

    expect(result.current.vaultPath).toBeNull();
    expect(localStorage.getItem('classnotes:vaultPath')).toBeNull();
  });

  it('tracks recent vaults', () => {
    const { result } = renderHook(() => useVault());

    act(() => {
      result.current.setVaultPath('/vault-a');
    });

    expect(result.current.recentVaults).toContain('/vault-a');
  });

  it('removeRecent removes from recent list', () => {
    localStorage.setItem('classnotes:recentVaults', JSON.stringify(['/a', '/b', '/c']));
    const { result } = renderHook(() => useVault());

    act(() => {
      result.current.removeRecent('/b');
    });

    expect(result.current.recentVaults).toEqual(['/a', '/c']);
  });

  it('limits recent vaults to 6', () => {
    const { result } = renderHook(() => useVault());

    for (let i = 0; i < 8; i++) {
      act(() => {
        result.current.setVaultPath(`/vault-${i}`);
      });
    }

    expect(result.current.recentVaults.length).toBeLessThanOrEqual(6);
  });

  it('handles corrupt localStorage for recent vaults', () => {
    localStorage.setItem('classnotes:recentVaults', 'not-json');
    const { result } = renderHook(() => useVault());
    expect(result.current.recentVaults).toEqual([]);
  });

  it('filters non-string values from recent vaults', () => {
    localStorage.setItem('classnotes:recentVaults', JSON.stringify(['/a', 42, null, '/b']));
    const { result } = renderHook(() => useVault());
    expect(result.current.recentVaults).toEqual(['/a', '/b']);
  });
});
