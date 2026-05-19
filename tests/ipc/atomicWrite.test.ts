// @vitest-environment node
//
// atomicWrite must:
//   - Survive a crash mid-write without corrupting the destination
//   - Clean up its temp file on rename failure
//   - Create parent dirs as needed
//
// We can't simulate a crash, but we can verify the rename-from-temp pattern
// by checking that the temp file doesn't exist after a successful write.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { atomicWrite } from '../../electron/ipc/utils';

let tmpDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classnotes-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('atomicWrite', () => {
  it('writes a string to the target path', async () => {
    const target = path.join(tmpDir, 'a.md');
    await atomicWrite(target, 'hello');
    const content = await fs.readFile(target, 'utf-8');
    expect(content).toBe('hello');
  });

  it('creates parent directories as needed', async () => {
    const target = path.join(tmpDir, 'sub', 'dir', 'a.md');
    await atomicWrite(target, 'hello');
    const content = await fs.readFile(target, 'utf-8');
    expect(content).toBe('hello');
  });

  it('overwrites an existing file atomically', async () => {
    const target = path.join(tmpDir, 'a.md');
    await fs.writeFile(target, 'old');
    await atomicWrite(target, 'new');
    const content = await fs.readFile(target, 'utf-8');
    expect(content).toBe('new');
  });

  it('does not leave temp files behind', async () => {
    const target = path.join(tmpDir, 'a.md');
    await atomicWrite(target, 'hello');
    const entries = await fs.readdir(tmpDir);
    const tmpFiles = entries.filter((e) => e.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('handles Buffer content', async () => {
    const target = path.join(tmpDir, 'bin');
    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    await atomicWrite(target, data);
    const content = await fs.readFile(target);
    expect(content.equals(data)).toBe(true);
  });
});
