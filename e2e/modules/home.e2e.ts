import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Home (packages/modules/home): the front door, with the date, the greeting, the one finding, a tile per screen that
// is on Home, and a card per connected system.

test('greets with the date, the time of day and the one finding', async ({ app, screen }) => {
  await app.open('/');

  await expect(screen.getByText('Monday, November 2, 2026')).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible();
  await expect(screen.getByText('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.')).toBeVisible();
});

test('has a tile for each screen, with its figure, that opens it', async ({ app, screen }) => {
  await app.open('/');
  const tiles = screen.getByRole('main').getByRole('list').first();

  await expect(tiles.getByRole('listitem')).toHaveCount(9);
  await expect(tiles.getByRole('button', /^Check Vouchers .* Awaiting approval 1$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Requests for Funds .* Waiting for a decision 0$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Billing Statements .* Outstanding ₱677,627\.50$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^ID Maker .* Queued for printing 1$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Directory .* Records 11$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Timekeeping .* In today 0 of 4$/)).toBeVisible();
  await expect(tiles.getByRole('button', /^Payroll .* On payroll 0$/)).toBeVisible();

  await tiles.getByRole('button', /^Billing Statements /).tap();

  await expect(screen.getByRole('heading', { name: 'Billing Statements', level: 1 })).toBeVisible();
});

test('a tile follows the data: a voucher saved shows in its figure', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();

  await app.open('/');

  await expect(screen.getByRole('button', /^Check Vouchers .* Awaiting approval 2$/)).toBeVisible();
  await expect(screen.getByRole('button', /^Activity Log .* Last entry Nov 2, 2026$/)).toBeVisible();
});

test('the Overview and Activity Log tiles open their screens, and the log tile shows its last entry', async ({ app, screen }) => {
  await app.open('/');
  const tiles = screen.getByRole('main').getByRole('list').first();

  await expect(tiles.getByRole('button', /^Activity Log .* Last entry Oct 26, 2026$/)).toBeVisible();
  await tiles.getByRole('button', /^Overview /).tap();

  await expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  await app.open('/');
  await tiles.getByRole('button', /^Activity Log /).tap();

  await expect(screen.getByRole('heading', { name: 'Activity Log', level: 1 })).toBeVisible();
  await expect(screen.getByText('6 entries. The last was on Oct 26, 2026.')).toBeVisible();
});

test('has a shortcut to each connected system', async ({ app, screen }) => {
  await app.open('/');
  const shortcuts = screen.getByRole('main').getByRole('list').last();

  await expect(screen.getByRole('heading', { name: 'Connected systems', level: 2 })).toBeVisible();
  await expect(screen.getByText('Shortcuts to the other APG apps.')).toBeVisible();
  await expect(shortcuts.getByRole('listitem')).toHaveCount(3);
  await expect(shortcuts.getByRole('button', 'Open Attendance Tracker')).toBeVisible();
  await expect(shortcuts.getByRole('button', 'Open Alpha Branding Studio')).toBeVisible();
  await expect(shortcuts.getByRole('button', 'Open APG Website')).toBeVisible();
});
