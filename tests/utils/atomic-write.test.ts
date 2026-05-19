import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { atomicWrite, backupFile, exists, ensureDir } from '../../electron/ipc/utils';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classnotes-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('atomicWrite', () => {
  it('writes a file with the expected content', async () => {
    const fp = path.join(tmpDir, 'a.txt');
    await atomicWrite(fp, 'hello');
    expect(await fs.readFile(fp, 'utf-8')).toBe('hello');
  });

  it('creates parent directories on demand', async () => {
    const fp = path.join(tmpDir, 'nested', 'deep', 'a.txt');
    await atomicWrite(fp, 'x');
    expect(await fs.readFile(fp, 'utf-8')).toBe('x');
  });

  it('overwrites existing content', async () => {
    const fp = path.join(tmpDir, 'a.txt');
    await atomicWrite(fp, 'old');
    await atomicWrite(fp, 'new');
    expect(await fs.readFile(fp, 'utf-8')).toBe('new');
  });

  it('does not leave .tmp files behind on success', async () => {
    const fp = path.join(tmpDir, 'a.txt');
    await atomicWrite(fp, 'x');
    const entries = await fs.readdir(tmpDir);
    expect(entries.filter((n) => n.includes('.tmp.'))).toHaveLength(0);
  });

  it('writes Buffer content', async () => {
    const fp = path.join(tmpDir, 'a.bin');
    const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    await atomicWrite(fp, buf);
    const read = await fs.readFile(fp);
    expect(read.equals(buf)).toBe(true);
  });
});

describe('backupFile', () => {
  it('copies the file into .history with a timestamp suffix', async () => {
    const vault = tmpDir;
    const fp = path.join(vault, 'note.md');
    await fs.writeFile(fp, 'v1');
    await backupFile(fp, vault);
    const histDir = path.join(vault, '.history');
    expect(await exists(histDir)).toBe(true);
    const entries = await fs.readdir(histDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatch(/^note_/);
  });

  it('does nothing if the source does not exist', async () => {
    const vault = tmpDir;
    const fp = path.join(vault, 'nonexistent.md');
    await backupFile(fp, vault);
    const histDir = path.join(vault, '.history');
    expect(await exists(histDir)).toBe(false);
  });

  it('keeps at most `keep` historical versions', async () => {
    const vault = tmpDir;
    const fp = path.join(vault, 'note.md');
    for (let i = 0; i < 7; i++) {
      await fs.writeFile(fp, `v${i}`);
      await backupFile(fp, vault, 3);
      // ensure timestamp uniqueness across iterations
      await new Promise((r) => setTimeout(r, 5));
    }
    const histDir = path.join(vault, '.history');
    const entries = await fs.readdir(histDir);
    expect(entries.length).toBeLessThanOrEqual(3);
  });

  it('refuses to write outside the vault when given a stray path', async () => {
    // Source is outside vault: backup should not throw, just no-op
    const vault = path.join(tmpDir, 'vault');
    await ensureDir(vault);
    const outside = path.join(tmpDir, 'outside.md');
    await fs.writeFile(outside, 'data');
    await backupFile(outside, vault);
    // .history under vault should remain absent
    expect(await exists(path.join(vault, '.history'))).toBe(false);
  });
});
