import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// A release that is not a beta (e2e.stable.config.ts, docs/adr/0017): Home, with the connected systems, Check Vouchers,
// User Accounts, and Bank Accounts and Company Details, which vouchers print from (docs/adr/0018), open; every other
// screen keeps its place in the rail and its tile on Home, marked, and shows behind "Coming soon" (docs/adr/0019).

test('opens Home with every tile, those coming soon marked, and the connected systems', async ({ app, screen }) => {
  await app.open('/');
  const tiles = screen.getByRole('main').getByRole('list').first();

  await expect(tiles.getByRole('listitem')).toHaveCount(9);
  await expect(tiles.getByRole('button', /^Check Vouchers .* Awaiting approval 1$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Billing Statements Coming soon .* Outstanding/)).toBeVisible();
  await expect(screen.getByText('Connected systems')).toBeVisible();
  await expect(screen.getByRole('button', 'Open Attendance Tracker')).toBeVisible();
});

test('marks every other screen in the rail and opens it on "Coming soon"', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone');

  await rail.getByRole('button', 'Billing Statements, coming soon').tap();

  await expect(screen.getByRole('heading', { name: 'Billing Statements', level: 1 })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeVisible();
  await expect(screen.getByText('This screen hit a problem')).toBeHidden();
  // The screen shows behind the notice, and nothing on it can be reached.
  await expect(screen.getByText('Statements issued').first()).toBeVisible();
  await expect(screen.getByText('New statement').first()).toBeVisible();
  await expect(screen.getByRole('button', 'New statement')).toBeHidden();

  await rail.getByRole('button', 'Requests for Funds, coming soon').tap();

  await expect(screen.getByRole('heading', { name: 'Requests for Funds', level: 1 })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeVisible();
});

test('opens User Accounts, Bank Accounts and Company Details, unmarked', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone');

  for (const title of ['User Accounts', 'Bank Accounts', 'Company Details']) {
    await rail.getByRole('button', new RegExp(`${title}$`)).tap();

    await expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeHidden();
  }
});

test('saves a check voucher as before', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
});
