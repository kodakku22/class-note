import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app.fixture';
import { SEL } from '../helpers/selectors';

/**
 * DocAI smoke tests.
 *
 * The fixture configures `aiProvider: 'none'` (no AI keys in CI), so any
 * IPC call to docai:* returns "AI 機能が無効です。…". We can't override the
 * preload bridge at runtime (contextBridge objects are frozen for security),
 * so instead we use that deterministic error to prove the click handlers
 * actually fire — successful AI calls are covered by unit tests.
 *
 * UI surface verified end-to-end:
 *   - 🤖 toolbar button toggles the DocAI panel
 *   - Quick-action buttons trigger the IPC (we see the AI-off error alert)
 *   - 📎+ opens the MultiDocPicker modal
 *   - ✉ 生成 opens the ContentGenerator modal
 *   - The panel close button hides the panel
 */

async function openSampleNote(window: Page): Promise<void> {
  // Math is the only subject and gets auto-selected when the vault loads,
  // so the file list is already populated. Just click the Sample note.
  const sample = window.locator(SEL.fileListItem).filter({ hasText: 'Sample' }).first();
  await sample.waitFor({ state: 'visible', timeout: 10000 });
  await sample.click();
  // Give the viewer a moment to render NoteViewer + toolbar buttons.
  await window.waitForTimeout(800);
}

async function openDocAIPanel(window: Page): Promise<void> {
  const aiBtn = window.locator('button[title="AI アシスタント (DocAI)"]');
  await expect(aiBtn).toBeVisible({ timeout: 5000 });
  await aiBtn.click();
  await expect(window.locator('.docai-panel')).toBeVisible({ timeout: 3000 });
}

test.describe('DocAI panel', () => {
  test('🤖 toolbar button opens the DocAI panel', async ({ window }) => {
    await openSampleNote(window);
    await openDocAIPanel(window);
    await expect(window.getByText('🤖 AIアシスタント')).toBeVisible();
    // File chip shows the current document name.
    await expect(window.locator('.docai-panel-file-name')).toContainText('Sample');
  });

  test('all quick-action buttons render (with 📊 比較 disabled for single-doc)', async ({ window }) => {
    await openSampleNote(window);
    await openDocAIPanel(window);
    await expect(window.locator('.docai-panel-action').filter({ hasText: '要約' }).first()).toBeVisible();
    await expect(window.locator('.docai-panel-action').filter({ hasText: '試験対策' })).toBeVisible();
    await expect(window.locator('.docai-panel-action').filter({ hasText: '1行要約' })).toBeVisible();
    // 📊 比較 should be disabled because no extra docs are attached yet.
    await expect(window.locator('.docai-panel-action').filter({ hasText: '比較' })).toBeDisabled();
    await expect(window.locator('.docai-panel-action').filter({ hasText: '生成' })).toBeVisible();
  });

  test('⚡ 要約 fires the IPC (alert appears when AI is off in CI)', async ({ window }) => {
    await openSampleNote(window);
    await openDocAIPanel(window);
    await window.locator('.docai-panel-action').filter({ hasText: '要約' }).first().click();
    // Either the SummaryCard appears (when AI is configured) or an error alert
    // appears (when AI is off, as in our CI fixture). Both prove the click
    // handler is wired up. Wait for either to materialize.
    await expect(
      window.locator('.docai-panel-error, .summary-card-headline')
    ).toBeVisible({ timeout: 8000 });
  });

  test('✉ 生成 opens the ContentGenerator modal', async ({ window }) => {
    await openSampleNote(window);
    await openDocAIPanel(window);
    await window.locator('.docai-panel-action').filter({ hasText: '生成' }).click();
    await expect(window.locator('.docai-generator')).toBeVisible({ timeout: 3000 });
    await expect(window.getByText('✉️ コンテンツ生成')).toBeVisible();
    await expect(window.getByText('メール文面')).toBeVisible();
    // Close modal.
    await window.locator('.docai-generator-close').click();
    await expect(window.locator('.docai-generator')).not.toBeVisible({ timeout: 3000 });
  });

  test('📎+ opens the MultiDocPicker modal', async ({ window }) => {
    await openSampleNote(window);
    await openDocAIPanel(window);
    await window.locator('button[aria-label="複数文書を選択"]').click();
    await expect(window.locator('.docai-picker')).toBeVisible({ timeout: 3000 });
    await expect(window.getByText('📎 複数文書を選択')).toBeVisible();
    // Search input should be focused.
    await expect(window.locator('.docai-picker-search')).toBeVisible();
    // Close.
    await window.locator('.docai-picker-close').click();
    await expect(window.locator('.docai-picker')).not.toBeVisible({ timeout: 3000 });
  });

  test('AI panel close button hides the panel', async ({ window }) => {
    await openSampleNote(window);
    await openDocAIPanel(window);
    await window.locator('button[aria-label="AI パネルを閉じる"]').click();
    await expect(window.locator('.docai-panel')).not.toBeVisible({ timeout: 3000 });
  });
});
