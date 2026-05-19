// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, readFile, fileExists } from './_vault-harness';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import {
  validateVaultPath,
  setCurrentVaultPath,
  getCurrentVaultPath,
  atomicWrite,
  backupFile,
  exists,
  ensureDir,
  safeName,
} from '../../electron/ipc/utils';

let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

describe('validateVaultPath', () => {
  it('accepts paths inside vault', () => {
    const result = validateVaultPath(path.join(root, 'notes', 'test.md'), root);
    expect(result).toBeDefined();
  });

  it('rejects paths outside vault', () => {
    expect(() => validateVaultPath('/etc/passwd', root)).toThrow();
  });

  it('rejects path traversal', () => {
    expect(() => validateVaultPath(path.join(root, '..', '..', 'etc', 'passwd'), root)).toThrow();
  });

  it('rejects paths equal to vault root', () => {
    // root itself should be valid (rel === '')
    const result = validateVaultPath(root, root);
    expect(result).toBeDefined();
  });
});

describe('setCurrentVaultPath / getCurrentVaultPath', () => {
  it('stores and retrieves vault path', () => {
    setCurrentVaultPath(root);
    expect(getCurrentVaultPath()).toBe(path.resolve(root));
  });

  it('returns null when not set', () => {
    setCurrentVaultPath(null);
    expect(getCurrentVaultPath()).toBeNull();
  });
});

describe('atomicWrite', () => {
  it('writes content to file', async () => {
    const filePath = path.join(root, 'test.md');
    await atomicWrite(filePath, 'Hello World');
    expect(await readFile(filePath)).toBe('Hello World');
  });

  it('overwrites existing content', async () => {
    const filePath = path.join(root, 'test.md');
    await atomicWrite(filePath, 'Original');
    await atomicWrite(filePath, 'Updated');
    expect(await readFile(filePath)).toBe('Updated');
  });

  it('creates parent directory if needed', async () => {
    const filePath = path.join(root, 'sub', 'dir', 'test.md');
    await atomicWrite(filePath, 'Deep content');
    expect(await readFile(filePath)).toBe('Deep content');
  });
});

describe('backupFile', () => {
  it('creates backup in .history directory', async () => {
    const filePath = path.join(root, 'Math', 'notes', 'test.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'Original content', 'utf-8');

    await backupFile(filePath, root);

    const historyDir = path.join(root, '.history');
    expect(await fileExists(historyDir)).toBe(true);
  });
});

describe('exists', () => {
  it('returns true for existing file', async () => {
    const filePath = path.join(root, 'test.md');
    await fs.writeFile(filePath, 'Content', 'utf-8');
    expect(await exists(filePath)).toBe(true);
  });

  it('returns false for non-existent file', async () => {
    expect(await exists(path.join(root, 'nonexistent.md'))).toBe(false);
  });
});

describe('ensureDir', () => {
  it('creates directory if it does not exist', async () => {
    const dir = path.join(root, 'new', 'deep', 'dir');
    await ensureDir(dir);
    expect(await fileExists(dir)).toBe(true);
  });

  it('does not fail if directory already exists', async () => {
    const dir = path.join(root, 'existing');
    await fs.mkdir(dir, { recursive: true });
    await expect(ensureDir(dir)).resolves.not.toThrow();
  });
});

describe('safeName', () => {
  it('keeps normal filenames', () => {
    expect(safeName('hello-world')).toBe('hello-world');
  });

  it('replaces forbidden characters', () => {
    const result = safeName('file:name/with*bad|chars');
    expect(result).not.toContain(':');
    expect(result).not.toContain('/');
    expect(result).not.toContain('*');
    expect(result).not.toContain('|');
  });

  it('returns _ for empty input', () => {
    expect(safeName('')).toBe('_');
  });

  it('returns _ for reserved names', () => {
    expect(safeName('CON')).toBe('_');
    expect(safeName('PRN')).toBe('_');
    expect(safeName('NUL')).toBe('_');
  });

  it('trims trailing dots and spaces', () => {
    expect(safeName('test...')).toBe('test');
    expect(safeName('test   ')).toBe('test');
  });

  it('normalizes unicode', () => {
    // NFC normalization
    const result = safeName('café');
    expect(result).toBe('café');
  });

  it('truncates very long names', () => {
    const long = 'a'.repeat(300);
    const result = safeName(long);
    expect(result.length).toBeLessThanOrEqual(255);
  });
});
