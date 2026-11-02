import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Data (packages/modules/data): back up, restore and reset. Restore opens the system file picker, which the browser
// runner cannot drive; its parsing is covered by the kit's store tests.

test('is under Settings on the rail', async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('navigation', 'Keystone').getByRole('button', /Data$/).tap();

  await expect(screen.getByRole('heading', { name: 'Data', level: 1 })).toBeVisible();
  await expect(screen.getByText('Back up what Keystone holds, restore it, or start again from the sample data.')).toBeVisible();
});

test('backs up the data to a dated file', async ({ app, screen }) => {
  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Back up data…').tap();

  await expect(screen.getByRole('dialog', 'Saved keystone-backup-2026-11-02.json.')).toBeVisible();
});

test('resets to the sample data only after asking', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142 /)).toBeVisible();

  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Reset to sample data…').tap();
  const confirm = screen.getByRole('alertdialog', 'Reset to the sample data?');

  await confirm.getByRole('button', 'Cancel').tap();
  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142 /)).toBeVisible();

  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Reset to sample data…').tap();
  await screen.getByRole('alertdialog', 'Reset to the sample data?').getByRole('button', 'Reset data').tap();
  await app.open('/#vouchers');

  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142 /)).toBeHidden();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row')).toHaveCount(4);
});
