import type { Page } from '@playwright/test';
import { uid, type TestOrg } from './helpers';

const token = (page: Page) => page.evaluate(() => localStorage.getItem('logi_token'));

const headers = async (page: Page) => ({ Authorization: `Bearer ${await token(page)}` });

export async function api(page: Page, method: 'post' | 'put', path: string, data?: unknown) {
  const res = await page.request[method](path, { data, headers: await headers(page) });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function dispatchStatus(page: Page, id: string): Promise<string> {
  const res = await page.request.get('/api/dispatches', { headers: await headers(page) });
  const list = (await res.json()).data as Array<{ id: string; status: string }>;
  return list.find(d => d.id === id)!.status;
}

/** Two PENDING dispatches on two vehicles, oldest first. */
export async function seedTwoDispatches(page: Page, org: TestOrg): Promise<{ first: string; second: string }> {
  const stock = `Cement ${uid()}`;
  const godown = await api(page, 'post', `/api/orgs/${org.id}/godowns`, { name: 'North Godown', address: '1 Depot Rd' });
  await api(page, 'post', `/api/godowns/${godown.data.id}/stock`, { description: stock, quantity: 500, volume_in_size: 1 });
  const customer = await api(page, 'post', `/api/orgs/${org.id}/customers`, { name: 'Asha Traders', address: '5 Market Rd', latitude: 18.5204, longitude: 73.8567 });

  const ids: string[] = [];
  for (const n of [1, 2]) {
    const reg = `AG${n}${uid().toUpperCase()}`;
    await api(page, 'post', `/api/orgs/${org.id}/vehicles`, { registration_number: reg, capacity: 100000, unit: 'MetricTon' });
    const driver = await api(page, 'post', `/api/orgs/${org.id}/drivers`, { name: `Driver ${n}`, license_number: `L${n}${uid()}`, phone: '9000000000' });
    await api(page, 'put', `/api/vehicles/${encodeURIComponent(reg)}/driver`, { driver_id: driver.data.id });
    const order = await api(page, 'post', `/api/orgs/${org.id}/dispatch`, {
      customer_id: customer.data.id,
      line_items: [{ stock_description: stock, requested_quantity: 10 * n }],
    });
    ids.push(order.data.id);
    // Dispatch timestamps are in seconds, and the agent reviews oldest first.
    await page.waitForTimeout(1100);
  }
  return { first: ids[0], second: ids[1] };
}
