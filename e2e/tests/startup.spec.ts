import { test, expect } from '../fixtures/app.fixture';
import { SEL } from '../helpers/selectors';

test.describe('App Startup', () => {
  test('launches with a visible window', async ({ window }) => {
    const title = await window.title();
    expect(title).toContain('ClassNotes');
  });

  test('shows the title bar with app name', async ({ window }) => {
    const name = window.locator(SEL.titleBarName);
    await expect(name).toBeVisible();
    await expect(name).toHaveText('ClassNotes');
  });

  test('displays the icon rail', async ({ window }) => {
    const rail = window.locator(SEL.rail);
    await expect(rail).toBeVisible();
  });

  test('renders without JavaScript errors', async ({ window }) => {
    const errors: string[] = [];
    window.on('pageerror', (err) => errors.push(err.message));
    // Give the app a moment to finish loading
    await window.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});
