import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';
import { dispatchStatus, seedTwoDispatches } from './agent-fixtures';

/**
 * Runs the real agent loop against tests/fake-model.mjs. The API must be
 * started with AGENT_MODEL_URL pointing at it, as .github/workflows/e2e.yml does.
 */
const openInbox = async (page: Page) => {
  await page.goto('/agents');
  await expect(page.getByRole('heading', { name: 'Agent Inbox' })).toBeVisible({ timeout: 8000 });
};

const card = (page: Page, label: RegExp) => page.getByRole('article', { name: label });

async function runSupervised(page: Page) {
  await page.getByLabel('Autonomy').selectOption('SUPERVISED');
  await expect(page.getByText(/everything else waits for your approval/i)).toBeVisible();
  await page.getByRole('button', { name: /run now/i }).click();
  await expect(card(page, /confirm dispatch/i)).toBeVisible({ timeout: 20000 });
}

test.describe('Agent Inbox', () => {
  test('agents start off, and shadow mode records without changing anything', async ({ page }) => {
    const org = await registerOrg(page, `Agents Shadow ${uid()}`);
    const { first } = await seedTwoDispatches(page, org);

    await openInbox(page);
    await expect(page.getByText(/agents are off/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /run now/i })).toBeDisabled();

    await page.getByLabel('Autonomy').selectOption('SHADOW');
    await page.getByRole('button', { name: /run now/i }).click();

    await expect(page.getByText('Would have done').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('status')).toContainText(/reviewed the open dispatches/i);
    await expect(page.getByRole('article', { name: /confirm dispatch/i })).toHaveCount(0);
    expect(await dispatchStatus(page, first)).toBe('PENDING');
  });

  test('approving carries the action out, and rejecting changes nothing', async ({ page }) => {
    const org = await registerOrg(page, `Agents Approve ${uid()}`);
    const { first, second } = await seedTwoDispatches(page, org);

    await openInbox(page);
    await runSupervised(page);

    // Waiting for a decision: nothing has changed yet, and the sidebar says so.
    expect(await dispatchStatus(page, first)).toBe('PENDING');
    await expect(page.getByRole('link', { name: /agent inbox/i })).toContainText('2');
    await expect(card(page, /confirm dispatch/i)).toContainText('Asha Traders');
    await expect(card(page, /cancel dispatch/i)).toContainText(/hard to undo/i);

    // The alert was internal, so supervised mode already raised it.
    await expect(page.getByText('Stock review')).toBeVisible();

    await card(page, /confirm dispatch/i).getByRole('button', { name: /approve/i }).click();
    await expect(page.getByRole('status')).toContainText(/now confirmed/i, { timeout: 8000 });
    expect(await dispatchStatus(page, first)).toBe('CONFIRMED');
    await expect(card(page, /confirm dispatch/i)).toHaveCount(0);

    await card(page, /cancel dispatch/i).getByRole('button', { name: /reject/i }).click();
    await expect(page.getByRole('status')).toContainText(/won't ask again/i, { timeout: 8000 });
    expect(await dispatchStatus(page, second)).toBe('PENDING');
    await expect(card(page, /cancel dispatch/i)).toHaveCount(0);
    await expect(page.getByText(/nothing is waiting for you/i)).toBeVisible();

    // Nothing left waiting, so the sidebar count has gone.
    await expect(page.getByRole('link', { name: /agent inbox/i })).toHaveText('Agent Inbox');
  });

  test('approving a cancellation asks first, then cancels', async ({ page }) => {
    const org = await registerOrg(page, `Agents Cancel ${uid()}`);
    const { second } = await seedTwoDispatches(page, org);

    await openInbox(page);
    await runSupervised(page);

    page.once('dialog', dialog => dialog.accept());
    await card(page, /cancel dispatch/i).getByRole('button', { name: /approve/i }).click();
    await expect(page.getByRole('status')).toContainText(/now cancelled/i, { timeout: 8000 });
    expect(await dispatchStatus(page, second)).toBe('CANCELLED');
  });

  test('a stale approval reports why instead of applying', async ({ page }) => {
    const org = await registerOrg(page, `Agents Stale ${uid()}`);
    const { first } = await seedTwoDispatches(page, org);

    await openInbox(page);
    await runSupervised(page);

    // Someone cancels it from elsewhere while the card is on screen.
    const auth = await page.evaluate(() => localStorage.getItem('logi_token'));
    const res = await page.request.put(`/api/dispatches/${first}/status`, {
      data: { status: 'CANCELLED' },
      headers: { Authorization: `Bearer ${auth}` },
    });
    expect(res.ok()).toBeTruthy();

    await card(page, /confirm dispatch/i).getByRole('button', { name: /approve/i }).click();
    await expect(page.getByRole('alert')).toContainText(/can't confirm it/i, { timeout: 8000 });
    expect(await dispatchStatus(page, first)).toBe('CANCELLED');
    await expect(page.getByRole('cell', { name: /failed/i })).toBeVisible();
  });
});
