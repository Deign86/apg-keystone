import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// A release that is not a beta (e2e.stable.config.ts, docs/adr/0017): Home, with the connected systems, Check Vouchers,
// Requests for Funds (docs/adr/0021), Billing Statements and the Directory its clients come from, Statements of
// Account (docs/adr/0040), Profile, User Accounts, and Bank Accounts and Company Details, which vouchers print from
// (docs/adr/0018), open; every other screen keeps its place in the rail and its tile on Home, marked, and shows
// behind "Coming soon" (docs/adr/0019).

test('opens Home with every tile, those coming soon marked, and the connected systems', async ({ app, screen }) => {
  await app.open('/');
  const tiles = screen.getByRole('main').getByRole('list').first();

  await expect(tiles.getByRole('listitem')).toHaveCount(10);
  await expect(tiles.getByRole('button', /^Check Vouchers .* Awaiting approval 1$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Requests for Funds .* Waiting for a decision 0$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Billing Statements .* Outstanding/)).not.toContainText('Coming soon');
  await expect(tiles.getByRole('button', /^ID Maker Coming soon /)).toBeVisible();
  await expect(screen.getByText('Connected systems')).toBeVisible();
  await expect(screen.getByRole('button', 'Open Attendance Tracker')).toBeVisible();
});

test('marks every other screen in the rail and opens it on "Coming soon"', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone');

  await rail.getByRole('button', 'Payroll, coming soon').tap();

  await expect(screen.getByRole('heading', { name: 'Payroll', level: 1 })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeVisible();
  await expect(screen.getByText('This screen hit a problem')).toBeHidden();

  await rail.getByRole('button', 'ID Maker, coming soon').tap();

  await expect(screen.getByRole('heading', { name: 'ID Maker', level: 1 })).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeVisible();
});

test('opens Requests for Funds, Billing Statements, Statements of Account, the Directory, Profile, User Accounts, Bank Accounts and Company Details, unmarked', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone');

  for (const title of ['Requests for Funds', 'Billing Statements', 'Statements of Account', 'Directory', 'Profile', 'User Accounts', 'Bank Accounts', 'Company Details']) {
    await rail.getByRole('button', new RegExp(`${title}$`)).tap();

    await expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeHidden();
  }
});

test('asks for funds, listing the expenses to be paid back by transfer', async ({ app, screen }) => {
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill('Revolving fund, Nov 1 to 15');
  await form.getByRole('textbox', 'Line 1 description').fill('Pantry groceries');
  await form.getByRole('textbox', 'Line 1 amount').fill('3250.75');
  await form.getByRole('textbox', 'Bank').fill('BDO');
  await form.getByRole('textbox', 'Account name').fill('Liza Ramos');
  await form.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await form.getByRole('textbox', 'Requested by').fill('Ana Cruz');
  await form.getByRole('button', 'Send for approval').tap();

  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
});

test('saves a check voucher as before', async ({ app, screen }) => {
  await app.open('/#vouchers');
  // The form is on its own tab, beside the register.
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
});

test('issues a billing statement to a client the Directory keeps', async ({ app, screen }) => {
  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(screen.getByRole('dialog', '888-110226 saved and marked as sent.')).toBeVisible();

  await screen.getByRole('tab', /^Statements issued/).tap();
  await expect(screen.getByRole('table', 'Statements issued').getByRole('row', /^888-110226 Novatek BPO Solutions Inc\. .* Sent/)).toBeVisible();
});
