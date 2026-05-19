// @vitest-environment node
//
// Tests that the preload api object is structured correctly and forwards
// calls to ipcRenderer.invoke with the expected channel names.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue({});
const mockOn = vi.fn().mockReturnValue(vi.fn());
const mockOnce = vi.fn();
const mockSend = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (...args: unknown[]) => mockOn(...args),
    once: (...args: unknown[]) => mockOnce(...args),
    send: (...args: unknown[]) => mockSend(...args),
  },
}));

// Import after mocking
import { contextBridge } from 'electron';

beforeEach(() => {
  vi.clearAllMocks();
  // Re-execute the preload module to trigger exposeInMainWorld
  vi.resetModules();
});

describe('preload api structure', () => {
  it('calls contextBridge.exposeInMainWorld with "api"', async () => {
    // Re-import to trigger the module's side effect
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    expect(bridge.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object));
  });

  it('exposes vault namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('vault');
    expect(api.vault).toHaveProperty('init');
    expect(api.vault).toHaveProperty('listSubjects');
    expect(api.vault).toHaveProperty('createSubject');
    expect(api.vault).toHaveProperty('listFiles');
    expect(api.vault).toHaveProperty('readNote');
    expect(api.vault).toHaveProperty('writeNote');
  });

  it('exposes settings namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('settings');
    expect(api.settings).toHaveProperty('get');
    expect(api.settings).toHaveProperty('set');
  });

  it('exposes qa namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('qa');
    expect(api.qa).toHaveProperty('ask');
  });

  it('exposes ai namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('ai');
    expect(api.ai).toHaveProperty('summarize');
    expect(api.ai).toHaveProperty('autoTag');
  });

  it('exposes search namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('search');
    expect(api.search).toHaveProperty('query');
  });

  it('exposes papers namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('papers');
    expect(api.papers).toHaveProperty('list');
    expect(api.papers).toHaveProperty('create');
  });

  it('exposes books namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('books');
    expect(api.books).toHaveProperty('list');
    expect(api.books).toHaveProperty('create');
  });

  it('exposes wiki namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('wiki');
    expect(api.wiki).toHaveProperty('list');
  });

  it('exposes memos namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('memos');
    expect(api.memos).toHaveProperty('list');
    expect(api.memos).toHaveProperty('create');
  });

  it('vault.init forwards to ipcRenderer.invoke', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];

    await api.vault.init('/test/path');
    expect(mockInvoke).toHaveBeenCalledWith('vault:init', '/test/path');
  });

  it('vault.listSubjects forwards correctly', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];

    await api.vault.listSubjects('/vault');
    expect(mockInvoke).toHaveBeenCalledWith('vault:listSubjects', '/vault');
  });

  it('search.query forwards correctly', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];

    await api.search.query('/vault', 'keyword');
    expect(mockInvoke).toHaveBeenCalledWith('search:query', '/vault', 'keyword');
  });

  it('settings.get forwards correctly', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];

    await api.settings.get();
    expect(mockInvoke).toHaveBeenCalledWith('settings:get');
  });

  it('exposes appWindow namespace', async () => {
    await import('../../electron/preload');
    const bridge = vi.mocked(contextBridge);
    const [, api] = bridge.exposeInMainWorld.mock.calls[0];
    expect(api).toHaveProperty('appWindow');
    expect(api.appWindow).toHaveProperty('minimize');
    expect(api.appWindow).toHaveProperty('toggleMaximize');
    expect(api.appWindow).toHaveProperty('close');
  });
});
