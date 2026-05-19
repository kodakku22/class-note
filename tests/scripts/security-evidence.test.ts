// @vitest-environment node
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';

function runNode(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script], { cwd: process.cwd(), windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe('security evidence scripts', () => {
  it('generates an SBOM from package-lock', async () => {
    await runNode(path.join('scripts', 'generate-sbom.mjs'));
    const sbom = JSON.parse(await readFile(path.join('security', 'sbom.cdx.json'), 'utf-8')) as {
      bomFormat: string;
      components: unknown[];
    };

    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.components.length).toBeGreaterThan(100);
  });

  it('generates an IPC surface manifest with no missing handlers', async () => {
    await runNode(path.join('scripts', 'ipc-surface.mjs'));
    const manifest = JSON.parse(await readFile(path.join('security', 'ipc-surface.json'), 'utf-8')) as {
      counts: { mainHandlers: number; preloadInvokes: number; missingHandlers: number };
    };

    expect(manifest.counts.mainHandlers).toBeGreaterThan(10);
    expect(manifest.counts.preloadInvokes).toBeGreaterThan(10);
    expect(manifest.counts.missingHandlers).toBe(0);
  });
});
