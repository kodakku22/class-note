import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUndoRedo } from '../../src/hooks/useUndoRedo';

describe('useUndoRedo', () => {
  it('pushes history, undoes, redoes, and resets', () => {
    const { result } = renderHook(() => useUndoRedo('a', { coalesceMs: 0 }));

    act(() => result.current.set('b'));
    expect(result.current.current).toBe('b');
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.current).toBe('a');
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.current).toBe('b');

    act(() => result.current.reset('z'));
    expect(result.current.current).toBe('z');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('truncates redo history after editing from an older state', () => {
    const { result } = renderHook(() => useUndoRedo('one', { coalesceMs: 0 }));

    act(() => result.current.set('two'));
    act(() => result.current.set('three'));
    act(() => result.current.undo());
    expect(result.current.current).toBe('two');

    act(() => result.current.set('two-b'));
    expect(result.current.current).toBe('two-b');
    expect(result.current.canRedo).toBe(false);
  });

  it('keeps history within the configured limit', () => {
    const { result } = renderHook(() => useUndoRedo(0, { coalesceMs: 0, limit: 3 }));

    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.set(3));
    act(() => result.current.set(4));
    expect(result.current.current).toBe(4);

    act(() => result.current.undo());
    expect(result.current.current).toBe(3);
    act(() => result.current.undo());
    expect(result.current.current).toBe(2);
    act(() => result.current.undo());
    expect(result.current.current).toBe(2);
  });
});
