import { expect } from '@playwright/test';
import { test } from '../fixtures/app.fixture';

test.describe('Settings interoperability', () => {
  test('shows Zotero and Obsidian compatibility status in Settings', async ({ window }) => {
    await window.getByRole('button', { name: '設定', exact: true }).click();
    await expect(window.locator('.settings-modal')).toBeVisible({ timeout: 5000 });
    await expect(window.getByText('Zotero / Obsidian 互換性チェック')).toBeVisible();
    await expect(window.getByText(/Obsidian:/)).toBeVisible();
    await expect(window.getByText(/Zotero:/)).toBeVisible();
    await expect(window.getByText(/修復候補/)).toBeVisible();
  });
});
