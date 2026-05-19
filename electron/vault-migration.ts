// Vault format versioning + migration framework.
//
// Phase 4 (S-B): Without versioned migrations, evolving the Vault layout
// (e.g. renaming `.classnotes/docai/log.md` → `.classnotes/docai/log-{ym}.md`,
// or moving frontmatter conventions) silently breaks old vaults.
//
// Convention:
//   - `<vault>/.classnotes/vault-version.txt` holds a single integer
//     (the schema version the vault was last opened with).
//   - When the app boots and the file's version is BELOW the current
//     CURRENT_VAULT_VERSION, each migration step from (old+1) up to current
//     runs in order. After all succeed, the file is updated.
//   - Each migration is a tiny pure-Node function with a number + description.
//   - Migrations must be IDEMPOTENT (safe to re-run) — if interrupted mid-run,
//     the next boot will retry from the same starting version.
//
// To add a migration: bump CURRENT_VAULT_VERSION, append to MIGRATIONS, write
// a unit test under tests/electron/vault-migration.test.ts.
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';
import { validateVaultPath } from './ipc/utils';

/** Current schema version. Bump when introducing a breaking Vault change. */
export const CURRENT_VAULT_VERSION = 1;

const VERSION_FILE = '.classnotes/vault-version.txt';

export type VaultMigration = {
  /** Target version this migration produces. */
  to: number;
  /** One-line description shown in logs. */
  description: string;
  /** Migration implementation. Must be idempotent. */
  run: (vaultRoot: string) => Promise<void>;
};

/**
 * Registered migrations, ordered by target version.
 *
 * Example template for future migrations:
 *   {
 *     to: 2,
 *     description: 'Rename .classnotes/docai/log.md → log-{YYYY-MM}.md',
 *     async run(vaultRoot) {
 *       const src = path.join(vaultRoot, '.classnotes/docai/log.md');
 *       if (!await exists(src)) return;
 *       const stat = await fs.stat(src);
 *       const ym = `${stat.mtime.getUTCFullYear()}-${...}`;
 *       const dst = path.join(vaultRoot, `.classnotes/docai/log-${ym}.md`);
 *       await fs.rename(src, dst);
 *     },
 *   },
 *
 * Current state: no migrations needed yet. Version 1 = initial schema.
 */
export const MIGRATIONS: VaultMigration[] = [];

async function readVersion(vaultRoot: string): Promise<number> {
  try {
    const p = path.join(vaultRoot, VERSION_FILE);
    validateVaultPath(p, vaultRoot);
    const raw = await fs.readFile(p, 'utf-8');
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  } catch {
    // Missing file = vault was created before versioning existed → version 0.
    return 0;
  }
}

async function writeVersion(vaultRoot: string, version: number): Promise<void> {
  const p = path.join(vaultRoot, VERSION_FILE);
  validateVaultPath(p, vaultRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, `${version}\n`, 'utf-8');
}

export type MigrationResult = {
  ok: boolean;
  fromVersion: number;
  toVersion: number;
  applied: number[];
  error?: string;
};

/**
 * Run all pending migrations for the given vault. Idempotent — calling
 * repeatedly on an up-to-date vault is a fast no-op (one file read).
 *
 * Failure semantics: if migration N fails, version file is left at N-1 so
 * the next boot retries from that point. Per-migration logs go to the
 * standard logger so users + support can diagnose.
 */
export async function migrateVault(vaultRoot: string): Promise<MigrationResult> {
  const fromVersion = await readVersion(vaultRoot);
  const applied: number[] = [];

  if (fromVersion >= CURRENT_VAULT_VERSION) {
    logger.debug(`[vault-migration] vault is up to date (v${fromVersion})`);
    return { ok: true, fromVersion, toVersion: fromVersion, applied };
  }

  logger.info(`[vault-migration] upgrading vault from v${fromVersion} → v${CURRENT_VAULT_VERSION}`);

  // Run only migrations whose `to` is in (fromVersion, CURRENT_VAULT_VERSION].
  const pending = MIGRATIONS.filter((m) => m.to > fromVersion && m.to <= CURRENT_VAULT_VERSION)
    .sort((a, b) => a.to - b.to);

  let currentVersion = fromVersion;
  for (const mig of pending) {
    try {
      logger.info(`[vault-migration] applying v${mig.to}: ${mig.description}`);
      await mig.run(vaultRoot);
      currentVersion = mig.to;
      applied.push(mig.to);
      await writeVersion(vaultRoot, currentVersion);
    } catch (err) {
      const error = String(err);
      logger.error(`[vault-migration] v${mig.to} FAILED:`, error);
      return { ok: false, fromVersion, toVersion: currentVersion, applied, error };
    }
  }

  // Ensure version file matches CURRENT even if there were no pending
  // migrations (covers the case where the file was at 0 but no migrations
  // are registered yet — current state of v1).
  if (currentVersion !== CURRENT_VAULT_VERSION) {
    await writeVersion(vaultRoot, CURRENT_VAULT_VERSION);
    currentVersion = CURRENT_VAULT_VERSION;
  }

  logger.info(`[vault-migration] complete: v${currentVersion} (applied ${applied.length} migrations)`);
  return { ok: true, fromVersion, toVersion: currentVersion, applied };
}
