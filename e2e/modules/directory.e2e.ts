import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Directory (packages/modules/directory; the records and their rules are in @keystone/core). The sample data has 4
// vendors, 3 clients and 4 employees. Meralco (V-001) is paid by a voucher; Manila Water (V-002) is used by nothing.

test('adds a vendor, who can then be paid by voucher', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  await expect(dialog.getByText('Gets code V-005.')).toBeVisible();
  await dialog.getByRole('textbox', 'Name').fill('Pasig Office Depot');
  await dialog.getByRole('textbox', 'TIN').fill('123-456-789-000');
  await dialog.getByRole('textbox', 'Address').fill('Shaw Blvd., Pasig City');
  await dialog.getByRole('button', 'Add record').tap();

  await expect(screen.getByRole('table', 'Directory').getByRole('row', /^V-005 Vendor Pasig Office Depot 123-456-789-000 Shaw Blvd\., Pasig City/)).toBeVisible();
  await expect(screen.getByRole('button', 'Vendors 5')).toBeVisible();

  await app.open('/#vouchers');
  await screen.getByRole('form', 'New voucher').getByRole('combobox', 'Payee').tap();
  await expect(screen.getByRole('option', 'Pasig Office Depot (V-005)')).toBeVisible();
});

test('needs a name for a new record', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  await dialog.getByRole('button', 'Add record').tap();

  await expect(dialog.getByText('Enter a name for the record.')).toBeVisible();
});

test('edits a record', async ({ app, screen }) => {
  await app.open('/#directory');
  const row = screen.getByRole('table', 'Directory').getByRole('row', /^V-002 /);

  await row.getByRole('button', 'Actions for V-002').tap();
  await screen.getByRole('menuitem', 'Edit…').tap();
  const dialog = screen.getByRole('dialog', /V-002/);

  await dialog.getByRole('textbox', 'Address').fill('Katipunan Road, Quezon City');
  await dialog.getByRole('button', /^Save/).tap();

  await expect(row).toContainText('Katipunan Road, Quezon City');
});

test('removes an unused record after asking, and refuses one a document uses', async ({ app, screen }) => {
  await app.open('/#directory');
  const directory = screen.getByRole('table', 'Directory');

  await directory.getByRole('button', 'Actions for V-001').tap();
  await expect(screen.getByRole('menuitem', 'Remove…')).toBeDisabled();
  await screen.getByRole('menuitem', 'Edit…').press('Escape');

  await directory.getByRole('button', 'Actions for V-002').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  await screen.getByRole('alertdialog', /V-002/).getByRole('button', /^Remove/).tap();

  await expect(directory.getByRole('row', /^V-002 /)).toBeHidden();
  await expect(screen.getByRole('button', 'Vendors 3')).toBeVisible();
});

test('filters by type and searches', async ({ app, screen }) => {
  await app.open('/#directory');
  const directory = screen.getByRole('table', 'Directory');

  await screen.getByRole('group', 'Show').getByRole('button', 'Clients 3').tap();
  await expect(directory.getByRole('row')).toHaveCount(4);
  await expect(directory.getByRole('row', /^C-002 Client Dela Cruz, Maria Teresa/)).toBeVisible();

  await screen.getByRole('group', 'Show').getByRole('button', 'All 11').tap();
  await screen.getByRole('textbox', 'Search').fill('Pasig');

  await expect(directory.getByRole('row')).toHaveCount(2);
  await expect(directory.getByRole('row', /^V-001 Vendor Manila Electric Company \(Meralco\)/)).toBeVisible();
});
