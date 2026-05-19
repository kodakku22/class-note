import { expect } from '@playwright/test';
import { test } from '../fixtures/app.fixture';

test.describe('Global AI selector', () => {
  test('shows the current provider at the top of the left rail', async ({ window }) => {
    const trigger = window.getByRole('button', { name: /AIプロバイダーを選択/ });
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Off');
    await expect(trigger).toHaveAttribute('data-provider', 'none');
  });

  test('switches provider from Off to Gemini in the top-left popover', async ({ window }) => {
    const trigger = window.getByRole('button', { name: /AIプロバイダーを選択/ });
    await trigger.click();

    const popover = window.getByRole('dialog', { name: 'AIプロバイダー設定' });
    await expect(popover).toBeVisible();
    await expect(popover.getByText(/使用中: Off/)).toBeVisible();

    await popover.getByRole('button', { name: /Gemini/ }).click();

    await expect(trigger).toHaveAttribute('data-provider', 'gemini');
    await expect(trigger).toContainText('Gemini');
    await expect(popover.getByText(/使用中: Gemini/)).toBeVisible();
  });
});
