import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';

/**
 * The control-tower dashboard with a seeded fleet.
 * Watch it with `npm run test:e2e:demo:dashboard` (headed, slowed).
 */
const token = (page: Page) => page.evaluate(() => localStorage.getItem('logi_token'));
async function api(page: Page, method: 'post' | 'put', path: string, data?: unknown) {
  const res = await page.request[method](path, { data, headers: { Authorization: `Bearer ${await token(page)}` } });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return (await res.json()).data;
}

test('Control-tower dashboard', async ({ page }) => {
  test.slow();
  const tag = uid().toUpperCase().slice(-4);
  const stock = `Red Clay Bricks ${uid()}`;
  const org = await registerOrg(page, `Sahyadri Haulage ${uid()}`);

  await test.step('Seed a fleet, an overdue service and dispatches at each stage', async () => {
    const regs: string[] = [];
    const spots = [[18.52, 73.85], [18.75, 73.41], [19.07, 72.88], [18.0, 74.0], [18.6, 73.74]];
    for (const [i, [latitude, longitude]] of spots.entries()) {
      const reg = `MH12PC${tag}${i}`;
      regs.push(reg);
      await api(page, 'post', `/api/orgs/${org.id}/vehicles`, { registration_number: reg, capacity: 100000, unit: 'MetricTon', vehicle_type: i % 2 ? 'Tipper' : 'Truck' });
      const driver = await api(page, 'post', `/api/orgs/${org.id}/drivers`, { name: `Driver ${i}`, license_number: `L${uid()}${i}`, phone: '0' });
      await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/driver`, { driver_id: driver.id });
      await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/location`, { latitude, longitude, address: null });
    }
    await api(page, 'post', `/api/vehicles/${encodeURIComponent(regs[4])}/maintenance`, { description: 'Engine oil change', due_on: '2026-01-15' });

    const godown = await api(page, 'post', `/api/orgs/${org.id}/godowns`, { name: 'Chakan Kiln Yard', address: 'Chakan MIDC' });
    await api(page, 'post', `/api/godowns/${godown.id}/stock`, { description: stock, quantity: 50000, volume_in_size: 1 });
    const customer = await api(page, 'post', `/api/orgs/${org.id}/customers`, { name: 'Hinjewadi Site', address: 'Hinjewadi, Pune', latitude: 18.59, longitude: 73.74 });
    const stages: string[][] = [[], ['CONFIRMED'], ['CONFIRMED', 'LOADED', 'IN_TRANSIT'], ['CONFIRMED', 'LOADED', 'IN_TRANSIT'], ['CONFIRMED', 'LOADED', 'IN_TRANSIT', 'DELIVERED']];
    for (const [i, path] of stages.entries()) {
      const order = await api(page, 'post', `/api/orgs/${org.id}/dispatch`, { customer_id: customer.id, line_items: [{ stock_description: stock, requested_quantity: 1000 * (i + 1) }] });
      for (const status of path) {
        await api(page, 'put', `/api/dispatches/${order.id}/status`, status === 'DELIVERED'
          ? { status, proof_of_delivery: { receiver_name: 'Anita Rao', signature_or_photo_url: 'https://example.com/pod/sig.png' } }
          : { status });
      }
    }
  });

  await test.step('KPIs, fleet map, attention list and pipeline', async () => {
    await page.goto('/');
    await expect(page.locator('.kpi').filter({ hasText: 'On the road' })).toContainText('2');
    await expect(page.locator('.dash-map .leaflet-marker-icon')).toHaveCount(5);
    await expect(page.locator('.dash-map .leaflet-marker-icon img')).toHaveCount(5);
    await expect(page.locator('.attn-item').filter({ hasText: 'Service overdue' })).toBeVisible();
    await expect(page.locator('.pipe-stage').filter({ hasText: 'In transit' })).toContainText('2');
    await page.waitForTimeout(4000);
  });

  await test.step('An attention item drills down to the vehicle', async () => {
    await page.locator('.attn-item').filter({ hasText: 'Service overdue' }).click();
    await expect(page).toHaveURL(/\/vehicles\//);
    await page.waitForTimeout(1500);
    await page.goto('/');
    await expect(page.locator('.attn-item').first()).toBeVisible({ timeout: 15_000 });
  });

  await test.step('The same layout in Cobalt, then dark mode', async () => {
    await page.getByRole('radio', { name: 'Cobalt' }).check();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await page.waitForTimeout(3000);
  });
});
