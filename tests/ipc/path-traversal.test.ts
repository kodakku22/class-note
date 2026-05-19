// @vitest-environment node
//
// Path traversal protection. validateVaultPath is the single guard against
// '../../etc/passwd', symlink-escapes, and absolute-path injection. Every
// IPC handler that takes a caller-supplied path must run through it.
//
// These tests exercise the contract directly so we never regress.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { validateVaultPath } from '../../electron/ipc/utils';

describe('validateVaultPath', () => {
  const vault = path.resolve('/tmp/fake-vault');

  it('accepts a path inside the vault', () => {
    const inside = path.join(vault, 'subj', 'notes', 'a.md');
    expect(() => validateVaultPath(inside, vault)).not.toThrow();
  });

  it('accepts the vault root itself', () => {
    expect(() => validateVaultPath(vault, vault)).not.toThrow();
  });

  it('rejects parent-directory escape', () => {
    const escape = path.join(vault, '..', 'etc', 'passwd');
    expect(() => validateVaultPath(escape, vault)).toThrow(/Access denied/);
  });

  it('rejects absolute paths outside the vault', () => {
    expect(() =>
      validateVaultPath('/etc/passwd', vault)
    ).toThrow(/Access denied/);
  });

  it('rejects Windows system paths', () => {
    if (process.platform !== 'win32') return; // skip on POSIX
    expect(() =>
      validateVaultPath('C:\\Windows\\System32\\drivers\\etc\\hosts', 'C:\\fake-vault')
    ).toThrow(/Access denied/);
  });

  it('rejects when filePath is not a string', () => {
    // @ts-expect-error testing input validation
    expect(() => validateVaultPath(null, vault)).toThrow(/Access denied/);
    // @ts-expect-error testing input validation
    expect(() => validateVaultPath(undefined, vault)).toThrow(/Access denied/);
    // @ts-expect-error testing input validation
    expect(() => validateVaultPath(123, vault)).toThrow(/Access denied/);
  });

  it('rejects vaultRoot that is not a string', () => {
    // @ts-expect-error testing input validation
    expect(() => validateVaultPath('/tmp/x', null)).toThrow(/Access denied/);
  });

  it('rejects sibling-prefix collision (vault-other vs vault)', () => {
    // /tmp/fake-vault-evil/file should NOT be accepted because the prefix match
    // is on the directory boundary, not just string prefix.
    const sibling = path.resolve('/tmp/fake-vault-evil/file.md');
    expect(() => validateVaultPath(sibling, vault)).toThrow(/Access denied/);
  });

  it('rejects paths that escape through a symlink or junction inside the vault', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'classnotes-path-'));
    const realVault = path.join(base, 'vault');
    const outside = path.join(base, 'outside');
    await fs.mkdir(realVault);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.md'), 'secret', 'utf-8');

    const link = path.join(realVault, 'linked-outside');
    try {
      await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      await fs.rm(base, { recursive: true, force: true });
      return;
    }

    expect(() => validateVaultPath(path.join(link, 'secret.md'), realVault)).toThrow(
      /Access denied/
    );
    await fs.rm(base, { recursive: true, force: true });
  });
});
