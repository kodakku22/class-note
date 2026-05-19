import chokidar, { FSWatcher } from 'chokidar';
import { refreshFile, removeFile, invalidateBacklinkCache } from './backlinks';

let watcher: FSWatcher | null = null;
let activeVault: string | null = null;

export function startWatcher(vaultPath: string, onChange: (event: string, file: string) => void) {
  stopWatcher();
  activeVault = vaultPath;
  watcher = chokidar.watch(vaultPath, {
    ignoreInitial: true,
    ignored: /(^|[\\/])\.[^\\/]/,
    depth: 4,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const propagate = (event: string, p: string) => {
    onChange(event, p);
    // Keep the shared Vault index hot when files move.
    if (activeVault) {
      const update = event === 'unlink' ? removeFile : refreshFile;
      update(activeVault, p).catch(() => {});
    }
  };

  watcher.on('add', (p) => propagate('add', p));
  watcher.on('change', (p) => propagate('change', p));
  watcher.on('unlink', (p) => propagate('unlink', p));
  watcher.on('addDir', (p) => propagate('addDir', p));
  watcher.on('unlinkDir', (p) => {
    invalidateBacklinkCache();
    onChange('unlinkDir', p);
  });
}

export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  activeVault = null;
  invalidateBacklinkCache();
}
