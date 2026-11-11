import { test, expect, type Page } from '@playwright/test';
import { clearAuth, registerOrg, uid } from './helpers';

// Needs the API started with PUBLIC_APP_URL set (any value: only the path of
// the link is opened here), as e2e.yml and playwright.demo.config.ts do.

const token = (page: Page) => page.evaluate(() => localStorage.getItem('logi_token'));
async function api(page: Page, method: 'get' | 'post' | 'put', path: string, data?: unknown) {
  const res = await page.request[method](path, { data, headers: { Authorization: `Bearer ${await token(page)}` } });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Org with a driven vehicle, stock and an emailable customer; dispatches to them via the UI. */
async function dispatchToCustomer(page: Page) {
  const org = await registerOrg(page, `Track ${uid()}`);
  const stock = `Blocks ${uid()}`;
  const reg = `TR${uid().toUpperCase()}`;
  await api(page, 'post', `/api/orgs/${org.id}/vehicles`, { registration_number: reg, capacity: 500, unit: 'MetricTon' });
  const driver = await api(page, 'post', `/api/orgs/${org.id}/drivers`, { name: 'Track Driver', license_number: `L${uid()}`, phone: '+91 98888 00000' });
  await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/driver`, { driver_id: driver.data.id });
  const godown = await api(page, 'post', `/api/orgs/${org.id}/godowns`, { name: 'TG', address: '1 Rd' });
  await api(page, 'post', `/api/godowns/${godown.data.id}/stock`, { description: stock, quantity: 200, volume_in_size: 1 });
  const customer = await api(page, 'post', `/api/orgs/${org.id}/customers`, {
    name: `Tracked ${uid()}`, address: '5 Market Rd', latitude: 18.5204, longitude: 73.8567, email: `t-${uid()}@example.com`,
  });

  await page.goto(`/orgs/${org.id}`);
  await page.getByLabel('Customer').selectOption({ label: customer.data.name });
  await page.getByLabel('Stock Description').fill(stock);
  await page.getByLabel('Quantity', { exact: true }).fill('20');
  await page.getByRole('button', { name: /dispatch stock/i }).click();
  await expect(page.getByText(/dispatch successful/i)).toBeVisible({ timeout: 10000 });

  const list = (await api(page, 'get', '/api/dispatches')).data as Array<{ id: string; line_items: { stock_description: string }[] }>;
  const dispatchId = list.find(d => d.line_items.some(li => li.stock_description === stock))!.id;
  const notifs = (await api(page, 'get', `/api/dispatches/${dispatchId}/notifications`)).data as Array<{ recipient_kind: string; body: string }>;
  const body = notifs.find(n => n.recipient_kind === 'customer')!.body;
  const link = body.match(/Track your order: (\S+)/)?.[1];
  expect(link, `customer message carries a tracking link: ${body}`).toBeTruthy();
  return { org, reg, dispatchId, trackPath: new URL(link!).pathname };
}

test.describe('Customer tracking link', () => {
  test('the link in the customer message opens a public tracking page that follows the order', async ({ page }) => {
    const { reg, dispatchId, trackPath } = await dispatchToCustomer(page);
    const auth = await token(page);

    // The customer has no login.
    await clearAuth(page);
    await page.goto(trackPath);
    await expect(page.getByRole('heading', { name: new RegExp(`Order ${dispatchId.slice(0, 8)}`) })).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('track-status')).toHaveText(/pending/i);
    await expect(page.getByText('Expected by')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Vehicle location' })).toHaveCount(0);
    // Still on the tracking page: no redirect to login, no dashboard sidebar.
    await expect(page).toHaveURL(new RegExp(`${trackPath}$`));

    // The dispatcher moves it along and the truck reports a position.
    const headers = { Authorization: `Bearer ${auth}` };
    for (const status of ['CONFIRMED', 'LOADED', 'IN_TRANSIT']) {
      expect((await page.request.put(`/api/dispatches/${dispatchId}/status`, { data: { status }, headers })).ok()).toBe(true);
    }
    expect((await page.request.put(`/api/vehicles/${encodeURIComponent(reg)}/location`, {
      data: { latitude: 18.6, longitude: 73.9 }, headers,
    })).ok()).toBe(true);

    await page.reload();
    await expect(page.getByTestId('track-status')).toHaveText(/in transit/i, { timeout: 8000 });
    await expect(page.getByRole('region', { name: 'Vehicle location' })).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.getByText(/Last updated/)).toBeVisible();
  });

  test('an unknown link says the order was not found', async ({ page }) => {
    await page.goto('/track/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('alert')).toContainText(/couldn.t find an order/i, { timeout: 8000 });
  });
});
