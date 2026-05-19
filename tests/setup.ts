// Vitest setup — runs once before each test file.
// - Adds jest-dom matchers (`toBeInTheDocument`, etc.) for component tests.
// - Stubs `window.api` with a permissive mock so renderer components can be
//   rendered in isolation without the Electron preload bridge.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// testing-library no longer auto-cleans-up under vitest; do it explicitly.
afterEach(() => cleanup());

if (typeof window !== 'undefined') {
  // A blanket Proxy mock — every `window.api.foo.bar(...)` returns a Promise that
  // resolves with sensible defaults. Individual tests can `vi.spyOn` to refine.
  const ok = () => Promise.resolve({ ok: true });
  const empty = () => Promise.resolve('');
  const arr = () => Promise.resolve([]);

  const handler: ProxyHandler<object> = {
    get(t, prop) {
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      // Allow test-specific overrides via direct assignment (e.g. api.memos = {...}).
      if (Object.prototype.hasOwnProperty.call(t, prop)) return (t as Record<string | symbol, unknown>)[prop];
      // Default: return another Proxy until called as a function.
      return new Proxy(function (this: unknown, ..._args: unknown[]) {
        // Heuristic returns based on common method names.
        const name = String(prop);
        if (name.startsWith('list') || name.startsWith('search')) return arr();
        if (name.startsWith('read')) return empty();
        if (name.startsWith('on') && typeof _args[0] === 'function') return () => undefined;
        return ok();
      } as unknown as object, handler);
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = new Proxy({}, handler);

  // jsdom doesn't implement matchMedia; stub it for components that probe theme.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
}
