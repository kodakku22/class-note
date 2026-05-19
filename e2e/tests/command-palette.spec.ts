import { test, expect } from '../fixtures/app.fixture';
import { SEL } from '../helpers/selectors';

test.describe('Command Palette', () => {
  test('opens with Ctrl+K', async ({ window }) => {
    await window.keyboard.press('Control+k');
    const input = window.locator(SEL.paletteInput);
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('shows FAQ command when searched', async ({ window }) => {
    await window.keyboard.press('Control+k');
    const input = window.locator(SEL.paletteInput);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('FAQ');
    const item = window.locator(SEL.paletteItem).filter({ hasText: 'FAQ' });
    await expect(item.first()).toBeVisible({ timeout: 3000 });
  });

  test('closes with Escape', async ({ window }) => {
    await window.keyboard.press('Control+k');
    const input = window.locator(SEL.paletteInput);
    await expect(input).toBeVisible({ timeout: 5000 });
    await window.keyboard.press('Escape');
    await expect(input).not.toBeVisible({ timeout: 3000 });
  });
});
