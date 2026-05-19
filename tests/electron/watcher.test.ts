// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockWatch = vi.fn();
const mockClose = vi.fn();

vi.mock('chokidar', () => ({
  default: {
    watch: (...args: unknown[]) => {
      mockWatch(...args);
      const listeners: Record<string, Function> = {};
      return {
        on: (event: string, handler: Function) => {
          listeners[event] = handler;
          return { on: (e2: string, h2: Function) => { listeners[e2] = h2; return { on: (e3: string, h3: Function) => { listeners[e3] = h3; return { on: (e4: string, h4: Function) => { listeners[e4] = h4; return { on: (e5: string, h5: Function) => { listeners[e5] = h5; } }; } }; } }; } };
        },
        close: mockClose,
        _listeners: listeners,
      };
    },
  },
}));

vi.mock('../../electron/ipc/backlinks', () => ({
  refreshFile: vi.fn().mockResolvedValue(undefined),
  removeFile: vi.fn().mockResolvedValue(undefined),
  invalidateBacklinkCache: vi.fn(),
}));

import { startWatcher, stopWatcher } from '../../electron/ipc/watcher';
import { invalidateBacklinkCache } from '../../electron/ipc/backlinks';

describe('startWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopWatcher();
  });

  it('calls chokidar.watch with vault path', () => {
    const onChange = vi.fn();
    startWatcher('/vault', onChange);
    expect(mockWatch).toHaveBeenCalledWith('/vault', expect.any(Object));
  });

  it('stops previous watcher when starting new one', () => {
    const onChange = vi.fn();
    startWatcher('/vault1', onChange);
    startWatcher('/vault2', onChange);
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

describe('stopWatcher', () => {
  it('does not throw when no watcher is active', () => {
    expect(() => stopWatcher()).not.toThrow();
  });

  it('closes active watcher', () => {
    startWatcher('/vault', vi.fn());
    stopWatcher();
    expect(mockClose).toHaveBeenCalled();
  });

  it('invalidates backlink cache', () => {
    stopWatcher();
    expect(invalidateBacklinkCache).toHaveBeenCalled();
  });
});
