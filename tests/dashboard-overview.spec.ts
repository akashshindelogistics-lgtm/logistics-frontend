import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';

async function api(page: Page, path: string, data: unknown, method: 'post' | 'put' = 'post') {
  const token = await page.evaluate(() => localStorage.getItem('logi_token'));
  const res = await page.request[method](path, { data, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok()) throw new Error(`${path} -> ${res.status()} ${await res.text()}`);
  return (await res.json()).data;
}

async function seedOneDispatch(page: Page, orgId: string) {
  const stock = `Bricks ${uid()}`;
  const reg = `MH12DB${uid().toUpperCase().slice(-4)}`;
  await api(page, `/api/orgs/${orgId}/vehicles`, { registration_number: reg, capacity: 100000, unit: 'MetricTon', vehicle_type: 'Truck' });
  const driver = await api(page, `/api/orgs/${orgId}/drivers`, { name: 'Sunil Jadhav', license_number: `L${uid()}`, phone: '0' });
  await api(page, `/api/vehicles/${reg}/driver`, { driver_id: driver.id }, 'put');
  await api(page, `/api/vehicles/${reg}/location`, { latitude: 18.52, longitude: 73.85, address: null }, 'put');
  const godown = await api(page, `/api/orgs/${orgId}/godowns`, { name: 'Yard', address: 'Chakan' });
  await api(page, `/api/godowns/${godown.id}/stock`, { description: stock, quantity: 5000, volume_in_size: 1 });
  const customer = await api(page, `/api/orgs/${orgId}/customers`, { name: 'Site', address: 'Pune', latitude: 18.59, longitude: 73.74 });
  await api(page, `/api/orgs/${orgId}/dispatch`, { customer_id: customer.id, line_items: [{ stock_description: stock, requested_quantity: 10 }] });
}

test.describe('Dashboard overview', () => {
  test('shows the pipeline and volume from real orders', async ({ page }) => {
    const org = await registerOrg(page, `Overview ${uid()}`);
    await seedOneDispatch(page, org.id);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)$/);
    await expect(page.locator('.dash-date')).toContainText(org.name);

    const pipeline = page.getByRole('region', { name: 'Dispatch pipeline' });
    await expect(pipeline.locator('.pipe-stage', { hasText: 'Pending' })).toContainText('1');

    const days = page.getByRole('listitem').filter({ has: page.locator('.volume-track') });
    await expect(days).toHaveCount(14);
    await days.last().hover();
    await expect(page.locator('.volume-tip')).toContainText('1 on');
  });

  test('hides the charts for an org with no orders', async ({ page }) => {
    await registerOrg(page, `Empty Overview ${uid()}`);
    await page.goto('/');
    await expect(page.getByText(/no dispatches yet/i)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Order volume' })).toHaveCount(0);
  });

  test('opens the navigation as a drawer at phone width', async ({ page }) => {
    await registerOrg(page, `Phone Nav ${uid()}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // The sidebar's link; the dashboard header has its own Reports button.
    const reports = page.getByRole('navigation').getByRole('link', { name: 'Reports' });
    await expect(reports).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(reports).toBeVisible();
    await reports.click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(reports).toBeHidden();
  });
});
