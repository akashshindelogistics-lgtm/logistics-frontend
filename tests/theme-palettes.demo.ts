import { test, expect } from '@playwright/test';
import { registerOrg, uid } from './helpers';

/**
 * Walks through every colour palette in the sidebar picker, in light and dark.
 * Watch it with `npm run test:e2e:demo:theme-palettes` (headed, slowed).
 */
const PALETTES = ['Graphite', 'Cobalt', 'Pine', 'Iris', 'Heritage', 'Molten'];

test('Choosing a colour palette', async ({ page }) => {
  test.slow();
  await registerOrg(page, `Palettes Demo ${uid()}`);
  await page.goto('/');
  await expect(page.locator('.dash-head')).toBeVisible();

  for (const [mode, toggle] of [['light', /switch to dark theme/i], ['dark', /switch to light theme/i]] as const) {
    for (const name of PALETTES) {
      await test.step(`${name} in ${mode} mode`, async () => {
        await page.getByRole('radio', { name }).check();
        await expect(page.locator('html')).toHaveAttribute('data-palette', name.toLowerCase());
        await page.waitForTimeout(2500);
      });
    }
    await page.getByRole('button', { name: toggle }).click();
  }
});
