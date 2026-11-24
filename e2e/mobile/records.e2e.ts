import { basename } from 'node:path';
import { test, type Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { pickSignatory } from '../support/signatory';

// Working the records on a phone and a tablet, as on the desktop: pickers and the options they open, dialogs that
// ask first, a file picked from the device and one saved to it, and a tap on today's board.

/** Whether the first element `selector` finds lies wholly on the screen. */
function onScreen(browser: Browser, selector: string) {
  return browser.evaluate((css: string) => {
    const box = document.querySelector(css)?.getBoundingClientRect();

    return !!box && box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5;
  }, selector);
}

test('picks from a list that opens on the screen, each option big enough for a finger, and a date from the device’s picker', async ({ app, screen, browser }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('combobox', 'Employee').tap();
  const options = screen.getByRole('listbox');

  await expect(options).toBeVisible();
  expect(await onScreen(browser, '[role="listbox"]')).toBe(true);
  const option = (await screen.getByRole('option', 'Angelica S. Bautista').boundingBox())!;

  expect(option.height).toBeGreaterThanOrEqual(44);
  await screen.getByRole('option', 'Angelica S. Bautista').tap();
  await expect(screen.getByRole('combobox', 'Employee')).toHaveText(/Angelica S\. Bautista/);

  // A date is typed in the device's own date picker, as a plain date field.
  const holiday = screen.getByRole('form', 'Add a holiday');

  await holiday.getByRole('textbox', 'Date').fill('2026-11-30');
  await holiday.getByRole('textbox', 'Holiday').fill('Bonifacio Day');
  await holiday.getByRole('button', 'Add holiday').tap();
  await expect(screen.getByRole('table', 'Holidays').getByRole('row', /^Nov 30, 2026 Bonifacio Day Regular holiday/)).toBeVisible();
});

test('asks before voiding a voucher, in a dialog that fits the screen', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await screen.getByRole('table', 'Voucher register').getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', /^Void/).tap();
  const confirm = screen.getByRole('alertdialog');

  await expect(confirm).toBeVisible();
  expect(await onScreen(browser, '[role="alertdialog"]')).toBe(true);
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(confirm).toBeHidden();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0141 .*For Approval/)).toBeVisible();
});

test('uploads a signature picked on the device, and saves a backup to the device and restores it from there', async ({ app, screen, browser }) => {
  await app.open('/#company');
  const panel = screen.getByRole('region', 'Signatures');

  await pickSignatory(screen, panel, 'Whose signature', 'D. Lazaro');
  await panel.getByRole('button', 'Upload signature…').setInputFiles('shared/logo.png');
  await expect(panel.getByRole('list', 'Signatures kept').getByRole('img', 'Signature of D. LAZARO')).toBeVisible();

  await app.open('/#data');
  const backup = await browser.waitForDownload(() => screen.getByRole('region', 'Data').getByRole('button', 'Back up data…').tap());

  expect(backup.suggestedFilename).toBe('keystone-backup-2026-11-02.json');
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles(backup.absolutePath);
  const ask = screen.getByRole('alertdialog', `Restore ${basename(backup.absolutePath)}?`);

  await expect(ask).toBeVisible();
  expect(await onScreen(browser, '[role="alertdialog"]')).toBe(true);
  await ask.getByRole('button', 'Cancel').tap();
  await expect(ask).toBeHidden();
});

test('times an employee in with a tap on today\'s board', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('button', 'Time in Juan Miguel P. Reyes').tap();

  await expect(screen.getByText(/^1 of 4 employees timed in today/)).toBeVisible();
});

test('searches and filters the directory, and opens a record from its row in a dialog that fits the screen', async ({ app, screen, browser }) => {
  await app.open('/#directory');
  await screen.getByRole('group', 'Show').getByRole('button', /^Employees/).tap();
  await screen.getByRole('textbox', 'Search').fill('Bautista');
  const register = screen.getByRole('table', 'Directory');

  await expect(register.getByRole('row')).toHaveCount(2);
  await register.getByRole('row', /^E-002 /).tap();
  const dialog = screen.getByRole('dialog', 'Edit E-002');

  await expect(dialog).toBeVisible();
  expect(await onScreen(browser, '[role="dialog"]')).toBe(true);
});
