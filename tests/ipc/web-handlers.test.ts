// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempVault } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  net: {
    request: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

// Mock url-security to control URL validation
vi.mock('../../electron/net/url-security', () => ({
  PRIVATE_NETWORK_URL_ERROR: 'private network URL blocked',
  validatePublicHttpUrl: vi.fn(),
}));

// Mock resilience to avoid real retries
vi.mock('../../electron/net/resilience', () => ({
  RetryableHttpError: class extends Error {
    statusCode: number;
    constructor(code: number) {
      super(`HTTP ${code}`);
      this.statusCode = code;
    }
  },
  withResilience: vi.fn(),
}));

// Mock linkedom and defuddle used by defuddleHTML
vi.mock('linkedom', () => ({
  parseHTML: vi.fn().mockReturnValue({
    document: {
      createElement: vi.fn().mockReturnValue({ href: '' }),
      head: { prepend: vi.fn() },
    },
  }),
}));

vi.mock('defuddle', () => {
  class MockDefuddle {
    constructor(_doc: unknown) {}
    parse() {
      return {
        content: 'This is a test article body with enough content to pass the minimum length check for the web clipper feature in ClassNotes.',
        title: 'Test Article',
        byline: 'Test Author',
        wordCount: 25,
      };
    }
  }
  return { default: MockDefuddle, Defuddle: MockDefuddle };
});

import { createWebHandlers } from '../../electron/ipc/web';
import { validatePublicHttpUrl, PRIVATE_NETWORK_URL_ERROR } from '../../electron/net/url-security';
import { withResilience } from '../../electron/net/resilience';

const mockValidateUrl = vi.mocked(validatePublicHttpUrl);
const mockWithResilience = vi.mocked(withResilience);

type Handlers = ReturnType<typeof createWebHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createWebHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('web:clip', () => {
  it('rejects private network URLs', async () => {
    mockValidateUrl.mockRejectedValueOnce(new Error(PRIVATE_NETWORK_URL_ERROR));

    const result = await h['web:clip'](null, root, 'http://localhost:3000');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(PRIVATE_NETWORK_URL_ERROR);
    }
  });

  it('rejects invalid URLs', async () => {
    mockValidateUrl.mockRejectedValueOnce(new Error('invalid URL'));

    const result = await h['web:clip'](null, root, 'not-a-url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalid URL');
    }
  });

  it('returns defuddle error when content extraction fails', async () => {
    const testUrl = 'https://example.com/article';
    const parsedUrl = new URL(testUrl);

    mockValidateUrl.mockResolvedValueOnce(parsedUrl);
    mockValidateUrl.mockResolvedValueOnce(parsedUrl);

    mockWithResilience.mockResolvedValueOnce({
      kind: 'html',
      html: '<html><body><article>Content here.</article></body></html>',
    });

    const result = await h['web:clip'](null, root, testUrl);
    // defuddleHTML catches errors and the handler returns an error result
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns private network error when fetch redirect hits private IP', async () => {
    const testUrl = 'https://example.com/redirect-to-local';
    const parsedUrl = new URL(testUrl);

    mockValidateUrl.mockResolvedValueOnce(parsedUrl);
    mockValidateUrl.mockResolvedValueOnce(parsedUrl);

    mockWithResilience.mockRejectedValueOnce(new Error(PRIVATE_NETWORK_URL_ERROR));

    const result = await h['web:clip'](null, root, testUrl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(PRIVATE_NETWORK_URL_ERROR);
    }
  });

  it('exposes the web:clip handler function', () => {
    expect(typeof h['web:clip']).toBe('function');
  });

  it('returns error when fetch fails', async () => {
    const testUrl = 'https://example.com/fail';
    const parsedUrl = new URL(testUrl);

    mockValidateUrl.mockResolvedValueOnce(parsedUrl);
    mockValidateUrl.mockResolvedValueOnce(parsedUrl);

    mockWithResilience.mockRejectedValueOnce(new Error('network error'));

    const result = await h['web:clip'](null, root, testUrl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('network error');
    }
  });
});
