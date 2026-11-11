import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

// Bank Accounts (packages/modules/banks). Until an account is saved, the list is the company account from the sample
// data, B-001 BPI · 4011 0258 68, the one a new statement's payment instructions name. Billing Statements lists the
// accounts under "Pay into" through the bank-accounts service.

const INSTRUCTIONS = [
  'Please make payment to:',
  'Bank: BDO, Ortigas Center',
  'Account Name: Alpha Premier Group of Companies OPC',
  'Account Number: 0012 3456 7890',
  '',
  'Kindly send proof of payment to accounting@alphapremiergroup.com',
].join('\n');

/** Adds B-002, a BDO account in the company's name, from the Bank Accounts screen. */
async function addBdo(screen: Screen) {
  await screen.getByRole('button', 'Add account').tap();
  const dialog = screen.getByRole('dialog', 'Add account');

  await expect(dialog.getByText('Gets B-002.')).toBeVisible();
  await dialog.getByRole('textbox', 'Bank').fill('BDO');
  await dialog.getByRole('textbox', 'Branch').fill('Ortigas Center');
  await dialog.getByRole('textbox', 'Account name').fill('Alpha Premier Group of Companies OPC');
  await dialog.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await dialog.getByRole('button', 'Add account').tap();
  await expect(screen.getByRole('dialog', 'B-002 added.')).toBeVisible();
}

/** The Activity Log's entries written by Bank Accounts. */
async function banksLog(screen: Screen) {
  await screen.getByRole('group', 'Module').getByRole('button', 'Bank Accounts').tap();

  return screen.getByRole('region', 'Entries').getByRole('listitem');
}

test('is under Settings on the rail, after Data, and starts with the company account', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone').getByRole('list').getByRole('button');

  await expect(rail.last()).toHaveAccessibleName(/Bank Accounts$/);
  await rail.last().tap();

  await expect(screen.getByRole('heading', { name: 'Bank Accounts', level: 1 })).toBeVisible();
  await expect(screen.getByText('Settings', { exact: true })).toBeVisible();
  await expect(screen.getByText('1 account at BPI.')).toBeVisible();
  const accounts = screen.getByRole('table', 'Bank accounts');

  await expect(accounts.getByRole('row')).toHaveCount(2);
  await expect(accounts.getByRole('row', /^B-001 BPI — Alpha Premier Group of Companies OPC 4011 0258 68/)).toBeVisible();
});

test('adds an account, and a statement picks it under Pay into and prints it', async ({ app, screen }) => {
  await app.open('/#banks');
  await addBdo(screen);

  await expect(screen.getByRole('table', 'Bank accounts').getByRole('row', /^B-002 BDO Ortigas Center Alpha Premier Group of Companies OPC 0012 3456 7890/)).toBeVisible();
  await expect(screen.getByText('2 accounts at BPI and BDO.')).toBeVisible();

  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  // A new statement names the company account, so that is the one Pay into shows.
  await expect(form.getByRole('combobox', 'Pay into')).toHaveText('BPI · 4011 0258 68');
  await form.getByRole('combobox', 'Pay into').tap();
  await screen.getByRole('option', 'BDO · 0012 3456 7890').tap();

  await expect(form.getByRole('combobox', 'Pay into')).toHaveText('BDO · 0012 3456 7890');
  await expect(form.getByRole('textbox', 'Payment instructions')).toHaveValue(INSTRUCTIONS);
  await expect(paper.getByText('Account Number: 0012 3456 7890', { exact: false })).toBeVisible();
  await expect(paper.getByText('Bank: BDO, Ortigas Center', { exact: false })).toBeVisible();
  await expect(paper.getByText('Account Number: 4011 0258 68', { exact: false })).toBeHidden();
});

test('edits an account from its row, under the same number', async ({ app, screen }) => {
  await app.open('/#banks');
  const row = screen.getByRole('table', 'Bank accounts').getByRole('row', /^B-001 /);

  await row.tap();
  const dialog = screen.getByRole('dialog', 'Edit B-001');

  await expect(dialog.getByText('Keeps B-001.')).toBeVisible();
  await expect(dialog.getByRole('textbox', 'Bank')).toHaveValue('BPI');
  await expect(dialog.getByRole('textbox', 'Account number')).toHaveValue('4011 0258 68');
  await dialog.getByRole('textbox', 'Branch').fill('Tektite Tower');
  await dialog.getByRole('button', 'Save changes').tap();

  await expect(screen.getByRole('dialog', 'B-001 updated.')).toBeVisible();
  await expect(row).toHaveAccessibleName(/^B-001 BPI Tektite Tower Alpha Premier Group of Companies OPC 4011 0258 68/);
  await expect(screen.getByRole('table', 'Bank accounts').getByRole('row')).toHaveCount(2);

  // The row menu opens the same dialog.
  await row.getByRole('button', 'Actions for B-001').tap();
  await screen.getByRole('menuitem', 'Edit…').tap();
  await expect(screen.getByRole('dialog', 'Edit B-001').getByRole('textbox', 'Branch')).toHaveValue('Tektite Tower');
});

test('needs the bank, the account name and the number, and refuses a number already in use', async ({ app, screen }) => {
  await app.open('/#banks');
  await screen.getByRole('button', 'Add account').tap();
  const dialog = screen.getByRole('dialog', 'Add account');
  const add = dialog.getByRole('button', 'Add account');

  await add.tap();
  await expect(dialog.getByRole('alert')).toHaveText('Enter the bank.');

  await dialog.getByRole('textbox', 'Bank').fill('Metrobank');
  await add.tap();
  await expect(dialog.getByRole('alert')).toHaveText('Enter the account name.');

  await dialog.getByRole('textbox', 'Account name').fill('Alpha Premier Group of Companies OPC');
  await add.tap();
  await expect(dialog.getByRole('alert')).toHaveText('Enter the account number.');

  // The same number written with dashes is still the same account.
  await dialog.getByRole('textbox', 'Account number').fill('4011-0258-68');
  await add.tap();
  await expect(dialog.getByRole('alert')).toHaveText('Account number 4011-0258-68 is already saved as B-001 (BPI, Alpha Premier Group of Companies OPC).');

  await dialog.getByRole('button', 'Cancel').tap();
  await expect(dialog).toBeHidden();
  await expect(screen.getByRole('table', 'Bank accounts').getByRole('row')).toHaveCount(2);
});

test('removes an account after asking, and offers to add one when none is left', async ({ app, screen }) => {
  await app.open('/#banks');
  const accounts = screen.getByRole('table', 'Bank accounts');

  await accounts.getByRole('button', 'Actions for B-001').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  const confirm = screen.getByRole('alertdialog', 'Remove B-001?');

  await expect(confirm.getByText('BPI · 4011 0258 68, in the name of Alpha Premier Group of Companies OPC, is removed from Bank Accounts. Statements already issued keep the payment instructions written on them.')).toBeVisible();
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(accounts.getByRole('row', /^B-001 /)).toBeVisible();

  await accounts.getByRole('button', 'Actions for B-001').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  await confirm.getByRole('button', 'Remove account').tap();

  await expect(screen.getByRole('dialog', 'B-001 removed.')).toBeVisible();
  await expect(accounts.getByRole('row', /^B-001 /)).toBeHidden();
  await expect(screen.getByText('No bank accounts are kept yet.')).toBeVisible();
  await expect(screen.getByText('No bank accounts yet.')).toBeVisible();

  // With no account to pick, a statement's payment instructions are typed, and the form says where to add one.
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await expect(form.getByRole('combobox', 'Pay into')).toBeHidden();
  await expect(form.getByText('No bank accounts are kept yet, so the payment instructions are typed below.')).toBeVisible();
  await form.getByRole('button', 'Add a bank account').tap();
  await expect(screen.getByRole('heading', { name: 'Bank Accounts', level: 1 })).toBeVisible();

  await screen.getByRole('button', 'Add one').tap();
  await expect(screen.getByRole('dialog', 'Add account').getByText('Gets B-001.')).toBeVisible();
});

test('logs each account added, edited and removed under the Bank Accounts filter', async ({ app, screen }) => {
  await app.open('/#banks');
  await addBdo(screen);
  const accounts = screen.getByRole('table', 'Bank accounts');

  await accounts.getByRole('row', /^B-001 /).tap();
  await screen.getByRole('dialog', 'Edit B-001').getByRole('textbox', 'Branch').fill('Tektite Tower');
  await screen.getByRole('dialog', 'Edit B-001').getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'B-001 updated.')).toBeVisible();

  await accounts.getByRole('button', 'Actions for B-002').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  await screen.getByRole('alertdialog', 'Remove B-002?').getByRole('button', 'Remove account').tap();
  await expect(accounts.getByRole('row', /^B-002 /)).toBeHidden();

  await app.open('/#activity');
  const entries = await banksLog(screen);

  // Three entries, newest first, each under its own tag; nothing else in the sample data is a bank entry.
  await expect(entries).toHaveCount(3);
  await expect(entries).toContainText([
    'BANK B-002 BDO · 0012 3456 7890 removed.',
    'BANK B-001 BPI · 4011 0258 68 updated.',
    'BANK B-002 BDO · 0012 3456 7890 added, in the name of Alpha Premier Group of Companies OPC.',
  ]);
});

test('keeps saved accounts after a reload', async ({ app, screen, browser }) => {
  await app.open('/#banks');
  await addBdo(screen);

  await browser.reload();

  const accounts = screen.getByRole('table', 'Bank accounts');

  await expect(accounts.getByRole('row')).toHaveCount(3);
  await expect(accounts.getByRole('row', /^B-002 BDO Ortigas Center /)).toBeVisible();
});
