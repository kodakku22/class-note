// Security-critical tests for the vault-path validator.
// If any of these regress, file system isolation is broken.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { validateVaultPath } from '../../electron/ipc/utils';

const ROOT = path.resolve('/vault');

describe('validateVaultPath', () => {
  it('accepts the vault root itself', () => {
    expect(validateVaultPath(ROOT, ROOT)).toBe(ROOT);
  });

  it('accepts an immediate child', () => {
    const p = path.join(ROOT, 'notes', 'a.md');
    expect(validateVaultPath(p, ROOT)).toBe(path.resolve(p));
  });

  it('accepts a deeply-nested child', () => {
    const p = path.join(ROOT, 'a', 'b', 'c', 'd', 'e.md');
    expect(validateVaultPath(p, ROOT)).toBe(path.resolve(p));
  });

  it('rejects a relative-traversal path that climbs above the root', () => {
    expect(() => validateVaultPath(path.join(ROOT, '..', 'etc', 'passwd'), ROOT)).toThrow(
      /Access denied/
    );
  });

  it('rejects a sibling directory of the vault', () => {
    const sibling = path.resolve(path.dirname(ROOT), 'other-vault', 'note.md');
    expect(() => validateVaultPath(sibling, ROOT)).toThrow(/Access denied/);
  });

  it('rejects an absolute system path', () => {
    expect(() => validateVaultPath('/etc/passwd', ROOT)).toThrow(/Access denied/);
  });

  it('rejects a directory that merely shares a prefix with the vault', () => {
    // e.g. "/vaultmore" starts with "/vault" textually but is a different folder
    const sibling = path.resolve(ROOT + 'more', 'note.md');
    expect(() => validateVaultPath(sibling, ROOT)).toThrow(/Access denied/);
  });

  it('rejects non-string inputs', () => {
    // @ts-expect-error testing runtime guard
    expect(() => validateVaultPath(undefined, ROOT)).toThrow(/Access denied/);
    // @ts-expect-error
    expect(() => validateVaultPath('/vault/x', undefined)).toThrow(/Access denied/);
    // @ts-expect-error
    expect(() => validateVaultPath(null, ROOT)).toThrow(/Access denied/);
  });

  it('normalises mixed separators', () => {
    const p = path.join(ROOT, 'a/b/c.md');
    expect(validateVaultPath(p, ROOT)).toBe(path.resolve(p));
  });

  it('blocks ../ embedded mid-path even if the prefix looks safe', () => {
    expect(() =>
      validateVaultPath(path.join(ROOT, 'a', '..', '..', 'evil.md'), ROOT)
    ).toThrow(/Access denied/);
  });
});
