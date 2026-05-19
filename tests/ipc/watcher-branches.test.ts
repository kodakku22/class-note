// @vitest-environment node
//
// Tests for watcher.ts — focuses on event propagation branches and the
// propagate() inner function that the existing watcher.test.ts does not cover.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockClose = vi.fn();

// We need to capture the event listeners that startWatcher registers so we can
// fire them manually.
let listeners: Record<string, Function>;

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      listeners = {};
      const watcher = {
        on(event: string, handler: Function) {
          listeners[event] = handler;
          return watcher; // chokidar chains .on()
        },
        close: mockClose,
      };
      return watcher;
    }),
  },
}));

const mockRefreshFile = vi.fn().mockResolvedValue(undefined);
const mockRemoveFile = vi.fn().mockResolvedValue(undefined);
const mockInvalidateBacklinkCache = vi.fn();

vi.mock('../../electron/ipc/backlinks', () => ({
  refreshFile: (...args: unknown[]) => mockRefreshFile(...args),
  removeFile: (...args: unknown[]) => mockRemoveFile(...args),
  invalidateBacklinkCache: (...args: unknown[]) => mockInvalidateBacklinkCache(...args),
}));

/* ------------------------------------------------------------------ */
/* Module under test (imported AFTER mocks are set up)                 */
/* ------------------------------------------------------------------ */
import { startWatcher, stopWatcher } from '../../electron/ipc/watcher';

describe('watcher event propagation', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn();
    startWatcher('/test-vault', onChange);
  });

  afterEach(() => {
    stopWatcher();
  });

  /* ---- add event ---- */
  it('propagates "add" event and calls refreshFile', async () => {
    listeners['add']('/test-vault/note.md');

    expect(onChange).toHaveBeenCalledWith('add', '/test-vault/note.md');
    expect(mockRefreshFile).toHaveBeenCalledWith('/test-vault', '/test-vault/note.md');
    expect(mockRemoveFile).not.toHaveBeenCalled();
  });

  /* ---- change event ---- */
  it('propagates "change" event and calls refreshFile', async () => {
    listeners['change']('/test-vault/note.md');

    expect(onChange).toHaveBeenCalledWith('change', '/test-vault/note.md');
    expect(mockRefreshFile).toHaveBeenCalledWith('/test-vault', '/test-vault/note.md');
    expect(mockRemoveFile).not.toHaveBeenCalled();
  });

  /* ---- unlink event → removeFile branch ---- */
  it('propagates "unlink" event and calls removeFile (not refreshFile)', async () => {
    listeners['unlink']('/test-vault/deleted.md');

    expect(onChange).toHaveBeenCalledWith('unlink', '/test-vault/deleted.md');
    expect(mockRemoveFile).toHaveBeenCalledWith('/test-vault', '/test-vault/deleted.md');
    expect(mockRefreshFile).not.toHaveBeenCalled();
  });

  /* ---- addDir event ---- */
  it('propagates "addDir" event and calls refreshFile', async () => {
    listeners['addDir']('/test-vault/subdir');

    expect(onChange).toHaveBeenCalledWith('addDir', '/test-vault/subdir');
    expect(mockRefreshFile).toHaveBeenCalledWith('/test-vault', '/test-vault/subdir');
  });

  /* ---- unlinkDir event ---- */
  it('propagates "unlinkDir" event, calls invalidateBacklinkCache and onChange', async () => {
    listeners['unlinkDir']('/test-vault/olddir');

    expect(mockInvalidateBacklinkCache).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('unlinkDir', '/test-vault/olddir');
    // unlinkDir does NOT go through propagate(), so no refreshFile/removeFile
    expect(mockRefreshFile).not.toHaveBeenCalled();
    expect(mockRemoveFile).not.toHaveBeenCalled();
  });
});

describe('watcher propagate() error handling', () => {
  afterEach(() => {
    stopWatcher();
  });

  it('swallows errors from refreshFile via .catch()', async () => {
    vi.clearAllMocks();
    mockRefreshFile.mockRejectedValueOnce(new Error('disk fail'));

    const onChange = vi.fn();
    startWatcher('/vault', onChange);

    // Should not throw even though refreshFile rejects
    expect(() => listeners['add']('/vault/a.md')).not.toThrow();
    expect(onChange).toHaveBeenCalledWith('add', '/vault/a.md');
  });

  it('swallows errors from removeFile via .catch()', async () => {
    vi.clearAllMocks();
    mockRemoveFile.mockRejectedValueOnce(new Error('disk fail'));

    const onChange = vi.fn();
    startWatcher('/vault', onChange);

    expect(() => listeners['unlink']('/vault/b.md')).not.toThrow();
    expect(onChange).toHaveBeenCalledWith('unlink', '/vault/b.md');
  });
});

describe('stopWatcher branches', () => {
  it('is a no-op when called without an active watcher', () => {
    // Ensure no watcher is active by calling stopWatcher first
    stopWatcher();
    vi.clearAllMocks();

    // Call again — should not throw and should still invalidate cache
    expect(() => stopWatcher()).not.toThrow();
    expect(mockInvalidateBacklinkCache).toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('closes the watcher and nullifies it', () => {
    vi.clearAllMocks();
    startWatcher('/v', vi.fn());
    stopWatcher();

    expect(mockClose).toHaveBeenCalledOnce();
    expect(mockInvalidateBacklinkCache).toHaveBeenCalled();
  });
});

describe('startWatcher stops previous watcher', () => {
  afterEach(() => {
    stopWatcher();
  });

  it('calls stopWatcher (and therefore close) on the previous watcher', () => {
    vi.clearAllMocks();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    startWatcher('/vault1', cb1);
    // Starting a second watcher should close the first
    startWatcher('/vault2', cb2);

    expect(mockClose).toHaveBeenCalledOnce();
  });
});
