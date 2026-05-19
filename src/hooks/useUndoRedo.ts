// History stack with undo/redo. Coalesces rapid updates so a typing burst
// doesn't blow up memory.
import { useCallback, useRef, useState } from 'react';

const COALESCE_MS = 600;

type Options = {
  /** Max number of historical states retained. */
  limit?: number;
  /** Coalesce window in milliseconds. */
  coalesceMs?: number;
};

export function useUndoRedo<T>(initial: T, options: Options = {}) {
  const limit = options.limit ?? 100;
  const coalesce = options.coalesceMs ?? COALESCE_MS;

  const [history, setHistory] = useState<T[]>([initial]);
  const [pointer, setPointer] = useState(0);
  const lastWriteRef = useRef<number>(0);

  const current = history[pointer];

  const set = useCallback(
    (value: T) => {
      const now = Date.now();
      const sinceLast = now - lastWriteRef.current;
      lastWriteRef.current = now;
      setHistory((prev) => {
        const truncated = prev.slice(0, pointer + 1);
        // Coalesce: replace the latest entry instead of pushing a new one.
        if (sinceLast < coalesce && truncated.length > 0) {
          truncated[truncated.length - 1] = value;
          return truncated;
        }
        const next = [...truncated, value];
        if (next.length > limit) next.splice(0, next.length - limit);
        return next;
      });
      setPointer((p) => {
        const truncatedLen = Math.min(p + 1, history.length);
        if (sinceLast < coalesce) return Math.min(truncatedLen - 1, p);
        return Math.min(p + 1, limit - 1);
      });
    },
    [pointer, history.length, coalesce, limit]
  );

  const undo = useCallback(() => {
    setPointer((p) => Math.max(0, p - 1));
  }, []);

  const redo = useCallback(() => {
    setPointer((p) => Math.min(history.length - 1, p + 1));
  }, [history.length]);

  const reset = useCallback((value: T) => {
    setHistory([value]);
    setPointer(0);
    lastWriteRef.current = 0;
  }, []);

  return {
    current,
    set,
    undo,
    redo,
    reset,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
  };
}
