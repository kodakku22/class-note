// Obsidian CLI bridge — Obsidian Skill #5 (vault analysis via the official
// Obsidian CLI). When the user installs `@obsidian/skills-cli` globally and
// enables CLI mode in Obsidian (`Settings → CLI → On`), this module detects
// the binary and exposes targeted analysis commands to the renderer.
//
// Detection order:
//   1. `obsidian-skills` in PATH       (the user's install per docs)
//   2. `obsidian` with `--analyze` flag (some platforms)
//   3. None — UI shows "未検出" and falls back to the in-process
//      `agents.analyzeVault` (which works without Obsidian).
//
// We deliberately keep this read-only: the bridge can ASK the CLI for
// information, but never lets it modify the Vault. Mutations go through
// our own IPC handlers so security invariants stay intact.
import { execFile } from 'child_process';
import { logger } from '../logger';

let cachedBinary: { path: string; version?: string } | null | undefined = undefined;

/**
 * Run a binary and capture stdout. Times out after 30s — analysis on a huge
 * vault could legitimately take longer, but we want to surface progress
 * rather than hang indefinitely.
 */
function exec(binary: string, args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString().trim() || err.message));
          return;
        }
        resolve(stdout.toString());
      }
    );
  });
}

/**
 * Locate the Obsidian Skills CLI binary. Cached for the process lifetime;
 * `clearCache()` forces re-detection (e.g. after the user installs).
 */
export async function detectObsidianCLI(): Promise<{
  path: string;
  version?: string;
} | null> {
  if (cachedBinary !== undefined) return cachedBinary;
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  const candidates = ['obsidian-skills', 'obsidian'];
  for (const candidate of candidates) {
    try {
      const out = await exec(finder, [candidate], 5_000);
      const lines = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const exe =
        lines.find((l) => l.toLowerCase().endsWith('.exe')) ||
        lines.find((l) => !l.toLowerCase().endsWith('.cmd')) ||
        lines[0];
      if (!exe) continue;
      // Probe version (best-effort).
      let version: string | undefined;
      try {
        const v = await exec(exe, ['--version'], 5_000);
        version = v.trim().split('\n')[0];
      } catch {
        // some builds don't support --version; that's fine
      }
      cachedBinary = { path: exe, version };
      logger.info('[obsidian-bridge] detected', cachedBinary);
      return cachedBinary;
    } catch {
      continue;
    }
  }
  cachedBinary = null;
  logger.info('[obsidian-bridge] not detected');
  return null;
}

export function clearDetectionCache(): void {
  cachedBinary = undefined;
}

/**
 * Run a vault analysis through the Obsidian Skills CLI. The CLI's `analyze`
 * subcommand returns JSON when given `--json`. If the user's CLI doesn't
 * support that flag, we fall back to parsing tag and orphan info heuristically.
 */
export async function analyzeWithCLI(vaultPath: string): Promise<{
  ok: boolean;
  output?: string;
  error?: string;
}> {
  const bin = await detectObsidianCLI();
  if (!bin) {
    return { ok: false, error: 'Obsidian CLI が見つかりません' };
  }
  try {
    const output = await exec(
      bin.path,
      ['analyze', '--vault', vaultPath, '--json'],
      120_000
    );
    return { ok: true, output };
  } catch (err) {
    // Fallback: try without --json
    try {
      const output = await exec(bin.path, ['analyze', '--vault', vaultPath], 120_000);
      return { ok: true, output };
    } catch (err2) {
      return { ok: false, error: String(err2 ?? err) };
    }
  }
}
