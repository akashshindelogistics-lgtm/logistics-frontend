import { test, expect, type Page } from '@playwright/test';
import { registerOrg, uid } from './helpers';
import { dispatchStatus, seedTwoDispatches } from './agent-fixtures';

/**
 * A short narrated walk through the **Agent Inbox** on its own: an agent reviews
 * two dispatches and a person decides what it asked for.
 *
 * Watch it with `npm run test:e2e:demo:agent-inbox` (headed, slowed). The agent
 * loop, rules and database are real. The model's choices are scripted by
 * tests/fake-model.mjs, so it needs no Anthropic credits.
 */
const pause = (page: Page, ms = 1500) => page.waitForTimeout(ms);

test('agent inbox', async ({ page }) => {
  test.slow();
  const org = await registerOrg(page, `Agent Inbox Demo ${uid()}`);
  let first = '';
  let second = '';

  await test.step('Two dispatches are waiting to be reviewed', async () => {
    ({ first, second } = await seedTwoDispatches(page, org));
    await page.goto('/dispatches');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 8000 });
    await pause(page);
  });

  await test.step('Agents start switched off', async () => {
    await page.getByRole('link', { name: /agent inbox/i }).click();
    await expect(page.getByText(/agents are off/i)).toBeVisible({ timeout: 8000 });
    await pause(page);
  });

  await test.step('Shadow mode: the agent only records what it would do', async () => {
    await page.getByLabel('Autonomy').selectOption('SHADOW');
    await pause(page);
    await page.getByRole('button', { name: /run now/i }).click();
    await expect(page.getByText('Would have done').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('heading', { name: 'Recent activity' }).scrollIntoViewIfNeeded();
    await pause(page, 2500);
    expect(await dispatchStatus(page, first)).toBe('PENDING');
  });

  await test.step('Supervised mode: the agent asks for decisions', async () => {
    await page.getByRole('heading', { name: 'Agent Inbox' }).scrollIntoViewIfNeeded();
    await page.getByLabel('Autonomy').selectOption('SUPERVISED');
    await pause(page);
    await page.getByRole('button', { name: /run now/i }).click();
    await expect(page.getByRole('article', { name: /confirm dispatch/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: /agent inbox/i })).toContainText('2');
    await pause(page, 3000);
  });

  await test.step('Approve the confirmation', async () => {
    await page.getByRole('article', { name: /confirm dispatch/i }).getByRole('button', { name: /approve/i }).click();
    await expect(page.getByRole('status')).toContainText(/now confirmed/i, { timeout: 8000 });
    expect(await dispatchStatus(page, first)).toBe('CONFIRMED');
    await pause(page, 2500);
  });

  await test.step('Reject the cancellation', async () => {
    await page.getByRole('article', { name: /cancel dispatch/i }).getByRole('button', { name: /reject/i }).click();
    await expect(page.getByRole('status')).toContainText(/won't ask again/i, { timeout: 8000 });
    expect(await dispatchStatus(page, second)).toBe('PENDING');
    await expect(page.getByText(/nothing is waiting for you/i)).toBeVisible();
    await pause(page, 2500);
  });

  await test.step('The alert, the activity and the run are all on record', async () => {
    await expect(page.getByRole('heading', { name: 'Stock review' })).toBeVisible();
    await page.getByRole('heading', { name: 'Recent runs' }).scrollIntoViewIfNeeded();
    await pause(page, 3000);
  });

  await test.step('The Dispatches page agrees', async () => {
    await page.goto('/dispatches');
    await expect(page.getByText('CONFIRMED').first()).toBeVisible({ timeout: 8000 });
    await pause(page, 2500);
  });
});
