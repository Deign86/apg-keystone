import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile } from 'node:fs/promises';
import { faintPaperText, tinyPaperText } from '../support/paper';

// Billing Statements (packages/modules/billing). The sample data has 010097-2026 paid, 010098-2026 overdue (due Oct 10)
// and 010099-2026 sent (due Nov 5), so a new statement is 010100-2026. Bill to is typed; a directory client's name brings
// its setup. Novatek (C-001) is a VAT client that withholds EWT, 2% on a new statement (the sample's, saved before
// statements kept their rate, withheld 5%); Dela Cruz (C-002) is non-VAT.

test('issues a statement with VAT and withholding from the client', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await expect(form.getByRole('textbox', 'Invoice No.')).toHaveValue('010100-2026');
  await expect(form.getByRole('textbox', 'Bill to')).toHaveValue('');
  await expect(form.getByRole('checkbox', 'Add 12% VAT')).not.toBeChecked();
  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await expect(form.getByRole('textbox', 'Attention')).toHaveValue('Carlo Mendiola');
  await expect(form.getByRole('checkbox', 'Add 12% VAT')).toBeChecked();
  await expect(form.getByRole('checkbox', 'Less 2% expanded withholding tax')).toBeChecked();

  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 quantity').fill('2');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');

  // 2 × ₱10,000 = ₱20,000; VAT 12% adds ₱2,400; EWT 2% takes ₱400 off.
  await expect(form.getByText('Subtotal ₱20,000.00 · VAT ₱2,400.00 · EWT (₱400.00)')).toBeVisible();
  await expect(form.getByText('₱22,000.00')).toBeVisible();
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');
  const totals = paper.getByRole('table', 'Totals');

  // The statement prints twice, a copy on each half of the sheet; the first copy is enough.
  await expect(paper.getByText('Novatek BPO Solutions Inc.', { exact: true }).first()).toBeVisible();
  await expect(totals.getByRole('row', 'Subtotal ₱20,000.00').first()).toBeVisible();
  await expect(totals.getByRole('row', 'VAT (12%) ₱2,400.00').first()).toBeVisible();
  await expect(totals.getByRole('row', 'Less: EWT (2%) (₱400.00)').first()).toBeVisible();
  await expect(totals.getByRole('row', 'Total amount due ₱22,000.00').first()).toBeVisible();

  // A rental withholds 5% instead: ₱1,000 off, so ₱21,400 is due.
  await form.getByRole('combobox', 'EWT rate').tap();
  await screen.getByRole('option', '5%').tap();
  await expect(form.getByRole('checkbox', 'Less 5% expanded withholding tax')).toBeChecked();
  await expect(totals.getByRole('row', 'Less: EWT (5%) (₱1,000.00)').first()).toBeVisible();
  await expect(totals.getByRole('row', 'Total amount due ₱21,400.00').first()).toBeVisible();
  await form.getByRole('combobox', 'EWT rate').tap();
  await screen.getByRole('option', '2%').tap();

  await form.getByRole('button', 'Save and mark as sent').tap();

  const register = screen.getByRole('table', 'Statements issued');

  await expect(register.getByRole('row', /^010100-2026 Novatek BPO Solutions Inc\. Nov 2, 2026 Nov 17, 2026 ₱22,000\.00 Sent/)).toBeVisible();
  await expect(form.getByRole('textbox', 'Invoice No.')).toHaveValue('010101-2026');
});

test('a non-VAT client gets no VAT and no withholding', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('Dela Cruz, Maria Teresa');

  await expect(form.getByRole('checkbox', 'Add 12% VAT')).not.toBeChecked();
  await expect(form.getByRole('checkbox', 'Less 2% expanded withholding tax')).not.toBeChecked();

  await form.getByRole('textbox', 'Line 1 description').fill('Unit rental, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('45500');

  // No VAT or withholding on the form; the printed statement's totals box shows a dash on both lines.
  await expect(form.getByText('Subtotal ₱45,500.00')).toBeVisible();
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  await expect(paper.getByRole('row', 'Total amount due ₱45,500.00').first()).toBeVisible();
  await expect(paper.getByRole('row', 'VAT (12%) —').first()).toBeVisible();
  await expect(paper.getByRole('row', 'Less: EWT (2%) —').first()).toBeVisible();
  await expect(paper.getByRole('row', 'Qty Description Unit price Amount').first()).toBeVisible();
});

test('refuses an invoice number already in use and offers the next free one', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Invoice No.').fill('010099-2026');
  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('button', 'Save and mark as sent').tap();

  await expect(form.getByRole('alert')).toHaveText('Invoice No. 010099-2026 is already used. The next free one is 010100-2026.');
});

test('refuses a statement with no charges', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('button', 'Save and mark as sent').tap();

  await expect(form.getByRole('alert')).toHaveText('Add at least one charge with an amount.');
});

test('marks a statement paid, and the outstanding total drops', async ({ app, screen }) => {
  await app.open('/#billing');
  await expect(screen.getByText('₱677,627.50 outstanding on 2 statements, 1 overdue.')).toBeVisible();
  const row = screen.getByRole('table', 'Statements issued').getByRole('row', /^010099-2026 /);

  await row.getByRole('button', 'Actions for 010099-2026').tap();
  await screen.getByRole('menuitem', 'Mark paid').tap();

  await expect(row.getByRole('cell', 'Paid')).toBeVisible();
  await expect(screen.getByText('₱91,000.00 outstanding on 1 statement, 1 overdue.')).toBeVisible();
});

test('asks before voiding a statement', async ({ app, screen }) => {
  await app.open('/#billing');
  const row = screen.getByRole('table', 'Statements issued').getByRole('row', /^010098-2026 /);

  await row.getByRole('button', 'Actions for 010098-2026').tap();
  await screen.getByRole('menuitem', 'Void statement…').tap();
  const confirm = screen.getByRole('alertdialog', 'Void 010098-2026?');

  await expect(confirm.getByText('₱91,000.00 billed to Dela Cruz, Maria Teresa. A void statement stays in the register and cannot be reopened.')).toBeVisible();
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(confirm).toBeHidden();
  await expect(row.getByRole('cell', 'Overdue')).toBeVisible();

  await row.getByRole('button', 'Actions for 010098-2026').tap();
  await screen.getByRole('menuitem', 'Void statement…').tap();
  await confirm.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await confirm.getByRole('button', 'Void statement').tap();

  await expect(row.getByRole('cell', 'Void')).toBeVisible();
});

test('prints the company billing statement with the payment instructions', async ({ app, screen, browser }) => {
  await app.open('/#billing');
  const statement = screen.getByRole('article', 'Billing statement 010100-2026');

  await expect(statement).toBeVisible();
  await expect(statement.getByText('Account Number: 4011 0258 68', { exact: false }).first()).toBeVisible();
  await expect(statement.getByText('5% penalty charge will be applied to delayed monthly payments.').first()).toBeVisible();
  // Its labels included, nothing on it is smaller than 11px or fainter than 4.5:1.
  expect(await tinyPaperText(browser)).toEqual([]);
  expect(await faintPaperText(browser)).toEqual([]);
});

// Pay into lists the company's bank accounts (packages/modules/banks, through the bank-accounts service). The sample
// data has one, BPI · 4011 0258 68, which the default payment instructions name.
test('pays into the account picked under Pay into, and the saved statement keeps it', async ({ app, screen }) => {
  await app.open('/#banks');
  await screen.getByRole('button', 'Add account').tap();
  const dialog = screen.getByRole('dialog', 'Add account');

  await dialog.getByRole('textbox', 'Bank').fill('Security Bank');
  await dialog.getByRole('textbox', 'Account name').fill('Alpha Premier Group of Companies OPC');
  await dialog.getByRole('textbox', 'Account number').fill('0000 0712 3456');
  await dialog.getByRole('button', 'Add account').tap();
  await expect(screen.getByRole('dialog', 'B-002 added.')).toBeVisible();

  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const payInto = form.getByRole('combobox', 'Pay into');

  await expect(payInto).toHaveText('BPI · 4011 0258 68');
  await payInto.tap();
  // The two accounts, then Others… to add one.
  await expect(screen.getByRole('option')).toHaveCount(3);
  await screen.getByRole('option', 'Security Bank · 0000 0712 3456').tap();

  // Only the account lines change; the rest of the instructions stay as they were.
  await expect(form.getByRole('textbox', 'Payment instructions')).toHaveValue([
    'Please make payment to:',
    'Bank: Security Bank',
    'Account Name: Alpha Premier Group of Companies OPC',
    'Account Number: 0000 0712 3456',
    '',
    'Kindly send proof of payment to accounting@alphapremiergroup.com',
  ].join('\n'));
  await expect(screen.getByRole('article', 'Billing statement 010100-2026').getByText('Account Number: 0000 0712 3456', { exact: false }).first()).toBeVisible();

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(screen.getByRole('dialog', '010100-2026 saved and marked as sent.')).toBeVisible();

  // The next statement pays into the account the last one named, as a voucher is drawn on the last voucher's bank.
  await expect(screen.getByRole('form', 'New statement').getByRole('combobox', 'Pay into')).toHaveText('Security Bank · 0000 0712 3456');
  await screen.getByRole('table', 'Statements issued').getByRole('cell', '010100-2026').tap();
  const saved = screen.getByRole('form', 'Editing 010100-2026');

  await expect(saved.getByRole('combobox', 'Pay into')).toHaveText('Security Bank · 0000 0712 3456');
  await expect(screen.getByRole('article', 'Billing statement 010100-2026').getByText('Bank: Security Bank', { exact: false }).first()).toBeVisible();
});

test('Pay into follows payment instructions typed by hand, and picking an account adds its lines', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const payInto = form.getByRole('combobox', 'Pay into');
  const instructions = form.getByRole('textbox', 'Payment instructions');

  // Instructions that name no account on the list leave Pay into empty.
  await instructions.fill('Pay in cash at the front desk.');
  await expect(payInto).toHaveText('—');

  await payInto.tap();
  await screen.getByRole('option', 'BPI · 4011 0258 68').tap();

  await expect(instructions).toHaveValue('Bank: BPI\nAccount Name: Alpha Premier Group of Companies OPC\nAccount Number: 4011 0258 68\n\nPay in cash at the front desk.');
  await expect(payInto).toHaveText('BPI · 4011 0258 68');
});

test('opens a sent statement from the register and saves changes to it', async ({ app, screen }) => {
  await app.open('/#billing');
  const register = screen.getByRole('table', 'Statements issued');

  await register.getByRole('cell', '010099-2026').tap();
  await expect(screen.getByRole('dialog', '010099-2026 loaded into the form.')).toBeVisible();
  const form = screen.getByRole('form', 'Editing 010099-2026');

  await expect(form.getByRole('textbox', 'Invoice No.')).toHaveValue('010099-2026');
  await expect(form.getByRole('textbox', 'Bill to')).toHaveValue('Harbor Point Logistics Corp.');
  await form.getByRole('textbox', 'Due date').fill('2026-11-10');
  await form.getByRole('button', 'Save changes').tap();

  await expect(screen.getByRole('dialog', '010099-2026 updated.')).toBeVisible();
  await expect(register.getByRole('row', /^010099-2026 Harbor Point Logistics Corp\. Oct 25, 2026 Nov 10, 2026 ₱586,627\.50 Sent/)).toBeVisible();
  await expect(register.getByRole('row')).toHaveCount(4);
  await expect(screen.getByRole('form', 'New statement').getByRole('textbox', 'Invoice No.')).toHaveValue('010100-2026');

  await app.open('/#overview');
  await expect(screen.getByRole('region', 'Waiting on you').getByRole('button', '010099-2026 Harbor Point Logistics Corp. · due Nov 10, 2026 ₱586,627.50 Sent')).toBeVisible();

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('010099-2026 for Harbor Point Logistics Corp. edited (₱586,627.50 due Nov 10, 2026).');
});

test('will not change an overdue statement, and saves the edit as a new statement instead', async ({ app, screen }) => {
  await app.open('/#billing');
  const register = screen.getByRole('table', 'Statements issued');

  await register.getByRole('cell', '010098-2026').tap();
  const form = screen.getByRole('form', 'Editing 010098-2026');

  await form.getByRole('textbox', 'Invoice date').fill('2026-11-02');
  await form.getByRole('textbox', 'Due date').fill('2026-11-17');
  await form.getByRole('button', 'Save changes').tap();

  await expect(form.getByRole('alert')).toHaveText('010098-2026 is overdue and can no longer be changed. Save it as a new statement instead.');

  await form.getByRole('button', 'Save as new').tap();

  await expect(screen.getByRole('dialog', '010100-2026 saved and marked as sent.')).toBeVisible();
  await expect(register.getByRole('row', /^010100-2026 Dela Cruz, Maria Teresa Nov 2, 2026 Nov 17, 2026 ₱91,000\.00 Sent/)).toBeVisible();
  await expect(register.getByRole('row', /^010098-2026 Dela Cruz, Maria Teresa Oct 1, 2026 Oct 10, 2026 ₱91,000\.00 Overdue/)).toBeVisible();
  await expect(screen.getByText('₱768,627.50 outstanding on 3 statements, 1 overdue.')).toBeVisible();
});

test('refuses a charge with no quantity, and a due date before the invoice date', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 quantity').fill('0');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('button', 'Save and mark as sent').tap();

  await expect(form.getByRole('alert')).toHaveText('Enter a quantity above zero on every charge.');

  await form.getByRole('textbox', 'Line 1 quantity').fill('1');
  await form.getByRole('textbox', 'Due date').fill('2026-11-01');
  await form.getByRole('button', 'Save and mark as sent').tap();

  await expect(form.getByRole('alert')).toHaveText('The due date is before the invoice date.');
  await expect(screen.getByRole('table', 'Statements issued').getByRole('row', /^010100-2026 /)).toBeHidden();
});

test('marks a statement overdue and back to sent from its row menu, and Home follows', async ({ app, screen }) => {
  await app.open('/#billing');
  const row = screen.getByRole('table', 'Statements issued').getByRole('row', /^010099-2026 /);

  await row.getByRole('button', 'Actions for 010099-2026').tap();
  await screen.getByRole('menuitem', 'Mark overdue').tap();

  await expect(screen.getByRole('dialog', '010099-2026 marked overdue.')).toBeVisible();
  await expect(row.getByRole('cell', 'Overdue')).toBeVisible();
  await expect(screen.getByText('₱677,627.50 outstanding on 2 statements, 2 overdue.')).toBeVisible();

  // The larger of the two overdue statements is the one Home names.
  await app.open('/');
  await expect(screen.getByText('₱586,627.50 from Harbor Point Logistics Corp. has been overdue since Nov 5, 2026. One of 2 overdue statements.')).toBeVisible();

  await app.open('/#billing');
  await row.getByRole('button', 'Actions for 010099-2026').tap();
  await screen.getByRole('menuitem', 'Mark sent').tap();

  await expect(screen.getByRole('dialog', '010099-2026 marked sent.')).toBeVisible();
  await expect(row.getByRole('cell', 'Sent')).toBeVisible();
  await expect(screen.getByText('₱677,627.50 outstanding on 2 statements, 1 overdue.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByText('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.')).toBeVisible();
});

test('unticking VAT or withholding by hand changes the totals', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await expect(form.getByText('Subtotal ₱10,000.00 · VAT ₱1,200.00 · EWT (₱200.00)')).toBeVisible();
  await expect(form.getByText('₱11,000.00')).toBeVisible();

  await form.getByRole('checkbox', 'Less 2% expanded withholding tax').tap();

  await expect(form.getByText('Subtotal ₱10,000.00 · VAT ₱1,200.00')).toBeVisible();
  await expect(form.getByText('₱11,200.00')).toBeVisible();
  await expect(paper.getByRole('row', 'Total amount due ₱11,200.00').first()).toBeVisible();

  await form.getByRole('checkbox', 'Add 12% VAT').tap();

  await expect(form.getByText('Subtotal ₱10,000.00')).toBeVisible();
  await expect(form.getByText('₱10,000.00')).toBeVisible();
  await expect(paper.getByRole('row', 'Total amount due ₱10,000.00').first()).toBeVisible();

  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(screen.getByRole('table', 'Statements issued').getByRole('row', /^010100-2026 Novatek BPO Solutions Inc\. Nov 2, 2026 Nov 17, 2026 ₱10,000\.00 Sent/)).toBeVisible();
});

// Keystone marks statements overdue when it opens (the module's onOpen), not while it runs.
test('a statement past its due date turns overdue the next time Keystone opens', async ({ app, screen, browser }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, October');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('textbox', 'Invoice date').fill('2026-10-01');
  await form.getByRole('textbox', 'Due date').fill('2026-10-20');
  await form.getByRole('button', 'Save and mark as sent').tap();
  const row = screen.getByRole('table', 'Statements issued').getByRole('row', /^010100-2026 /);

  await expect(row).toHaveAccessibleName(/^010100-2026 Novatek BPO Solutions Inc\. Oct 1, 2026 Oct 20, 2026 ₱11,000\.00 Sent/);

  await browser.reload();

  await expect(row.getByRole('cell', 'Overdue')).toBeVisible();
  await expect(screen.getByText('₱688,627.50 outstanding on 3 statements, 2 overdue.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByText('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026. One of 2 overdue statements.')).toBeVisible();

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('010100-2026 marked overdue.');
});

test('paying the overdue statement moves Home and Overview on to the voucher waiting for approval', async ({ app, screen }) => {
  await app.open('/#billing');
  const row = screen.getByRole('table', 'Statements issued').getByRole('row', /^010098-2026 /);

  await row.getByRole('button', 'Actions for 010098-2026').tap();
  await screen.getByRole('menuitem', 'Mark paid').tap();
  await expect(screen.getByRole('dialog', '010098-2026 marked paid.')).toBeVisible();
  await expect(row.getByRole('cell', 'Paid')).toBeVisible();

  await app.open('/');
  await expect(screen.getByText('1 voucher worth ₱35,000.00 waits for approval.')).toBeVisible();
  await expect(screen.getByRole('button', /^Billing Statements .* Outstanding ₱586,627\.50$/)).toBeVisible();

  await app.open('/#overview');
  const waiting = screen.getByRole('region', 'Waiting on you');

  await expect(screen.getByText('1 voucher worth ₱35,000.00 waits for approval.')).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '1 statement open · 0 overdue' })).toBeVisible();
  await expect(waiting.getByRole('listitem')).toHaveCount(3);
  await expect(waiting.getByRole('button', /^010098-2026 /)).toBeHidden();
});

test('exports the statement as a PDF named after its number', async ({ app, screen, browser }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');

  // The toast shows for 3.2 s and the download can finish later, so it is read while the download is awaited. Drawing
  // the statement into a PDF takes several seconds on a busy machine.
  const file = await browser.waitForDownload(async () => {
    await form.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved 010100-2026.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  expect(file.suggestedFilename).toBe('010100-2026.pdf');
  expect((await readFile(file.absolutePath)).subarray(0, 5).toString()).toBe('%PDF-');
});

test('logs each statement sent, paid and voided, under the Billing filter', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const register = screen.getByRole('table', 'Statements issued');

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 quantity').fill('2');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(screen.getByRole('dialog', '010100-2026 saved and marked as sent.')).toBeVisible();

  await register.getByRole('button', 'Actions for 010099-2026').tap();
  await screen.getByRole('menuitem', 'Mark paid').tap();
  await expect(register.getByRole('row', /^010099-2026 /).getByRole('cell', 'Paid')).toBeVisible();

  await register.getByRole('button', 'Actions for 010098-2026').tap();
  await screen.getByRole('menuitem', 'Void statement…').tap();
  await screen.getByRole('alertdialog', 'Void 010098-2026?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Void 010098-2026?').getByRole('button', 'Void statement').tap();
  await expect(register.getByRole('row', /^010098-2026 /).getByRole('cell', 'Void')).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Billing').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  // Three new entries, newest first, then the sample data's two statement entries; no voucher or ID entry.
  await expect(entries).toHaveCount(5);
  await expect(entries).toContainText([
    '010098-2026 marked void.',
    '010099-2026 from Harbor Point Logistics Corp. marked paid (₱586,627.50).',
    '010100-2026 sent to Novatek BPO Solutions Inc. (₱22,000.00 due Nov 17, 2026).',
    '010099-2026 sent to Harbor Point Logistics Corp. (₱586,627.50 due Nov 5, 2026).',
    '010097-2026 marked paid; BDO deposit ref 7731925.',
  ]);
});

test('bills someone not in the directory, typed as the statement prints it', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  await form.getByRole('textbox', 'Bill to').fill('RACIL REALTY INC');
  await form.getByRole('textbox', 'Attention').fill('Angela Marie B. Pagulayan');
  await form.getByRole('checkbox', 'Add 12% VAT').tap();
  await form.getByRole('textbox', 'Line 1 description').fill('Commercial rental commission');
  await form.getByRole('textbox', 'Line 1 unit price').fill('210000');

  // ₱210,000 with 12% VAT; no withholding until it is ticked.
  await expect(paper.getByText('RACIL REALTY INC', { exact: true }).first()).toBeVisible();
  await expect(paper.getByText('Angela Marie B. Pagulayan', { exact: true }).first()).toBeVisible();
  await expect(paper.getByRole('row', 'Total amount due ₱235,200.00').first()).toBeVisible();

  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(screen.getByRole('table', 'Statements issued').getByRole('row', /^010100-2026 RACIL REALTY INC Nov 2, 2026 Nov 17, 2026 ₱235,200\.00 Sent/)).toBeVisible();

  // A statement needs someone to bill.
  await form.getByRole('textbox', 'Line 1 description').fill('Commercial rental commission');
  await form.getByRole('textbox', 'Line 1 unit price').fill('210000');
  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter who the statement is billed to.');
});

test('prints who prepared, checked and approved the statement', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  // Before any statement names them, the signatories are Company Details'.
  await expect(form.getByRole('textbox', 'Prepared by')).toHaveValue('D. Lazaro');
  await expect(form.getByRole('textbox', 'Checked by')).toHaveValue('Accounting');
  await expect(form.getByRole('textbox', 'Approved by')).toHaveValue('CEO');
  await form.getByRole('textbox', 'Checked by').fill('Mark Anthony Santos');
  await form.getByRole('textbox', 'Approved by').fill('Brian Sy');

  await expect(paper.getByText('Mark Anthony Santos', { exact: true }).first()).toBeVisible();
  await expect(paper.getByText('Brian Sy', { exact: true }).first()).toBeVisible();

  await form.getByRole('textbox', 'Bill to').fill('Novatek BPO Solutions Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');
  await form.getByRole('button', 'Save and mark as sent').tap();
  await expect(screen.getByRole('dialog', '010100-2026 saved and marked as sent.')).toBeVisible();

  // The next statement is checked and approved by the same people.
  await expect(form.getByRole('textbox', 'Checked by')).toHaveValue('Mark Anthony Santos');
  await expect(form.getByRole('textbox', 'Approved by')).toHaveValue('Brian Sy');
});

test('adds an account under Others on a statement, and Bank Accounts keeps it', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');
  const payInto = form.getByRole('combobox', 'Pay into');

  await payInto.tap();
  await screen.getByRole('option', 'Others…').tap();
  const account = form.getByRole('group', 'New bank account');

  await account.getByRole('textbox', 'Bank name').fill('BDO');
  await account.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await account.getByRole('textbox', 'Branch').fill('Ortigas Center');
  await account.getByRole('button', 'Save account').tap();

  await expect(account).toBeHidden();
  await expect(payInto).toHaveText('BDO · 0012 3456 7890');
  await expect(form.getByRole('textbox', 'Payment instructions')).toHaveValue(/^Please make payment to:\nBank: BDO, Ortigas Center\nAccount Name: .+\nAccount Number: 0012 3456 7890\n/);
  await expect(screen.getByRole('article', 'Billing statement 010100-2026').getByText('Bank: BDO, Ortigas Center', { exact: false }).first()).toBeVisible();

  await app.open('/#banks');
  await expect(screen.getByRole('table', 'Bank accounts').getByRole('row', /^B-002 BDO Ortigas Center /)).toBeVisible();
});
