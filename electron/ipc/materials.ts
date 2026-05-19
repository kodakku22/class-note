import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateVaultPath, exists, ensureDir, safeName } from './utils';
import { consumeFileAccessGrant, isLikelyFileAccessToken } from './file-access';
import { logger } from '../logger';

async function uniqueDestination(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let i = 1;
  while (await exists(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

export function createMaterialsHandlers() {
  return {
    'materials:addFiles': async (e: unknown, vaultPath: string, subject: string, srcPaths: string[]) => {
      const root = path.resolve(vaultPath);
      const safeSubject = safeName(subject);
      if (!safeSubject) return { added: [] };
      const targetDir = path.join(root, safeSubject, 'materials');
      validateVaultPath(targetDir, root);
      await ensureDir(targetDir);

      const added: string[] = [];
      for (const src of srcPaths) {
        try {
          const source = isLikelyFileAccessToken(src)
            ? await consumeFileAccessGrant(src, 'attachment-source', (e as { sender: { id: number } }).sender.id)
            : validateVaultPath(src, root);
          const stat = await fs.stat(source);
          if (!stat.isFile()) continue;
          const dest = await uniqueDestination(targetDir, safeName(path.basename(source)));
          validateVaultPath(dest, root);
          await fs.copyFile(source, dest);
          added.push(dest);
        } catch (err) {
          logger.warn('[materials:addFiles] rejected source', {
            fileName: path.basename(src),
            error: err,
          });
        }
      }
      return { added };
    },
  };
}

export function registerMaterialsHandlers() {
  const handlers = createMaterialsHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
