import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';

/**
 * A short narrated walk through the **customer tracking link** on its own:
 * dispatch to a customer, see the link in their "on its way" message, then
 * open it as the customer (no login) and watch the order move.
 *
 * Watch it with `npm run test:e2e:demo:tracking` (headed, slowed).
 */
const token = (page: Page) => page.evaluate(() => localStorage.getItem('logi_token'));
async function api(page: Page, method: 'get' | 'post' | 'put', path: string, data?: unknown) {
  const res = await page.request[method](path, { data, headers: { Authorization: `Bearer ${await token(page)}` } });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return res.json();
}

test('customer tracking link', async ({ page, browser }, testInfo) => {
  test.slow();
  const org = await registerOrg(page, `Tracking Demo ${uid()}`);
  const stock = `AAC Blocks ${uid()}`;
  const reg = `MH12 TD ${uid().slice(-4).toUpperCase()}`;
  const custName = `Shree Builders ${uid()}`;
  let dispatchId = '';
  let trackPath = '';

  await test.step('Set up a truck with a driver, a stocked godown and a customer with an email', async () => {
    await api(page, 'post', `/api/orgs/${org.id}/vehicles`, { registration_number: reg, capacity: 500, unit: 'MetricTon' });
    const driver = await api(page, 'post', `/api/orgs/${org.id}/drivers`, { name: 'Ravi Kumar', license_number: `L${uid()}`, phone: '+91 98888 00000' });
    await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/driver`, { driver_id: driver.data.id });
    // The truck starts at the godown in Pune.
    await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/location`, { latitude: 18.5204, longitude: 73.8567 });
    const godown = await api(page, 'post', `/api/orgs/${org.id}/godowns`, { name: 'Pune Godown', address: 'Hadapsar, Pune' });
    await api(page, 'post', `/api/godowns/${godown.data.id}/stock`, { description: stock, quantity: 500, volume_in_size: 1 });
    await api(page, 'post', `/api/orgs/${org.id}/customers`, {
      name: custName, address: 'Wakad, Pune', latitude: 18.5975, longitude: 73.7898, email: `site-${uid()}@example.com`,
    });
  });

  await test.step('Dispatch a shipment to the customer', async () => {
    await page.goto(`/orgs/${org.id}`);
    await page.getByLabel('Customer').selectOption({ label: custName });
    await page.getByLabel('Stock Description').fill(stock);
    await page.getByLabel('Quantity', { exact: true }).fill('120');
    await page.getByRole('button', { name: /dispatch stock/i }).click();
    await expect(page.getByText(/dispatch successful/i)).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
  });

  await test.step('The customer’s "on its way" email now ends with a tracking link', async () => {
    await page.goto('/dispatches');
    const row = page.locator('tbody tr').filter({ hasText: stock });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.getByRole('button', { name: /notifications for/i }).click();
    const message = page.getByText(/Track your order: /).first();
    await expect(message).toBeVisible({ timeout: 8000 });
    await message.scrollIntoViewIfNeeded();
    const link = (await message.textContent())!.match(/Track your order: (\S+)/)![1];
    trackPath = new URL(link).pathname;
    dispatchId = (await api(page, 'get', '/api/dispatches')).data
      .find((d: { line_items: { stock_description: string }[] }) => d.line_items.some(li => li.stock_description === stock)).id;
    await page.waitForTimeout(2000);
  });

  // A separate browser context: the customer has never logged in.
  // Recorded too (the config's video option only covers the default page).
  const customerContext = await browser.newContext({
    viewport: { width: 900, height: 900 },
    recordVideo: { dir: testInfo.outputDir, size: { width: 900, height: 900 } },
  });
  const customer = await customerContext.newPage();

  await test.step('The customer opens the link — no login — and sees the order is booked', async () => {
    await customer.goto(trackPath);
    await expect(customer.getByTestId('track-status')).toHaveText(/pending/i, { timeout: 8000 });
    await expect(customer.getByText(`From ${org.name}`)).toBeVisible();
    await customer.waitForTimeout(2500);
  });

  await test.step('The truck is loaded and leaves: the customer sees it on the map', async () => {
    for (const status of ['CONFIRMED', 'LOADED', 'IN_TRANSIT']) {
      await api(page, 'put', `/api/dispatches/${dispatchId}/status`, { status });
    }
    await customer.reload();
    await expect(customer.getByTestId('track-status')).toHaveText(/in transit/i, { timeout: 8000 });
    await expect(customer.locator('.leaflet-container')).toBeVisible();
    await customer.getByRole('region', { name: 'Vehicle location' }).scrollIntoViewIfNeeded();
    await customer.waitForTimeout(2500);
  });

  await test.step('The GPS tracker reports progress towards the site', async () => {
    for (const [lat, lng] of [[18.55, 73.83], [18.58, 73.80]]) {
      await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/location`, { latitude: lat, longitude: lng });
      await customer.reload();
      await expect(customer.locator('.leaflet-container')).toBeVisible({ timeout: 8000 });
      await customer.getByRole('region', { name: 'Vehicle location' }).scrollIntoViewIfNeeded();
      await customer.waitForTimeout(2000);
    }
  });

  await test.step('Once delivered, the page shows the delivery time and stops showing the truck', async () => {
    await api(page, 'put', `/api/dispatches/${dispatchId}/status`, {
      status: 'DELIVERED',
      proof_of_delivery: { receiver_name: 'Site Supervisor', signature_or_photo_url: 'https://example.com/pod.png' },
    });
    await customer.reload();
    await expect(customer.getByTestId('track-status')).toHaveText(/delivered/i, { timeout: 8000 });
    await expect(customer.getByText('Delivered', { exact: true })).toBeVisible();
    await expect(customer.locator('.leaflet-container')).toHaveCount(0);
    await customer.waitForTimeout(2500);
  });

  await customerContext.close();
});
