import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

// Directory (packages/modules/directory; the records and their rules are in @keystone/core). The sample data has 4
// vendors, 3 clients and 4 employees. Meralco (V-001) is paid by a voucher; Manila Water (V-002) is used by nothing.
// Novatek (C-001), the client a new statement starts with, is VAT-registered and withholds 5%.

/** The Activity Log's entries written by the Directory. */
async function directoryLog(screen: Screen) {
  await screen.getByRole('group', 'Module').getByRole('button', 'Directory').tap();

  return screen.getByRole('region', 'Entries');
}

test('adds a vendor, who can then be paid by a request for funds', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  await expect(dialog.getByText('Gets code V-005.')).toBeVisible();
  await dialog.getByRole('textbox', 'Name').fill('Pasig Office Depot');
  await dialog.getByRole('textbox', 'TIN').fill('123-456-789-000');
  await dialog.getByRole('textbox', 'Address').fill('Shaw Blvd., Pasig City');
  await dialog.getByRole('button', 'Add record').tap();

  await expect(screen.getByRole('dialog', 'V-005 added. It is now selectable in Requests for Funds.')).toBeVisible();
  await expect(screen.getByRole('table', 'Directory').getByRole('row', /^V-005 Vendor Pasig Office Depot 123-456-789-000 Shaw Blvd\., Pasig City/)).toBeVisible();
  await expect(screen.getByRole('button', 'Vendors 5')).toBeVisible();

  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const request = screen.getByRole('form', 'New request');

  await request.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await request.getByRole('combobox', 'Payee').tap();
  await expect(screen.getByRole('option', 'Pasig Office Depot (V-005)')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^Directory .* Records 12$/)).toBeVisible();

  await app.open('/#activity');
  const entries = await directoryLog(screen);

  await expect(entries.getByRole('listitem')).toHaveCount(1);
  await expect(entries.getByText('V-005 Pasig Office Depot added to the directory as vendor.')).toBeVisible();
});

test('adds a client with the VAT setup Billing Statements then follows', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  // The Type list opens in front of the dialog.
  await expect(dialog.getByRole('combobox', 'Type')).toHaveText('Vendor');
  await dialog.getByRole('combobox', 'Type').tap();
  await screen.getByRole('option', 'Client').tap();
  await expect(dialog.getByRole('combobox', 'Type')).toHaveText('Client');

  // A client is billed, so it gets an Attention line and its own VAT and withholding; VAT is on to start with.
  await expect(dialog.getByText('Gets code C-004.')).toBeVisible();
  await expect(dialog.getByRole('checkbox', 'VAT-registered (statements add 12% VAT)')).toBeChecked();
  await expect(dialog.getByRole('checkbox', 'Withholds EWT')).not.toBeChecked();
  await dialog.getByRole('textbox', 'Name').fill('Bayside Realty Corp.');
  await dialog.getByRole('textbox', 'TIN').fill('009-412-776-000');
  await dialog.getByRole('textbox', 'Address').fill('12/F Bayside Tower, Pasay City');
  await dialog.getByRole('textbox', 'Attention').fill('Nina Ocampo');
  await dialog.getByRole('button', 'Add record').tap();

  await expect(screen.getByRole('dialog', 'C-004 added. It is now selectable in Billing Statements.')).toBeVisible();
  await expect(screen.getByRole('table', 'Directory').getByRole('row', /^C-004 Client Bayside Realty Corp\. 009-412-776-000 12\/F Bayside Tower, Pasay City · VAT — /)).toBeVisible();

  // Billing it by its name takes the Attention and the setup: VAT, but no withholding, unlike Novatek.
  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('Bayside Realty Corp.');

  await expect(form.getByRole('textbox', 'Attention')).toHaveValue('Nina Ocampo');
  await expect(form.getByRole('checkbox', 'Add 12% VAT')).toBeChecked();
  await expect(form.getByRole('checkbox', 'Less 2% expanded withholding tax')).not.toBeChecked();
});

test('adds an employee, who can then be timed in and is counted on Home and Overview', async ({ app, screen }) => {
  await app.open('/#directory');

  // While the list shows employees, a new record is an employee.
  await screen.getByRole('group', 'Show').getByRole('button', 'Employees 4').tap();
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  // An employee has a position and a department instead of an address.
  await expect(dialog.getByRole('combobox', 'Type')).toHaveText('Employee');
  await expect(dialog.getByText('Gets code E-005.')).toBeVisible();
  await dialog.getByRole('textbox', 'Name').fill('Paolo R. Santiago');
  await dialog.getByRole('textbox', 'Position').fill('Security Officer');
  await dialog.getByRole('textbox', 'Department').fill('Administration');
  await dialog.getByRole('button', 'Add record').tap();

  // No installed screen picks an employee from here now that the ID Maker is not installed (docs/adr/0046), so the
  // message names none.
  await expect(screen.getByRole('dialog', 'E-005 added.')).toBeVisible();
  await expect(screen.getByRole('table', 'Directory').getByRole('row', /^E-005 Employee Paolo R\. Santiago — Security Officer · Administration — /)).toBeVisible();
  await expect(screen.getByRole('button', 'Employees 5')).toBeVisible();

  await app.open('/#timekeeping');
  await expect(screen.getByRole('table', 'Today').getByRole('button', 'Time in Paolo R. Santiago')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^Directory .* Records 12$/)).toBeVisible();
  await expect(screen.getByRole('button', /^Timekeeping .* In today 0 of 5$/)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '4 vendors · 3 clients · 5 employees' })).toBeVisible();
});

test('starts each word of a name with a capital as it is typed, here and on the documents', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  await dialog.getByRole('textbox', 'Name').fill('pasig office depot');
  await expect(dialog.getByRole('textbox', 'Name')).toHaveValue('Pasig Office Depot');

  // Capitals already typed stay: an initialism or a name like McDonald is never lowered.
  await dialog.getByRole('textbox', 'Name').fill('ALPHA PREMIER mcDonald opc');
  await expect(dialog.getByRole('textbox', 'Name')).toHaveValue('ALPHA PREMIER McDonald Opc');

  // Joining words stay small inside a name.
  await dialog.getByRole('textbox', 'Name').fill('alpha premier group of companies');
  await expect(dialog.getByRole('textbox', 'Name')).toHaveValue('Alpha Premier Group of Companies');

  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('springfield properties inc.');
  await form.getByRole('textbox', 'Attention').fill('ned flanders');
  await expect(form.getByRole('textbox', 'Bill to')).toHaveValue('Springfield Properties Inc.');
  await expect(form.getByRole('textbox', 'Attention')).toHaveValue('Ned Flanders');
});

test('needs a name for a new record', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  await dialog.getByRole('button', 'Add record').tap();

  await expect(dialog.getByRole('alert')).toHaveText('Enter a name for the record.');
  // The field it is about is marked and has the focus, and typing in it clears the mark.
  const name = dialog.getByRole('textbox', 'Name');

  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  await expect(dialog.getByRole('textbox', 'TIN')).not.toHaveAttribute('aria-invalid', 'true');
  await name.fill('Ortigas Dental Clinic');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
});

test('refuses a second vendor with a name already in use', async ({ app, screen }) => {
  await app.open('/#directory');
  await screen.getByRole('button', 'Add record').tap();
  const dialog = screen.getByRole('dialog', 'Add record');

  // Names are compared without regard to case.
  await dialog.getByRole('textbox', 'Name').fill('manila electric company (meralco)');
  await dialog.getByRole('button', 'Add record').tap();

  await expect(dialog.getByRole('alert')).toHaveText('V-001 already has that name.');
  await expect(dialog.getByRole('textbox', 'Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('textbox', 'Name')).toBeFocused();
  await dialog.getByRole('button', 'Cancel').tap();
  await expect(screen.getByRole('button', 'Vendors 4')).toBeVisible();
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

test('opens a record from its row, saves it under the same code and type, and logs the change', async ({ app, screen }) => {
  await app.open('/#directory');
  const row = screen.getByRole('table', 'Directory').getByRole('row', /^V-002 /);

  await row.tap();
  const dialog = screen.getByRole('dialog', 'Edit V-002');

  await expect(dialog.getByText('Keeps code V-002.')).toBeVisible();
  await expect(dialog.getByRole('textbox', 'Name')).toHaveValue('Manila Water Company');
  await dialog.getByRole('textbox', 'Address').fill('Katipunan Road, Quezon City');
  await dialog.getByRole('button', 'Save changes').tap();

  await expect(screen.getByRole('dialog', 'V-002 updated.')).toBeVisible();
  await expect(row).toContainText('Katipunan Road, Quezon City');

  // A record keeps its type: a vendor cannot become a client.
  await row.tap();
  const again = screen.getByRole('dialog', 'Edit V-002');

  await again.getByRole('combobox', 'Type').tap();
  await screen.getByRole('option', 'Client').tap();
  await again.getByRole('button', 'Save changes').tap();
  // Not about one field: the sentence is said, and no field is marked.
  await expect(again.getByRole('alert')).toHaveText('V-002 is a vendor; add a new record to change its type.');
  await expect(again.getByRole('textbox', 'Name')).not.toHaveAttribute('aria-invalid', 'true');
  await again.getByRole('button', 'Cancel').tap();
  await expect(row).toContainText('Vendor');

  await app.open('/#activity');
  const entries = await directoryLog(screen);

  await expect(entries.getByRole('listitem')).toHaveCount(1);
  await expect(entries.getByText('V-002 Manila Water Company updated.')).toBeVisible();
});

test('removes an unused record after asking, and one a document uses after saying which documents name it', async ({ app, screen }) => {
  await app.open('/#directory');
  const directory = screen.getByRole('table', 'Directory');

  await directory.getByRole('button', 'Actions for V-002').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  await screen.getByRole('alertdialog', /V-002/).getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', /V-002/).getByRole('button', /^Remove/).tap();

  await expect(directory.getByRole('row', /^V-002 /)).toBeHidden();
  await expect(screen.getByRole('button', 'Vendors 3')).toBeVisible();

  // A voucher names V-001: it can still go, once the person is told what keeps naming it.
  await directory.getByRole('button', 'Actions for V-001').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  const used = screen.getByRole('alertdialog', 'Remove V-001?');

  await expect(used.getByText(/It is named on CV records: they keep what was saved on them/)).toBeVisible();
  await used.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await used.getByRole('button', 'Remove record').tap();
  await expect(screen.getByRole('dialog', 'V-001 removed.')).toBeVisible();
  await expect(directory.getByRole('row', /^V-001 /)).toBeHidden();
  await expect(screen.getByRole('button', 'Vendors 2')).toBeVisible();
});

test('says what removing a record does, keeps it on cancel, and logs the removal', async ({ app, screen }) => {
  await app.open('/#directory');
  const directory = screen.getByRole('table', 'Directory');

  await directory.getByRole('button', 'Actions for V-002').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  const confirm = screen.getByRole('alertdialog', 'Remove V-002?');

  await expect(confirm.getByText('Manila Water Company is removed from the directory. Nothing refers to it yet, so no document changes.')).toBeVisible();
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(directory.getByRole('row', /^V-002 /)).toBeVisible();

  await directory.getByRole('button', 'Actions for V-002').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  await screen.getByRole('alertdialog', 'Remove V-002?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Remove V-002?').getByRole('button', 'Remove record').tap();
  await expect(screen.getByRole('dialog', 'V-002 removed.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^Directory .* Records 10$/)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '3 vendors · 3 clients · 4 employees' })).toBeVisible();

  await app.open('/#activity');
  const entries = await directoryLog(screen);

  await expect(entries.getByRole('listitem')).toHaveCount(1);
  await expect(entries.getByText('V-002 Manila Water Company removed from the directory.')).toBeVisible();
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

test('says when a search matches nothing, and clears it', async ({ app, screen }) => {
  await app.open('/#directory');
  const directory = screen.getByRole('table', 'Directory');

  await screen.getByRole('textbox', 'Search').fill('zzz');
  await expect(screen.getByText('Nothing matches “zzz”.')).toBeVisible();

  await screen.getByRole('button', 'Clear search').tap();
  await expect(screen.getByRole('textbox', 'Search')).toHaveValue('');
  await expect(directory.getByRole('row')).toHaveCount(12);
});
