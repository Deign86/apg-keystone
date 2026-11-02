import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// ID Maker (packages/modules/id-maker). The sample data has APG-2026-0028 to 0030 issued, so a new card is
// APG-2026-0031. Kristine Joy L. Villanueva (E-004) is the one employee without a card.

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

test('marks a printed card handed over', async ({ app, screen }) => {
  await app.open('/#id-maker');
  await expect(screen.getByText('1 card waiting to be printed: Rafael D. Mendoza.')).toBeVisible();
  const row = screen.getByRole('table', 'Issued IDs').getByRole('row', /^APG-2026-0030 /);

  await row.getByRole('button', 'Actions for APG-2026-0030').tap();
  await screen.getByRole('menuitem', 'Mark printed and handed over').tap();

  await expect(row.getByRole('cell', 'Active')).toBeVisible();
  await expect(screen.getByText('1 card waiting to be printed: Rafael D. Mendoza.')).toBeHidden();
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
