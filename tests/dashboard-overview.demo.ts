import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';

/**
 * A narrated walk through the redesigned dashboard: greeting, KPI cards, order
 * pipeline, volume chart, grouped navigation, dark mode and the phone drawer.
 *
 * Watch it with `npm run test:e2e:demo:dashboard` (headed, slowed).
 */
async function api(page: Page, method: 'post' | 'put', path: string, data: unknown) {
  const token = await page.evaluate(() => localStorage.getItem('logi_token'));
  const res = await page.request[method](path, { data, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return (await res.json()).data;
}

test('Dashboard overview', async ({ page }) => {
  test.slow();
  const stock = `Red Clay Bricks ${uid()}`;
  const org = await registerOrg(page, `Sahyadri Freight ${uid()}`);

  await test.step('Seed orders in every stage of the lifecycle', async () => {
    const tag = uid().toUpperCase().slice(-4);
    for (let i = 0; i < 5; i++) {
      const reg = `MH12DM${tag}${i}`;
      await api(page, 'post', `/api/orgs/${org.id}/vehicles`, { registration_number: reg, capacity: 100000, unit: 'MetricTon', vehicle_type: 'Truck' });
      const driver = await api(page, 'post', `/api/orgs/${org.id}/drivers`, { name: `Driver ${i}`, license_number: `L${uid()}${i}`, phone: '0' });
      await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/driver`, { driver_id: driver.id });
      await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/location`, { latitude: 18.52 + i * 0.01, longitude: 73.85, address: null });
    }
    const godown = await api(page, 'post', `/api/orgs/${org.id}/godowns`, { name: 'Chakan Kiln Yard', address: 'Chakan MIDC' });
    await api(page, 'post', `/api/godowns/${godown.id}/stock`, { description: stock, quantity: 50000, volume_in_size: 1 });
    const customer = await api(page, 'post', `/api/orgs/${org.id}/customers`, { name: 'Hinjewadi Site', address: 'Hinjewadi, Pune', latitude: 18.59, longitude: 73.74 });
    const stages = [[], ['CONFIRMED'], ['CONFIRMED', 'LOADED', 'IN_TRANSIT'], ['CONFIRMED', 'LOADED', 'IN_TRANSIT', 'DELIVERED'], ['CANCELLED']];
    for (const path of stages) {
      const order = await api(page, 'post', `/api/orgs/${org.id}/dispatch`, { customer_id: customer.id, line_items: [{ stock_description: stock, requested_quantity: 500 }] });
      for (const status of path) {
        await api(page, 'put', `/api/dispatches/${order.id}/status`, status === 'DELIVERED'
          ? { status, proof_of_delivery: { receiver_name: 'Anita Rao', signature_or_photo_url: 'https://example.com/pod/sig.png' } }
          : { status });
      }
    }
  });

  await test.step('The overview: time-aware greeting, KPI context, pipeline and volume', async () => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Order pipeline' })).toBeVisible();
    await page.waitForTimeout(3500);
    await page.locator('.dash-stat').nth(3).hover();
    await page.waitForTimeout(1200);
    await page.locator('.volume-col').last().hover();
    await expect(page.locator('.volume-tip')).toBeVisible();
    await page.waitForTimeout(2000);
  });

  await test.step('Wide tables now fit: Dispatches, then Reports', async () => {
    await page.getByRole('link', { name: 'Dispatches' }).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.waitForTimeout(1500);
  });

  await test.step('Dark mode', async () => {
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await page.waitForTimeout(1000);
  });

  await test.step('Phone width: the sidebar becomes a drawer', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('link', { name: 'Dispatches' }).first().click();
    await page.waitForTimeout(2500);
  });
});
