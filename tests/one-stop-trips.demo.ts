import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';

/**
 * A short narrated walk through **one-stop trips** on its own: a dispatch made
 * by itself, with no trip planned, appears on the Trips page marked "One stop",
 * follows the dispatch's status, and reads Cancelled once it is cancelled.
 *
 * Watch it with `npm run test:e2e:demo:one-stop-trips` (headed, slowed).
 */
const token = (page: Page) => page.evaluate(() => localStorage.getItem('logi_token'));
async function api(page: Page, method: 'post' | 'put', path: string, data: unknown) {
  const res = await page.request[method](path, { data, headers: { Authorization: `Bearer ${await token(page)}` } });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return res.json();
}

test('one-stop trips', async ({ page }) => {
  test.slow();
  const org = await registerOrg(page, `One Stop Demo ${uid()}`);
  const stock = `Cement ${uid()}`;
  const reg = `OS${uid().toUpperCase()}`;
  const customerName = `Solo Traders ${uid()}`;
  let dispatchId = '';

  await test.step('Dispatch stock to one customer, with no trip planned', async () => {
    await api(page, 'post', `/api/orgs/${org.id}/vehicles`, { registration_number: reg, capacity: 100000, unit: 'MetricTon' });
    const driver = await api(page, 'post', `/api/orgs/${org.id}/drivers`, { name: 'Ravi Kumar', license_number: `L${uid()}`, phone: '0' });
    await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/driver`, { driver_id: driver.data.id });
    const godown = await api(page, 'post', `/api/orgs/${org.id}/godowns`, { name: 'Central Godown', address: '1 Dock Rd' });
    await api(page, 'post', `/api/godowns/${godown.data.id}/stock`, { description: stock, quantity: 500, volume_in_size: 1 });
    const customer = await api(page, 'post', `/api/orgs/${org.id}/customers`, { name: customerName, address: '5 Market Rd', latitude: 19.0, longitude: 72.8 });
    const dispatch = await api(page, 'post', `/api/orgs/${org.id}/dispatch`, {
      customer_id: customer.data.id,
      line_items: [{ stock_description: stock, requested_quantity: 25 }],
    });
    dispatchId = dispatch.data.id;
  });

  const card = page.locator('.section-card', { hasText: customerName });

  await test.step('It appears on the Trips page, marked One stop', async () => {
    await page.getByRole('link', { name: /trips/i }).click();
    await expect(page).toHaveURL(/\/trips$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Trips', exact: true })).toBeVisible();
    await expect(card).toBeVisible({ timeout: 8000 });
    await expect(card.getByText('One stop')).toBeVisible();
    await expect(card.getByText(reg)).toBeVisible();
    await page.waitForTimeout(2000);
  });

  await test.step('Its route map works like any other trip', async () => {
    await card.getByRole('button', { name: /route map/i }).click();
    await expect(card.locator('.leaflet-container')).toBeVisible();
    await page.waitForTimeout(1800);
    await card.getByRole('button', { name: /hide map/i }).click();
  });

  await test.step('Cancelled, the card says Cancelled rather than Completed', async () => {
    await api(page, 'put', `/api/dispatches/${dispatchId}/status`, { status: 'CANCELLED' });
    await page.reload();
    await expect(card.locator('.section-card-header').getByText(/cancelled/i)).toBeVisible({ timeout: 8000 });
    await expect(card.getByText('COMPLETED')).toHaveCount(0);
    await page.waitForTimeout(2500);
  });
});
