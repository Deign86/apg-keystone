import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Billing Statements (packages/modules/billing). The sample data has 010097-2026 paid, 010098-2026 overdue (due Oct 10)
// and 010099-2026 sent (due Nov 5), so a new statement is 010100-2026. Novatek (C-001) is a VAT client that withholds
// 5%; Dela Cruz (C-002) is non-VAT.

test('issues a statement with VAT and withholding from the client', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await expect(form.getByRole('textbox', 'Invoice No.')).toHaveValue('010100-2026');
  await expect(form.getByRole('combobox', 'Bill to')).toHaveText('Novatek BPO Solutions Inc. (C-001)');
  await expect(form.getByRole('textbox', 'Attention')).toHaveValue('Carlo Mendiola');
  await expect(form.getByRole('checkbox', 'Add 12% VAT')).toBeChecked();
  await expect(form.getByRole('checkbox', 'Less 5% expanded withholding tax')).toBeChecked();

  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 quantity').fill('2');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');

  // 2 × ₱10,000 = ₱20,000; VAT 12% adds ₱2,400; EWT 5% takes ₱1,000 off.
  await expect(form.getByText('Subtotal ₱20,000.00 · VAT ₱2,400.00 · EWT (₱1,000.00)')).toBeVisible();
  await expect(form.getByText('₱21,400.00')).toBeVisible();
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  await expect(paper.getByRole('row', 'Total amount due ₱21,400.00')).toBeVisible();

  await form.getByRole('button', 'Save and mark as sent').tap();

  const register = screen.getByRole('table', 'Statements issued');

  await expect(register.getByRole('row', /^010100-2026 Novatek BPO Solutions Inc\. Nov 2, 2026 Nov 17, 2026 ₱21,400\.00 Sent/)).toBeVisible();
  await expect(form.getByRole('textbox', 'Invoice No.')).toHaveValue('010101-2026');
});

test('a non-VAT client gets no VAT and no withholding', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('combobox', 'Bill to').tap();
  await screen.getByRole('option', 'Dela Cruz, Maria Teresa (C-002)').tap();

  await expect(form.getByRole('checkbox', 'Add 12% VAT')).not.toBeChecked();
  await expect(form.getByRole('checkbox', 'Less 5% expanded withholding tax')).not.toBeChecked();

  await form.getByRole('textbox', 'Line 1 description').fill('Unit rental, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('45500');

  // No VAT or withholding line on the form or on the printed statement.
  await expect(form.getByText('Subtotal ₱45,500.00')).toBeVisible();
  const paper = screen.getByRole('article', 'Billing statement 010100-2026');

  await expect(paper.getByRole('row', 'Total amount due ₱45,500.00')).toBeVisible();
  await expect(paper.getByRole('row', 'VAT (12%) ₱0.00')).toBeHidden();
  await expect(paper.getByRole('row', 'Qty Description Unit price Amount')).toBeVisible();
});

test('refuses an invoice number already in use and offers the next free one', async ({ app, screen }) => {
  await app.open('/#billing');
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Invoice No.').fill('010099-2026');
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

  await confirm.getByRole('button', 'Void statement').tap();

  await expect(row.getByRole('cell', 'Void')).toBeVisible();
});

test('prints the company billing statement with the payment instructions', async ({ app, screen }) => {
  await app.open('/#billing');
  const statement = screen.getByRole('article', 'Billing statement 010100-2026');

  await expect(statement).toBeVisible();
  await expect(statement.getByText('Account Number: 4011 0258 68', { exact: false })).toBeVisible();
  await expect(statement.getByText('5% penalty charge will be applied to delayed monthly payments.')).toBeVisible();
});
