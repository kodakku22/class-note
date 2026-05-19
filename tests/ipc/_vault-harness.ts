// @vitest-environment node
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

export async function createTempVault(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const base = path.join(os.tmpdir(), `classnotes-test-${randomUUID()}`);
  const root = path.join(base, 'ClassVault');
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, '.obsidian'), { recursive: true });
  return {
    root,
    cleanup: async () => {
      try {
        await fs.rm(base, { recursive: true, force: true });
      } catch {}
    },
  };
}

export async function addSubject(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(path.join(dir, 'notes'), { recursive: true });
  await fs.mkdir(path.join(dir, 'materials'), { recursive: true });
  await fs.mkdir(path.join(dir, 'qa'), { recursive: true });
  return dir;
}

export async function writeNote(
  root: string,
  subject: string,
  name: string,
  content: string
): Promise<string> {
  const fp = path.join(root, subject, 'notes', name.endsWith('.md') ? name : `${name}.md`);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, content, 'utf-8');
  return fp;
}

export async function writeMaterial(
  root: string,
  subject: string,
  name: string,
  content: string | Buffer
): Promise<string> {
  const fp = path.join(root, subject, 'materials', name);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, content);
  return fp;
}

export async function readFile(fp: string): Promise<string> {
  return fs.readFile(fp, 'utf-8');
}

export async function fileExists(fp: string): Promise<boolean> {
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}
