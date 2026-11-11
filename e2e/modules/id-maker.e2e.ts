import { readFileSync } from 'node:fs';
import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

// ID Maker (packages/modules/id-maker). The sample data has APG-2026-0028 to 0030 issued, so a new card is
// APG-2026-0031. 0028 (Juan) and 0029 (Angelica) are printed and active; 0030 (Rafael) waits to be printed.
// Kristine Joy L. Villanueva (E-004) is the one employee without a card.

/** The Activity Log's entries written by the ID Maker. */
async function idLog(screen: Screen) {
  await screen.getByRole('group', 'Module').getByRole('button', 'IDs').tap();

  return screen.getByRole('region', 'Entries');
}

/** Picks Kristine Joy L. Villanueva in the New ID form. */
async function pickKristine(screen: Screen) {
  await screen.getByRole('form', 'New ID').getByRole('combobox', 'Employee').tap();
  await screen.getByRole('option', /Kristine Joy L\. Villanueva/).tap();
}

test('issues an ID from an employee in the directory', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');

  await expect(form.getByRole('textbox', 'ID No.')).toHaveValue('APG-2026-0031');
  await expect(form.getByRole('textbox', 'Valid until')).toHaveValue('2027-11-01');

  await form.getByRole('combobox', 'Employee').tap();
  await screen.getByRole('option', /Kristine Joy L\. Villanueva/).tap();

  // The card fills from the employee's record.
  await expect(form.getByRole('textbox', 'Name on card')).toHaveValue('Kristine Joy L. Villanueva');
  await expect(form.getByRole('textbox', 'Position')).toHaveValue('Admin Assistant');
  const card = screen.getByRole('region', 'Card preview');

  await expect(card.getByText('Kristine Joy L. Villanueva')).toBeVisible();

  await form.getByRole('button', 'Save and issue').tap();

  const register = screen.getByRole('table', 'Issued IDs');

  await expect(register.getByRole('row', /^APG-2026-0031 Kristine Joy L\. Villanueva Admin Assistant Nov 2, 2026 Nov 1, 2027 For printing/)).toBeVisible();
  await expect(form.getByRole('textbox', 'ID No.')).toHaveValue('APG-2026-0032');
});

test('issued cards wait to be printed on Home, on Overview and in the Activity Log', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');

  await pickKristine(screen);
  await form.getByRole('button', 'Save and issue').tap();
  await expect(screen.getByRole('dialog', 'APG-2026-0031 issued and queued for printing.')).toBeVisible();

  await form.getByRole('textbox', 'Name on card').fill('Paolo R. Santiago');
  await form.getByRole('button', 'Save and issue').tap();
  await expect(screen.getByRole('dialog', 'APG-2026-0032 issued and queued for printing.')).toBeVisible();
  await expect(screen.getByText('3 cards waiting to be printed: Rafael D. Mendoza, Kristine Joy L. Villanueva, Paolo R. Santiago.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^ID Maker .* Queued for printing 3$/)).toBeVisible();

  // Two cards issued this month: the sample's were issued in September and October. No other figure reads 2.
  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: /^2$/ })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '3 queued for printing' })).toBeVisible();
  await expect(screen.getByRole('region', 'Waiting on you').getByRole('button', /^APG-2026-0031 Kristine Joy L\. Villanueva · ID card /)).toBeVisible();

  await app.open('/#activity');
  const entries = await idLog(screen);

  await expect(entries.getByRole('listitem')).toHaveCount(3);
  await expect(entries.getByText('APG-2026-0031 issued to Kristine Joy L. Villanueva; queued for printing.')).toBeVisible();
  await expect(entries.getByText('APG-2026-0032 issued to Paolo R. Santiago; queued for printing.')).toBeVisible();
});

test('issues an ID typed by hand, and needs the name', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');

  await form.getByRole('button', 'Save and issue').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the name to print on the card.');

  await form.getByRole('textbox', 'Name on card').fill('Paolo R. Santiago');
  await form.getByRole('textbox', 'Position').fill('Security Officer');
  await form.getByRole('button', 'Save and issue').tap();

  await expect(screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0031 Paolo R\. Santiago Security Officer /)).toBeVisible();
});

test('needs the card to be valid past the day it is issued', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');

  await form.getByRole('textbox', 'Name on card').fill('Paolo R. Santiago');
  await form.getByRole('textbox', 'Valid until').fill('2026-11-02');
  await form.getByRole('button', 'Save and issue').tap();

  await expect(form.getByRole('alert')).toHaveText('The card must be valid past the day it is issued.');
  await expect(screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0031 /)).toBeHidden();
});

test('edits a card before it is printed, from its row', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const register = screen.getByRole('table', 'Issued IDs');

  await register.getByRole('row', /^APG-2026-0030 /).tap();
  await expect(screen.getByRole('dialog', 'APG-2026-0030 loaded for preview.')).toBeVisible();
  const form = screen.getByRole('form', 'Editing APG-2026-0030');

  await expect(form.getByRole('textbox', 'ID No.')).toHaveValue('APG-2026-0030');
  await expect(form.getByRole('textbox', 'Name on card')).toHaveValue('Rafael D. Mendoza');
  await form.getByRole('textbox', 'Position').fill('Senior Property Manager');
  await form.getByRole('button', 'Save changes').tap();

  // Saved in place under the same number; the form is a new card again.
  await expect(screen.getByRole('dialog', 'APG-2026-0030 updated.')).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-0030 Rafael D\. Mendoza Senior Property Manager Oct 6, 2026 Oct 5, 2027 For printing/)).toBeVisible();
  await expect(register.getByRole('row')).toHaveCount(4);
  await expect(screen.getByRole('form', 'New ID').getByRole('textbox', 'ID No.')).toHaveValue('APG-2026-0031');

  await app.open('/#activity');
  const entries = await idLog(screen);

  await expect(entries.getByText('APG-2026-0030 for Rafael D. Mendoza edited before printing.')).toBeVisible();
});

test('will not change a printed card, and issues it again as a new one', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const register = screen.getByRole('table', 'Issued IDs');

  await register.getByRole('row', /^APG-2026-0028 /).tap();
  const form = screen.getByRole('form', 'Editing APG-2026-0028');

  await form.getByRole('button', 'Save changes').tap();
  await expect(form.getByRole('alert')).toHaveText('APG-2026-0028 has been printed. Issue a new ID instead.');

  await form.getByRole('button', 'Issue as new').tap();

  // The new card copies the old one under the next number; the printed one stays active.
  await expect(screen.getByRole('dialog', 'APG-2026-0031 issued and queued for printing.')).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-0031 Juan Miguel P\. Reyes Leasing Associate .* For printing/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-0028 /).getByRole('cell', 'Active')).toBeVisible();
  await expect(screen.getByText('2 cards waiting to be printed: Rafael D. Mendoza, Juan Miguel P. Reyes.')).toBeVisible();
});

test('marks a printed card handed over', async ({ app, screen }) => {
  await app.open('/#id-maker');
  await expect(screen.getByText('1 card waiting to be printed: Rafael D. Mendoza.')).toBeVisible();
  const row = screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0030 /);

  await row.getByRole('button', 'Actions for APG-2026-0030').tap();
  await screen.getByRole('menuitem', 'Mark printed and handed over').tap();

  await expect(row.getByRole('cell', 'Active')).toBeVisible();
  await expect(screen.getByText('1 card waiting to be printed: Rafael D. Mendoza.')).toBeHidden();
  await expect(screen.getByText('No card is waiting to be printed. Pick an employee and the card renders front and back.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^ID Maker .* Queued for printing 0$/)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '0 queued for printing' })).toBeVisible();
  await expect(screen.getByRole('region', 'Waiting on you').getByRole('button', /^APG-2026-0030 /)).toBeHidden();

  await app.open('/#activity');
  const entries = await idLog(screen);

  await expect(entries.getByText('APG-2026-0030 printed and handed to Rafael D. Mendoza.')).toBeVisible();
});

test('revokes a card from its row menu', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const row = screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0028 /);

  await row.getByRole('button', 'Actions for APG-2026-0028').tap();
  await screen.getByRole('menuitem', 'Mark revoked').tap();

  await expect(screen.getByRole('dialog', 'APG-2026-0028 marked revoked.')).toBeVisible();
  await expect(row.getByRole('cell', 'Revoked')).toBeVisible();
  await row.getByRole('button', 'Actions for APG-2026-0028').tap();
  await expect(screen.getByRole('menuitem', 'Mark revoked')).toBeDisabled();
  await screen.getByRole('menuitem', 'Mark revoked').press('Escape');

  await app.open('/#activity');
  const entries = await idLog(screen);

  await expect(entries.getByText('APG-2026-0028 for Juan Miguel P. Reyes marked revoked.')).toBeVisible();
});

test('marks an active card expired when Keystone opens after its date', async ({ app, screen, browser }) => {
  await app.open('/#id-maker');
  await pickKristine(screen);
  const form = screen.getByRole('form', 'New ID');

  await form.getByRole('textbox', 'Date issued').fill('2025-01-01');
  await form.getByRole('textbox', 'Valid until').fill('2025-12-31');
  await form.getByRole('button', 'Save and issue').tap();
  const row = screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0031 Kristine Joy L\. Villanueva Admin Assistant Jan 1, 2025 Dec 31, 2025 /);

  await row.getByRole('button', 'Actions for APG-2026-0031').tap();
  await screen.getByRole('menuitem', 'Mark printed and handed over').tap();
  await expect(row.getByRole('cell', 'Active')).toBeVisible();

  // Cards are checked against today's date as Keystone opens.
  await browser.reload();
  await expect(row.getByRole('cell', 'Expired')).toBeVisible();

  await app.open('/#activity');
  const entries = await idLog(screen);

  await expect(entries.getByText('APG-2026-0031 for Kristine Joy L. Villanueva marked expired.')).toBeVisible();
});

test('puts a photo on the card, keeps it with the issued card, and removes it', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');
  const card = screen.getByRole('region', 'Card preview');

  await expect(card.getByText('2×2 photo')).toBeVisible();
  await form.getByRole('textbox', 'Name on card').fill('Paolo R. Santiago');
  await form.getByRole('button', 'Choose photo…').setInputFiles('shared/logo.png');

  await expect(form.getByRole('button', 'Replace photo…')).toBeVisible();
  await expect(card.getByText('2×2 photo')).toBeHidden();
  await form.getByRole('button', 'Save and issue').tap();
  await expect(card.getByText('2×2 photo')).toBeVisible();

  // Opening the card again shows its photo, which can be taken off.
  await screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0031 /).tap();
  const editing = screen.getByRole('form', 'Editing APG-2026-0031');

  await expect(card.getByText('2×2 photo')).toBeHidden();
  await editing.getByRole('button', 'Remove').tap();

  await expect(card.getByText('2×2 photo')).toBeVisible();
  await expect(editing.getByRole('button', 'Choose photo…')).toBeVisible();
  await expect(editing.getByRole('button', 'Remove')).toBeHidden();
});

test('refuses a file that is not an image as the photo', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');

  await form.getByRole('button', 'Choose photo…').setInputFiles('e2e/support/fixtures/damaged-photo.jpg');

  // The reason after the colon is the browser's own.
  await expect(screen.getByRole('dialog', /^That file could not be used as a photo: /)).toBeVisible();
  await expect(form.getByRole('button', 'Choose photo…')).toBeVisible();
  await expect(screen.getByRole('region', 'Card preview').getByText('2×2 photo')).toBeVisible();
});

test('prints the card front and back with its verification pattern', async ({ app, screen }) => {
  await app.open('/#id-maker');
  const card = screen.getByRole('region', 'Card preview');

  // The number and the signature line each share their element with a caption, hence the substring match.
  await expect(card.getByText('APG-2026-0031', { exact: false })).toBeVisible();
  await expect(card.getByText('Nov 1, 2027', { exact: false })).toBeVisible();
  await expect(card.getByRole('image', 'Verification pattern')).toBeVisible();
  await expect(card.getByText('Authorized signature', { exact: false })).toContainText('Chief Executive Officer');
});

test('puts the emergency contact and blood type on the back, and exports the print file', async ({ app, screen, browser }) => {
  await app.open('/#id-maker');
  const form = screen.getByRole('form', 'New ID');
  const card = screen.getByRole('region', 'Card preview');

  await pickKristine(screen);
  await form.getByRole('combobox', 'Blood type').tap();
  await screen.getByRole('option', 'AB+').tap();
  await form.getByRole('textbox', 'Emergency contact').fill('Teresa Villanueva');
  await form.getByRole('textbox', 'Contact number').fill('0917 555 0142');

  await expect(card).toContainText('Teresa Villanueva · 0917 555 0142');
  await expect(card).toContainText('Blood type: AB+');

  const pdf = await browser.waitForDownload(() => form.getByRole('button', 'Export print file').tap());

  expect(pdf.suggestedFilename).toBe('APG-2026-0031.pdf');
  expect(readFileSync(pdf.absolutePath, 'latin1').slice(0, 5)).toBe('%PDF-');
  await expect(screen.getByRole('dialog', 'Saved APG-2026-0031.pdf.')).toBeVisible();
});

test('opens a waiting card from Overview, and starts a new one from its button', async ({ app, screen }) => {
  await app.open('/#overview');
  await screen.getByRole('region', 'Waiting on you').getByRole('button', /^APG-2026-0030 Rafael D\. Mendoza · ID card /).tap();

  await expect(screen.getByRole('heading', { name: 'ID Maker', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'Editing APG-2026-0030')).toBeVisible();

  // Overview's "New ID" sets the half-edited card aside for a blank one.
  await screen.getByRole('navigation', 'Keystone').getByRole('button', /Overview$/).tap();
  await screen.getByRole('button', 'New ID').tap();

  await expect(screen.getByRole('heading', { name: 'ID Maker', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'New ID').getByRole('textbox', 'ID No.')).toHaveValue('APG-2026-0031');
});
