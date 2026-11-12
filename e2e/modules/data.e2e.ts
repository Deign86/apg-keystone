import { basename } from 'node:path';
import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { startEmpty } from '../support/sample-records';

// Data (packages/modules/data): back up and restore. The tests' sample records have 3 vouchers, 3 statements, 3 IDs and
// 11 directory records. A backup is downloaded, and restoring picks a file in the browser's file chooser, so a test can
// back up and restore that same file. The runner keeps a download under a numbered name
// (001-keystone-backup-2026-11-02.json), and that is the name the chooser hands Keystone. Keystone has no sample data
// to reset to (docs/adr/0018).

/** Saves 888-001 for Meralco, the payee a new voucher starts with. */
async function saveVoucher(screen: Screen) {
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
}

test('is under Settings on the rail, and has nothing made up to reset to', async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('navigation', 'Keystone').getByRole('button', /Data$/).tap();

  await expect(screen.getByRole('heading', { name: 'Data', level: 1 })).toBeVisible();
  await expect(screen.getByText('Back up what Keystone holds, or restore it from a backup.')).toBeVisible();
  await expect(screen.getByText('This browser preview keeps data in this browser only. A backup is one JSON file in the same format as the prototype, so it opens in any Keystone.')).toBeVisible();
  await expect(screen.getByRole('region', 'Data').getByRole('button')).toHaveCount(2);
  await expect(screen.getByRole('button', /Reset/)).toBeHidden();
});

test('backs up the data to a dated file', async ({ app, screen }) => {
  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Back up data…').tap();

  await expect(screen.getByRole('dialog', 'Saved keystone-backup-2026-11-02.json.')).toBeVisible();
});

test('restores a backup only after asking, and drops what was saved since', async ({ app, screen, browser }) => {
  await app.open('/#data');
  const backup = await browser.waitForDownload(() => screen.getByRole('region', 'Data').getByRole('button', 'Back up data…').tap());
  const file = basename(backup.absolutePath);

  expect(backup.suggestedFilename).toBe('keystone-backup-2026-11-02.json');

  await app.open('/#vouchers');
  await saveVoucher(screen);

  // Restoring says what the backup holds; cancelling keeps the voucher saved after it.
  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles(backup.absolutePath);
  const confirm = screen.getByRole('alertdialog', `Restore ${file}?`);

  await expect(confirm.getByText('It holds 3 vouchers, 3 statements, 3 IDs and 11 directory records. Everything Keystone holds now is replaced.')).toBeVisible();
  await confirm.getByRole('button', 'Cancel').tap();
  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 /)).toBeVisible();

  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles(backup.absolutePath);
  await screen.getByRole('alertdialog', `Restore ${file}?`).getByRole('button', 'Replace with backup').tap();
  await expect(screen.getByRole('dialog', `Restored ${file}.`)).toBeVisible();

  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 /)).toBeHidden();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row')).toHaveCount(4);

  // Home and the Activity Log are back to the sample data too.
  await app.open('/');
  await expect(screen.getByRole('button', /^Check Vouchers .* Awaiting approval 1$/)).toBeVisible();
  await app.open('/#activity');
  await expect(screen.getByText('6 entries. The last was on Oct 26, 2026.')).toBeVisible();
});

test('brings the work in a backup into a Keystone that starts with no records', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await saveVoucher(screen);

  await app.open('/#data');
  const backup = await browser.waitForDownload(() => screen.getByRole('region', 'Data').getByRole('button', 'Back up data…').tap());
  const file = basename(backup.absolutePath);

  // Another computer: nothing saved there, so nothing at all, until the backup is restored.
  await startEmpty(app, browser, '/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 /)).toBeHidden();
  await app.open('/#data');
  const data = screen.getByRole('region', 'Data');

  await data.getByRole('button', 'Restore from backup…').setInputFiles(backup.absolutePath);
  const confirm = screen.getByRole('alertdialog', `Restore ${file}?`);

  await expect(confirm.getByText('It holds 4 vouchers, 3 statements, 3 IDs and 11 directory records. Everything Keystone holds now is replaced.')).toBeVisible();
  await confirm.getByRole('button', 'Replace with backup').tap();
  await expect(screen.getByRole('dialog', `Restored ${file}.`)).toBeVisible();

  // The voucher is back in the register, on Home and in the Activity Log.
  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 Nov 2, 2026 Manila Electric Company \(Meralco\).*₱1,250\.50 For Approval/)).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^Check Vouchers .* Awaiting approval 2$/)).toBeVisible();

  await app.open('/#activity');
  const entries = screen.getByRole('region', 'Entries');

  await expect(entries.getByRole('listitem')).toHaveCount(7);
  await expect(entries.getByText('888-001 for Manila Electric Company (Meralco) saved and routed for approval (₱1,250.50).')).toBeVisible();
});

test('refuses a file that is not a Keystone backup, and changes nothing', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await saveVoucher(screen);

  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles('e2e/support/fixtures/not-a-keystone-backup.json');

  await expect(screen.getByRole('dialog', 'That file is not a Keystone backup.')).toBeVisible();
  await expect(screen.getByRole('alertdialog')).toBeHidden();

  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 /)).toBeVisible();
});

test('refuses a backup that was cut off, in the same words', async ({ app, screen }) => {
  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles('e2e/support/fixtures/cut-off-backup.json');

  await expect(screen.getByRole('dialog', 'That file is not a Keystone backup.')).toBeVisible();
  await expect(screen.getByRole('alertdialog')).toBeHidden();
});

// The sample data edited by hand: a released voucher has lost its particulars, and a log entry's text is a number. Its
// screens could not show it (screens.e2e.ts opens it as a damaged saved state), so it is never restored.
test('refuses a backup with a record a screen cannot show, naming the record, and changes nothing', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await saveVoucher(screen);

  await app.open('/#data');
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles('e2e/support/fixtures/shell-damaged-records.json');

  await expect(screen.getByRole('dialog', 'That backup has a voucher Keystone cannot read (CV-2026-0138), so nothing was restored.')).toBeVisible();
  await expect(screen.getByRole('alertdialog')).toBeHidden();

  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 /)).toBeVisible();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0138 /)).toBeHidden();
});

