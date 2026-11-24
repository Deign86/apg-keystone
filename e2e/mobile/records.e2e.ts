import { basename } from 'node:path';
import { test, type Browser } from '@e2e-dev/web';
import { expect } from 'e2e';

// Working the records on a phone and a tablet, as on the desktop: pickers and the options they open, dialogs that
// ask first, a file picked from the device and one saved to it, and a tap on today's board.

/** Whether the first element `selector` finds lies wholly on the screen. */
function onScreen(browser: Browser, selector: string) {
  return browser.evaluate((css: string) => {
    const box = document.querySelector(css)?.getBoundingClientRect();

    return !!box && box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5;
  }, selector);
}

test('picks from a list that opens on the screen, each option big enough for a finger', async ({ app, screen, browser }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');

  await form.getByRole('combobox', 'Employee').tap();
  const options = screen.getByRole('listbox');

  await expect(options).toBeVisible();
  expect(await onScreen(browser, '[role="listbox"]')).toBe(true);
  const option = (await screen.getByRole('option', /Kristine Joy L\. Villanueva/).boundingBox())!;

  expect(option.height).toBeGreaterThanOrEqual(44);
  await screen.getByRole('option', /Kristine Joy L\. Villanueva/).tap();
  await expect(form.getByRole('textbox', 'Name on card')).toHaveValue('Kristine Joy L. Villanueva');

  // A date is typed in the device's own date picker, as a plain date field.
  await form.getByRole('textbox', 'Valid until').fill('2027-12-31');
  await expect(form.getByRole('textbox', 'Valid until')).toHaveValue('2027-12-31');
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

test('puts a photo picked on the device on a card, and saves a backup to the device', async ({ app, screen, browser }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');
  const card = screen.getByRole('region', 'Card preview');

  await form.getByRole('button', 'Choose photo…').setInputFiles('shared/logo.png');
  await expect(form.getByRole('button', 'Replace photo…')).toBeVisible();
  await expect(card.getByText('2×2 photo')).toBeHidden();

  await app.open('/#data');
  const backup = await browser.waitForDownload(() => screen.getByRole('region', 'Data').getByRole('button', 'Back up data…').tap());

  expect(backup.suggestedFilename).toBe('keystone-backup-2026-11-02.json');
  // And the backup restores from the device's file picker.
  await screen.getByRole('region', 'Data').getByRole('button', 'Restore from backup…').setInputFiles(backup.absolutePath);
  const ask = screen.getByRole('alertdialog', `Restore ${basename(backup.absolutePath)}?`);

  await expect(ask.getByText('It holds 3 vouchers, 3 statements, 3 IDs and 11 directory records. Everything Keystone holds now is replaced.')).toBeVisible();
  await ask.getByRole('button', 'Cancel').tap();
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
