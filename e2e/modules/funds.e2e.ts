import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { faintPaperText, tinyPaperText } from '../support/paper';

// Requests for Funds (packages/modules/funds, docs/adr/0011, 0021). This suite runs the build that keeps its records on
// the computer, where nobody signs in: requests are filed, edited and withdrawn here, and never decided. The CEO's
// decision, the fund transfer request it makes and the voucher it drafts are tested in the cloud suite
// (e2e/cloud/funds.e2e.ts). The sample data has no requests; payees come from the directory, vendors first. A first
// request is paid by transfer.

const OWNER_ONLY = 'Only the CEO approves or declines requests, signed in to APG\'s records in the cloud. This copy of Keystone keeps its records on this computer, where nobody signs in.';

/** Fills in a request paid by check, with one expense, and sends it; `by` settles it by a date instead of ASAP. */
async function ask(screen: Screen, request: { purpose: string; expense: string; amount: string; payee: string; name: string; by?: string }) {
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill(request.purpose);
  await form.getByRole('textbox', 'Line 1 description').fill(request.expense);
  await form.getByRole('textbox', 'Line 1 amount').fill(request.amount);
  await form.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await form.getByRole('combobox', 'Payee').tap();
  await screen.getByRole('option', request.payee).tap();

  if (request.by) {
    await form.getByRole('combobox', 'Settle').tap();
    await screen.getByRole('option', 'By a date').tap();
    await form.getByRole('textbox', 'Settle by').fill(request.by);
  }

  await form.getByRole('textbox', 'Requested by').fill(request.name);
  await form.getByRole('button', 'Send for approval').tap();
}

const party = { purpose: 'Christmas party: venue deposit', expense: 'Venue deposit', amount: '48000', payee: 'Manila Water Company (V-002)', name: 'Ana Cruz' };

test('asks for funds, and the request waits for the CEO, who decides it signed in', async ({ app, screen }) => {
  await app.open('/#funds');

  await expect(screen.getByRole('heading', { name: 'Requests for Funds', level: 1 })).toBeVisible();
  await expect(screen.getByText('No request is waiting. Ask for funds here, and the CEO approves or declines.')).toBeVisible();
  await expect(screen.getByText(OWNER_ONLY)).toBeVisible();

  await ask(screen, party);

  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
  const register = screen.getByRole('table', 'Requests for funds');

  await expect(register.getByRole('row', /^RF-2026-0001 Nov 2, 2026 Christmas party: venue deposit Check Ana Cruz ₱48,000\.00 ASAP For Approval/)).toBeVisible();
  await expect(screen.getByText('Ana Cruz asks for ₱48,000.00 ASAP; it waits for the CEO\'s decision.')).toBeVisible();

  // Nobody here can decide it: there is nothing to approve or decline.
  await expect(screen.getByRole('region', 'Waiting for your decision')).toBeHidden();
  await expect(screen.getByRole('button', 'Approve')).toBeHidden();

  // The form is blank again, for the next request.
  await expect(screen.getByRole('form', 'New request').getByRole('textbox', 'What it is for')).toHaveValue('');
});

test('refuses a request it cannot act on, and says why', async ({ app, screen }) => {
  await app.open('/#funds');
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Say what the money is for.');

  await form.getByRole('textbox', 'What it is for').fill('Replacement laptop charger');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('List the expenses, each with its amount.');

  await form.getByRole('textbox', 'Line 1 description').fill('Laptop charger');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the amount for line 1, Laptop charger.');

  await form.getByRole('textbox', 'Line 1 amount').fill('2,450.50');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the bank of the account to transfer to.');

  await form.getByRole('textbox', 'Bank').fill('BPI');
  await form.getByRole('textbox', 'Account name').fill('Paolo Santos');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the account number to transfer to.');

  await form.getByRole('textbox', 'Account number').fill('4011 0258 68');
  await form.getByRole('combobox', 'Settle').tap();
  await screen.getByRole('option', 'By a date').tap();
  await form.getByRole('textbox', 'Settle by').fill('2026-10-30');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Oct 30, 2026 has passed. Choose a later date, or ASAP.');

  await form.getByRole('textbox', 'Settle by').fill('2026-11-20');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter your name, so the CEO knows who is asking.');

  await form.getByRole('textbox', 'Requested by').fill('Paolo Santos');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('table', 'Requests for funds').getByRole('row', /^RF-2026-0001 .* Bank transfer Paolo Santos ₱2,450\.50 Nov 20, 2026 For Approval/)).toBeVisible();
});

test('lists the expenses to be paid back by transfer, and previews the fund transfer request the CEO\'s approval makes', async ({ app, screen, browser }) => {
  await app.open('/#funds');
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill('Revolving fund, Nov 1 to 15');
  await form.getByRole('textbox', 'Line 1 description').fill('Pantry groceries');
  await form.getByRole('textbox', 'Line 1 amount').fill('3,250.75');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier for payroll documents');
  await form.getByRole('textbox', 'Line 2 amount').fill('480');
  await expect(form.getByText('Total ₱3,730.75')).toBeVisible();

  await expect(form.getByRole('combobox', 'Paid by')).toHaveText('Bank transfer');
  await form.getByRole('textbox', 'Bank').fill('BDO');
  await form.getByRole('textbox', 'Branch').fill('Makati Ayala');
  await form.getByRole('textbox', 'Account name').fill('Liza Ramos');
  await form.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await form.getByRole('textbox', 'Requested by').fill('Ana Cruz');

  // The paper shows as it will print, marked as not approved yet, and there is nothing to print or save until it is.
  const paper = screen.getByRole('article', 'Fund transfer request RF-2026-0001');

  await expect(paper).toContainText('ACCOUNT NO. 0012 3456 7890');
  await expect(paper).toContainText('Pantry groceries ₱3,250.75');
  await expect(paper).toContainText('Courier for payroll documents ₱480.00');
  await expect(paper).toContainText('Three Thousand Seven Hundred Thirty Pesos and 75/100 Only');
  await expect(paper).toContainText('Not approved yet: this request waits for the CEO\'s decision.');
  await expect(form.getByRole('button', 'Export PDF')).toBeHidden();
  expect(await tinyPaperText(browser)).toEqual([]);
  expect(await faintPaperText(browser)).toEqual([]);

  await form.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
  await expect(screen.getByRole('table', 'Requests for funds').getByRole('row', /^RF-2026-0001 .* Revolving fund, Nov 1 to 15 Bank transfer Ana Cruz ₱3,730\.75 ASAP For Approval/)).toBeVisible();

  // The next request starts with the same account: the fund is topped up into it each time.
  const next = screen.getByRole('form', 'New request');

  await expect(next.getByRole('textbox', 'Account number')).toHaveValue('0012 3456 7890');
  await expect(next.getByRole('textbox', 'Account name')).toHaveValue('Liza Ramos');
  await expect(next.getByRole('textbox', 'Line 1 description')).toHaveValue('');
});

test('changes a request while it waits, then withdraws it, and it stays on record', async ({ app, screen }) => {
  await app.open('/#funds');
  await ask(screen, party);
  const register = screen.getByRole('table', 'Requests for funds');

  await register.getByRole('cell', 'RF-2026-0001').tap();
  const form = screen.getByRole('form', 'Editing RF-2026-0001');

  await expect(form.getByRole('textbox', 'Line 1 amount')).toHaveValue('48000');
  await form.getByRole('textbox', 'Line 1 amount').fill('45000');
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 updated.')).toBeVisible();
  await expect(register.getByRole('row', /^RF-2026-0001 .* ₱45,000\.00 ASAP For Approval/)).toBeVisible();

  await register.getByRole('button', 'Actions for RF-2026-0001').tap();
  await screen.getByRole('menuitem', 'Withdraw…').tap();
  await screen.getByRole('alertdialog', 'Withdraw RF-2026-0001?').getByRole('button', 'Withdraw').tap();

  await expect(register.getByRole('row', /^RF-2026-0001 /).getByRole('cell', 'Withdrawn')).toBeVisible();
  await expect(screen.getByText('No request is waiting. Ask for funds here, and the CEO approves or declines.')).toBeVisible();

  // A withdrawn request opens read-only.
  await register.getByRole('cell', 'RF-2026-0001').tap();
  const viewing = screen.getByRole('form', 'Viewing RF-2026-0001');

  await expect(viewing.getByText('RF-2026-0001 is withdrawn and can no longer be changed.')).toBeVisible();
  await expect(viewing.getByRole('textbox', 'Line 1 amount')).toBeDisabled();
  await expect(viewing.getByRole('button', 'Save changes')).toBeHidden();
  await register.getByRole('button', 'Actions for RF-2026-0001').tap();
  await expect(screen.getByRole('menuitem', 'Withdraw…')).toBeDisabled();
});

test('shows a waiting request on Home and Overview, opens it from there, and logs it', async ({ app, screen }) => {
  await app.open('/#funds');
  await ask(screen, { ...party, purpose: 'Replacement laptop charger', expense: 'Laptop charger', amount: '2450.50', name: 'Paolo Santos', by: '2026-11-20' });
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('main').getByRole('list').first().getByRole('button', /^Requests for Funds .* Waiting for a decision 1$/)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '₱2,450.50 waiting for a decision' })).toBeVisible();
  const waiting = screen.getByRole('region', 'Waiting on you');

  await waiting.getByRole('button', 'RF-2026-0001 Paolo Santos · by Nov 20, 2026 ₱2,450.50 For Approval').tap();
  await expect(screen.getByRole('heading', { name: 'Requests for Funds', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'Editing RF-2026-0001')).toBeVisible();

  await app.open('/#overview');
  await screen.getByRole('button', 'New request for funds').tap();
  await expect(screen.getByRole('form', 'New request')).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Requests for funds').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(1);
  // The log, which everyone reads, names who asked but not what for or how much.
  await expect(entries.first()).toContainText('RF RF-2026-0001 filed by Paolo Santos.');
});
