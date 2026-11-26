import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { faintPaperText, markedPaperParts, paperLayoutWithAndWithoutMark, tinyPaperText } from '../support/paper';

// Requests for Funds (packages/modules/funds, docs/adr/0011, 0021). This suite runs the build that keeps its records on
// the computer, where nobody signs in: requests are filed, edited and withdrawn here, and never decided. The CEO's
// decision, the fund transfer request it makes and the voucher it drafts are tested in the cloud suite
// (e2e/cloud/funds.e2e.ts). The sample data has no requests; payees come from the directory, vendors first. A first
// request is paid by transfer.

const OWNER_ONLY = 'Only the CEO approves or declines requests, signed in to APG\'s records in the cloud. This copy of Keystone keeps its records on this computer, where nobody signs in.';

/** Fills in a request paid by check, with one expense, and sends it; `by` settles it by a date instead of ASAP. */
async function ask(screen: Screen, request: { purpose: string; expense: string; amount: string; payee: string; name: string; by?: string }) {
  // The form is on its own tab, beside the requests.
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill(request.purpose);
  await form.getByRole('combobox', 'Line 1 description').fill(request.expense);
  await form.getByRole('textbox', 'Line 1 amount').fill(request.amount);
  await form.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await form.getByRole('combobox', 'Payee').tap();
  await screen.getByRole('option', request.payee).tap();

  if (request.by) {
    await form.getByRole('combobox', 'Deadline').tap();
    await screen.getByRole('option', 'By a date').tap();
    await form.getByRole('textbox', 'Deadline date').fill(request.by);
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
  await screen.getByRole('tab', /^(Your requests|Requests)/).tap();
  const register = screen.getByRole('table', 'Requests for funds');

  await expect(register.getByRole('row', /^RF-2026-0001 Nov 2, 2026 Christmas party: venue deposit Check Ana Cruz ₱48,000\.00 ASAP Pending Pending/)).toBeVisible();
  await expect(screen.getByText('Ana Cruz asks for ₱48,000.00 ASAP; it waits for the CEO\'s decision.')).toBeVisible();

  // Nobody here can decide it: there is nothing to approve or decline.
  await expect(screen.getByRole('region', 'Waiting for your decision')).toBeHidden();
  await expect(screen.getByRole('button', 'Approve')).toBeHidden();

  // The form is blank again, for the next request.
  await screen.getByRole('tab', /^Request entry/).tap();
  await expect(screen.getByRole('form', 'New request').getByRole('textbox', 'What it is for')).toHaveValue('');
});

test('refuses a request it cannot act on, and says why', async ({ app, screen }) => {
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Say what the money is for.');
  // Each refusal marks the field it is about and gives it the focus; typing in it clears the mark.
  const purpose = form.getByRole('textbox', 'What it is for');

  await expect(purpose).toHaveAttribute('aria-invalid', 'true');
  await expect(purpose).toBeFocused();
  await purpose.fill('Replacement laptop charger');
  await expect(purpose).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('List the expenses, each with its amount.');
  await expect(form.getByRole('combobox', 'Line 1 description')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('combobox', 'Line 1 description')).toBeFocused();

  await form.getByRole('combobox', 'Line 1 description').fill('Laptop charger');
  await expect(form.getByRole('combobox', 'Line 1 description')).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the amount for line 1, Laptop charger.');
  await expect(form.getByRole('textbox', 'Line 1 amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('textbox', 'Line 1 amount')).toBeFocused();

  await form.getByRole('textbox', 'Line 1 amount').fill('2,450.50');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the bank of the account to transfer to.');
  await expect(form.getByRole('textbox', 'Line 1 amount')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('textbox', 'Bank')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('textbox', 'Bank')).toBeFocused();

  await form.getByRole('textbox', 'Bank').fill('BPI');
  await form.getByRole('textbox', 'Account name').fill('Paolo Santos');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the account number to transfer to.');
  await expect(form.getByRole('textbox', 'Account number')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('textbox', 'Account number')).toBeFocused();
  await expect(form.getByRole('textbox', 'Bank')).not.toHaveAttribute('aria-invalid', 'true');

  await form.getByRole('textbox', 'Account number').fill('4011 0258 68');
  await expect(form.getByRole('textbox', 'Account number')).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('combobox', 'Deadline').tap();
  await screen.getByRole('option', 'By a date').tap();
  await form.getByRole('textbox', 'Deadline date').fill('2026-10-30');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Oct 30, 2026 has passed. Choose a later date, or ASAP.');
  await expect(form.getByRole('textbox', 'Deadline date')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('textbox', 'Deadline date')).toBeFocused();

  await form.getByRole('textbox', 'Deadline date').fill('2026-11-20');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter your name, so the CEO knows who is asking.');
  await expect(form.getByRole('textbox', 'Requested by')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByRole('textbox', 'Requested by')).toBeFocused();

  await form.getByRole('textbox', 'Requested by').fill('Paolo Santos');
  await expect(form.getByRole('textbox', 'Requested by')).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('button', 'Send for approval').tap();
  await screen.getByRole('tab', /^(Your requests|Requests)/).tap();
  await expect(screen.getByRole('table', 'Requests for funds').getByRole('row', /^RF-2026-0001 .* Bank transfer Paolo Santos ₱2,450\.50 Nov 20, 2026 Pending/)).toBeVisible();
});

test('lists the expenses to be paid back by transfer, and previews the fund transfer request the CEO\'s approval makes', async ({ app, screen, browser }) => {
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill('Revolving fund, Nov 1 to 15');
  await form.getByRole('combobox', 'Line 1 description').fill('Pantry groceries');
  await form.getByRole('textbox', 'Line 1 amount').fill('3,250.75');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('combobox', 'Line 2 description').fill('Courier for payroll documents');
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
  // Three sign it: who asked, who checks (Company Details' checker until another is picked), and the CEO.
  await expect(paper).toContainText(/Ana Cruz\s*Requested by\s*Accounting\s*Checked by\s*Approved by/i);
  await expect(form.getByRole('button', 'Export PDF')).toBeHidden();
  // Money is signed for by hand: e-signatures print only when ticked, and the choice is kept (docs/adr/0051).
  const eSign = form.getByRole('checkbox', 'Show e-signatures on the fund transfer request (leave unticked to sign by hand)');

  await expect(eSign).not.toBeChecked();
  await eSign.tap();
  await expect(eSign).toBeChecked();
  await eSign.tap();
  expect(await tinyPaperText(browser)).toEqual([]);
  expect(await faintPaperText(browser)).toEqual([]);

  await form.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
  await screen.getByRole('tab', /^(Your requests|Requests)/).tap();
  await expect(screen.getByRole('table', 'Requests for funds').getByRole('row', /^RF-2026-0001 .* Revolving fund, Nov 1 to 15 Bank transfer Ana Cruz ₱3,730\.75 ASAP Pending/)).toBeVisible();

  // The next request starts with the same account: the fund is topped up into it each time.
  await screen.getByRole('tab', /^Request entry/).tap();
  const next = screen.getByRole('form', 'New request');

  await expect(next.getByRole('textbox', 'Account number')).toHaveValue('0012 3456 7890');
  await expect(next.getByRole('textbox', 'Account name')).toHaveValue('Liza Ramos');
  await expect(next.getByRole('combobox', 'Line 1 description')).toHaveValue('');
});

test('changes a request while it waits, then withdraws it, and it stays on record', async ({ app, screen }) => {
  await app.open('/#funds');
  await ask(screen, party);
  await screen.getByRole('tab', /^(Your requests|Requests)/).tap();
  const register = screen.getByRole('table', 'Requests for funds');

  await register.getByRole('cell', 'RF-2026-0001').tap();
  // It opens on the form's tab, which names it.
  await expect(screen.getByRole('tab', /^Request entry/)).toHaveText(/RF-2026-0001/);
  const form = screen.getByRole('form', 'Editing RF-2026-0001');

  await expect(form.getByRole('textbox', 'Line 1 amount')).toHaveValue('48000');
  await form.getByRole('textbox', 'Line 1 amount').fill('45000');
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 updated.')).toBeVisible();
  await screen.getByRole('tab', /^(Your requests|Requests)/).tap();
  await expect(register.getByRole('row', /^RF-2026-0001 .* ₱45,000\.00 ASAP Pending/)).toBeVisible();

  await register.getByRole('button', 'Actions for RF-2026-0001').tap();
  await screen.getByRole('menuitem', 'Withdraw…').tap();
  await screen.getByRole('alertdialog', 'Withdraw RF-2026-0001?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Withdraw RF-2026-0001?').getByRole('button', 'Withdraw').tap();

  await expect(register.getByRole('row', /^RF-2026-0001 /).getByRole('cell', 'Withdrawn')).toBeVisible();
  // Withdrawn, it will never be paid: its payment status is a dash.
  await expect(register.getByRole('row', /^RF-2026-0001 .* Withdrawn —/)).toBeVisible();
  await expect(screen.getByText('No request is waiting. Ask for funds here, and the CEO approves or declines.')).toBeVisible();

  // A withdrawn request opens read-only.
  await register.getByRole('cell', 'RF-2026-0001').tap();
  const viewing = screen.getByRole('form', 'Viewing RF-2026-0001');

  await expect(viewing.getByText('RF-2026-0001 is withdrawn and can no longer be changed.')).toBeVisible();
  await expect(viewing.getByRole('textbox', 'Line 1 amount')).toBeDisabled();
  await expect(viewing.getByRole('button', 'Save changes')).toBeHidden();
  await screen.getByRole('tab', /^(Your requests|Requests)/).tap();
  await register.getByRole('button', 'Actions for RF-2026-0001').tap();
  await expect(screen.getByRole('menuitem', 'Withdraw…')).toBeDisabled();

  // Withdrawn, it no longer waits: Home's tile counts none.
  await app.open('/');
  await expect(screen.getByRole('main').getByRole('list').first().getByRole('button', /^Requests for Funds .* Waiting for a decision 0$/)).toBeVisible();
});

test('deletes a request, or several ticked together, and never gives a deleted number out again', async ({ app, screen }) => {
  await app.open('/#funds');
  await ask(screen, party);
  await ask(screen, { ...party, purpose: 'Christmas party: sound system', expense: 'Sound system', amount: '12000' });
  await ask(screen, { ...party, purpose: 'Christmas party: catering', expense: 'Catering', amount: '30000' });
  await screen.getByRole('tab', /^Requests/).tap();
  const register = screen.getByRole('table', 'Requests for funds');

  // One from its row's menu, asked first.
  await register.getByRole('button', 'Actions for RF-2026-0002').tap();
  await screen.getByRole('menuitem', 'Delete…').tap();
  const one = screen.getByRole('alertdialog', 'Delete RF-2026-0002?');

  await expect(one).toContainText('removed from the register for everyone, with any receipts');
  await one.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await one.getByRole('button', 'Delete').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 deleted.')).toBeVisible();
  await expect(register.getByRole('row', /^RF-2026-0002 /)).toHaveCount(0);

  // The others, ticked together.
  await register.getByRole('checkbox', 'Select RF-2026-0001').tap();
  await register.getByRole('checkbox', 'Select RF-2026-0003').tap();
  await screen.getByRole('toolbar', 'Requests for funds: selected').getByRole('button', 'Delete (2)…').tap();
  const both = screen.getByRole('alertdialog', 'Delete 2 requests?');

  await both.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await both.getByRole('button', 'Delete').tap();
  await expect(screen.getByText('No requests yet.')).toBeVisible();

  // The next request takes a new number, and the log says who deleted them.
  await ask(screen, party);
  await expect(screen.getByRole('dialog', 'RF-2026-0004 sent to the CEO for approval.')).toBeVisible();
  await app.open('/#activity');
  await expect(screen.getByText('RF-2026-0002 deleted by someone on this computer.')).toBeVisible();
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

  await waiting.getByRole('button', 'RF-2026-0001 Paolo Santos · by Nov 20, 2026 ₱2,450.50 Pending').tap();
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

// Save draft (docs/adr/0041): a request's work kept to whoever wrote it, listed under Drafts above their requests.
// Nothing is sent to the CEO until it is sent for approval; then the draft is finished and leaves the list.
test('saves a draft of a request, opens it again, and takes it away once it is sent for approval', async ({ app, screen }) => {
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill('Pantry, November');
  await form.getByRole('combobox', 'Line 1 description').fill('Coffee and sugar');
  await form.getByRole('textbox', 'Line 1 amount').fill('1550.50');
  await form.getByRole('button', 'Save draft').tap();
  await expect(screen.getByRole('dialog', 'Draft saved. Open it again from Drafts.')).toBeVisible();
  await expect(screen.getByText('No request is waiting. Ask for funds here, and the CEO approves or declines.')).toBeVisible();

  await screen.getByRole('tab', /^Requests/).tap();
  const draft = screen.getByRole('list', 'Drafts').getByRole('listitem', 'Pantry, November · ₱1,550.50');

  await draft.getByRole('button', 'Open').tap();
  await expect(screen.getByRole('tab', /^Request entry/)).toHaveAttribute('aria-selected', 'true');
  const opened = screen.getByRole('form', 'New request');

  await expect(opened.getByRole('textbox', 'What it is for')).toHaveValue('Pantry, November');
  await expect(opened.getByRole('textbox', 'Line 1 amount')).toHaveValue('1550.50');
  await opened.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await opened.getByRole('combobox', 'Payee').tap();
  await screen.getByRole('option', 'Manila Water Company (V-002)').tap();
  await opened.getByRole('textbox', 'Requested by').fill('Ana Cruz');
  await opened.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
  await screen.getByRole('tab', /^Requests/).tap();
  await expect(screen.getByRole('list', 'Drafts')).toBeHidden();
});

test('marks on the fund transfer request where the field being typed in prints, and moves nothing', async ({ app, screen, browser }) => {
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill('Christmas party: venue deposit');
  expect(await markedPaperParts(browser)).toEqual(['Christmas party: venue deposit · solid 2px']);
  const layout = await paperLayoutWithAndWithoutMark(browser);

  expect(layout.marked).toEqual(layout.unmarked);

  // The expenses fill the amount box and the list under it.
  await form.getByRole('combobox', 'Line 1 description').fill('Venue deposit');
  await form.getByRole('textbox', 'Line 1 amount').fill('48000');
  expect(await markedPaperParts(browser)).toEqual([
    'AMOUNT ₱48,000.00 Forty-Eight Thousand Pesos Only · solid 2px',
    'EXPENSE AMOUNT Venue deposit ₱48,000.00 TOTAL ₱48,000.00 · solid 2px',
  ]);

  await form.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  expect(await markedPaperParts(browser)).toEqual(['0012 3456 7890 · solid 2px']);

  // Who asks prints twice: beside Requested by, and over their line.
  await form.getByRole('textbox', 'Requested by').fill('Ana Cruz');
  expect(await markedPaperParts(browser)).toEqual(['Ana Cruz · solid 2px', 'Ana Cruz REQUESTED BY · solid 2px']);

  await screen.getByRole('heading', { name: 'Requests for Funds', level: 1 }).tap();
  expect(await markedPaperParts(browser)).toEqual([]);
});
