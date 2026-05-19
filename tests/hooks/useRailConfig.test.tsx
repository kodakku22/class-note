import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useRailConfig } from '../../src/hooks/useRailConfig';

const getMock = vi.fn();
const setMock = vi.fn();

beforeEach(() => {
  getMock.mockReset();
  setMock.mockReset();
  setMock.mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    settings: { get: getMock, set: setMock },
  };
});

describe('useRailConfig / persistence', () => {
  it('loads saved settings on mount', async () => {
    getMock.mockResolvedValueOnce({
      uiMode: 'full',
      railItems: ['subjects', 'daily', 'timetable', 'books', 'papers', 'memos', 'wiki', 'outputs', 'progress', 'graph'],
      railCommandIds: ['faq-help'],
    });
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(result.current.uiMode).toBe('full'));
    expect(result.current.railCommandIds).toContain('faq-help');
    expect(result.current.railItems.length).toBe(10);
  });

  it('falls back to simple when no settings are present', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(result.current.uiMode).toBe('simple');
  });
});

describe('useRailConfig / handlers persist via window.api.settings.set', () => {
  it('handleChangeRailMode persists the new mode', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await act(async () => {
      result.current.handleChangeRailMode('full');
    });
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ uiMode: 'full' }));
    expect(result.current.uiMode).toBe('full');
  });

  it('handleAddRailView appends and sets custom mode', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await act(async () => {
      result.current.handleAddRailView('papers');
    });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ uiMode: 'custom', railItems: expect.arrayContaining(['papers']) })
    );
  });

  it('handleAddRailCommand appends + sets custom', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await act(async () => {
      result.current.handleAddRailCommand('faq-help');
    });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ uiMode: 'custom', railCommandIds: ['faq-help'] })
    );
  });

  it('handleResetRailSimple persists simple + base IDs', async () => {
    getMock.mockResolvedValueOnce({ uiMode: 'custom', railItems: ['papers'], railCommandIds: ['x'] });
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(result.current.uiMode).toBe('custom'));

    await act(async () => {
      result.current.handleResetRailSimple();
    });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ uiMode: 'simple', railCommandIds: [] })
    );
    expect(result.current.uiMode).toBe('simple');
  });

  it('handleSetRailFull persists full + 10 view ids', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await act(async () => {
      result.current.handleSetRailFull();
    });
    const setCall = setMock.mock.calls.at(-1)?.[0];
    expect(setCall.uiMode).toBe('full');
    expect(setCall.railItems.length).toBe(10);
  });

  it('handleReorderRailViews uses sanitizeRailViewIds to enforce known ids', async () => {
    getMock.mockResolvedValueOnce({
      uiMode: 'custom',
      railItems: ['subjects', 'daily'],
      railCommandIds: [],
    });
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(result.current.railItems.length).toBe(2));

    await act(async () => {
      result.current.handleReorderRailViews(['daily', 'subjects']);
    });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ railItems: ['daily', 'subjects'] })
    );
  });

  it('handleReorderRailCommands strips empties + dedupes', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    await act(async () => {
      result.current.handleReorderRailCommands(['a', 'a', '', 'b']);
    });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ railCommandIds: ['a', 'b'] })
    );
  });
});

describe('useRailConfig / derived render data', () => {
  it('railViewItems reflect current viewMode via active flag', async () => {
    getMock.mockResolvedValueOnce({ uiMode: 'simple' });
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'daily', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    const daily = result.current.railViewItems.find((v) => v.id === 'daily');
    const subjects = result.current.railViewItems.find((v) => v.id === 'subjects');
    expect(daily?.active).toBe(true);
    expect(subjects?.active).toBe(false);
  });

  it('railViewItems.onClick calls setViewMode with the matching id', async () => {
    getMock.mockResolvedValueOnce({ uiMode: 'full' });
    const setViewMode = vi.fn();
    const { result } = renderHook(() => useRailConfig({ viewMode: 'subject', setViewMode }));
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    const papersItem = result.current.railViewItems.find((v) => v.id === 'papers');
    act(() => papersItem?.onClick());
    expect(setViewMode).toHaveBeenCalledWith('papers');
  });

  it('railViewOptions exposes all 10 full-mode views', async () => {
    getMock.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(result.current.railViewOptions.length).toBe(10);
  });

  it('resolvedRailCommandIds is [] in simple mode regardless of railCommandIds', async () => {
    getMock.mockResolvedValueOnce({ uiMode: 'simple', railCommandIds: ['faq-help'] });
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'subject', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(result.current.resolvedRailCommandIds).toEqual([]);
  });

  it('books active when viewMode is books-detail', async () => {
    getMock.mockResolvedValueOnce({ uiMode: 'simple' });
    const { result } = renderHook(() =>
      useRailConfig({ viewMode: 'books-detail', setViewMode: vi.fn() })
    );
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    const books = result.current.railViewItems.find((v) => v.id === 'books');
    expect(books?.active).toBe(true);
  });
});
