import * as path from 'path';
import {
  getVaultIndex,
  removeVaultIndexFile,
  updateVaultIndexFile,
} from '../vault-index';

export async function getBacklinkSources(vaultPath: string, targetName: string): Promise<string[]> {
  const root = path.resolve(vaultPath);
  const index = await getVaultIndex(root);
  return index.files
    .filter((file) => file.kind === 'note' && file.wikilinks.includes(targetName))
    .map((file) => path.join(root, ...file.relPath.split('/')));
}

/**
 * Update a single file's index entry after it's been written or detected by
 * the file watcher. Backlinks are derived from the shared Vault index.
 */
export async function refreshFile(vaultPath: string, filePath: string): Promise<void> {
  await updateVaultIndexFile(vaultPath, filePath);
}

export async function removeFile(vaultPath: string, filePath: string): Promise<void> {
  await removeVaultIndexFile(vaultPath, filePath);
}

export function invalidateBacklinkCache(): void {
  // Kept for existing watcher callsites. The shared index is persisted, so
  // there is no in-memory backlink cache to clear.
}
