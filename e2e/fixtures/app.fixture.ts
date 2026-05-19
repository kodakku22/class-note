import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export type AppFixtures = {
  electronApp: ElectronApplication;
  window: Page;
  vaultPath: string;
};

/**
 * Custom Playwright fixture that launches ClassNotes in an isolated environment.
 * Each test gets:
 *   - A fresh temp directory for user data (settings, logs)
 *   - A fresh temp vault with minimal sample content
 *   - A reference to the first BrowserWindow
 */
export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  vaultPath: async ({}, use) => {
    const vault = await mkdtemp(join(tmpdir(), 'cn-e2e-vault-'));
    // Create minimal vault structure
    await mkdir(join(vault, 'Math', 'notes'), { recursive: true });
    await mkdir(join(vault, 'Math', 'materials'), { recursive: true });
    await writeFile(
      join(vault, 'Math', 'notes', 'Sample.md'),
      '---\ntype: lecture\n---\n\n# サンプルノート\n\nこれはテスト用のノートです。\n',
      'utf-8'
    );
    await writeFile(
      join(vault, 'Math', 'notes', 'Another.md'),
      '---\ntype: summary\n---\n\n# もう一つのノート\n\n[[Sample]] へのリンク。\n',
      'utf-8'
    );
    await use(vault);
    await rm(vault, { recursive: true, force: true });
  },

  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({ vaultPath }, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'cn-e2e-data-'));

    // Pre-configure settings to skip onboarding
    await mkdir(userDataDir, { recursive: true });
    await writeFile(
      join(userDataDir, 'settings.json'),
      JSON.stringify({
        onboardingCompleted: true,
        aiProvider: 'none',
        aiAuthMode: 'api-key',
        theme: 'dark',
      }),
      'utf-8'
    );

    const app = await electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..', '..'),
      env: {
        ...process.env,
        CLASSNOTES_SMOKE_USER_DATA_DIR: userDataDir,
        NODE_ENV: 'test',
      },
    });

    await use(app);
    await app.close();
    await rm(userDataDir, { recursive: true, force: true });
  },

  window: async ({ electronApp, vaultPath }, use) => {
    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    // Set vault path in localStorage (renderer persists it there)
    await win.evaluate((vp) => {
      localStorage.setItem('classnotes:vaultPath', vp);
    }, vaultPath);
    // Reload so the app renders with the vault loaded
    await win.reload();
    await win.waitForLoadState('domcontentloaded');
    // Wait for the app to be interactive (past splash/loading)
    await win.waitForTimeout(2000);
    await use(win);
  },
});

export { expect } from '@playwright/test';
