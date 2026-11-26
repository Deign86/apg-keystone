import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Acknowledgement Receipts (packages/modules/receipts, docs/adr/0054): a payment received, issued on the company's
// form, kept in the register, and printed as the template lays it out. The sample records have no receipts.

test('issues a receipt for a payment by check, and prints it as the company form lays it out', async ({ app, screen }) => {
  await app.open('/#receipts');

  await expect(screen.getByRole('heading', { name: 'Acknowledgement Receipts', level: 1 })).toBeVisible();
  await expect(screen.getByText('No receipts yet.')).toBeVisible();
  const form = screen.getByRole('form', 'New receipt');

  await expect(form.getByRole('textbox', 'Receipt No.')).toHaveValue('AR-2026-0001');
  await form.getByRole('combobox', 'Client / Payor name').fill('Juan Dela Cruz');
  await form.getByRole('combobox', 'Company name').fill('Sunrise Bakeshop Co.');
  await form.getByRole('textbox', 'Contact number').fill('0917 123 4567');
  await form.getByRole('textbox', 'Email').fill('juan@sunrise.ph');
  await form.getByRole('combobox', 'Line 1 description').fill('Virtual office, December 2026');
  await form.getByRole('textbox', 'Line 1 amount').fill('2,299');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('combobox', 'Line 2 description').fill('Mail handling');
  await form.getByRole('textbox', 'Line 2 amount').fill('500');
  await expect(form.getByText('Total amount received ₱2,799.00')).toBeVisible();

  await form.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await form.getByRole('combobox', 'Bank / Payment channel').fill('BPI');
  await form.getByRole('textbox', 'Check No.').fill('0004512');
  await form.getByRole('textbox', 'Check date').fill('2026-11-30');
  await form.getByRole('textbox', 'Transaction remarks').fill('Paid in full.');
  await form.getByRole('combobox', 'Name').fill('Rosa Lim');
  await form.getByRole('combobox', 'Position').fill('Cashier');

  // The paper, as the template: the numbers, who paid, the particulars and total in words, the mode ticked, who received.
  const paper = screen.getByRole('article', 'Acknowledgement receipt AR-2026-0001');

  await expect(paper).toContainText(/Acknowledgement Receipt/i);
  await expect(paper).toContainText(/Client \/ Payor name\s*Juan Dela Cruz/i);
  await expect(paper).toContainText('VIRTUAL OFFICE, DECEMBER 2026 ₱2,299.00');
  await expect(paper).toContainText(/Total amount received ₱2,799\.00/i);
  await expect(paper).toContainText('Two Thousand Seven Hundred Ninety-Nine Pesos Only');
  await expect(paper.getByRole('list', 'Mode of payment')).toContainText(/□ Cash\s*□ Bank transfer\s*■ CHECK/);
  await expect(paper).toContainText(/Check No\.\s*0004512/i);
  await expect(paper).toContainText(/Rosa Lim\s*Cashier\s*Received by/i);
  await expect(paper).toContainText('is not, by itself, an Official Receipt or Invoice for tax purposes.');
  // The receiver signs by hand: there is no e-signature to print.
  await expect(form.getByRole('checkbox', /e-signature/)).toBeHidden();

  await form.getByRole('button', 'Save receipt').tap();
  await expect(screen.getByRole('dialog', 'AR-2026-0001 saved.')).toBeVisible();
  const register = screen.getByRole('table', 'Receipts issued');

  await expect(register.getByRole('row', /^AR-2026-0001 Nov 2, 2026 Juan Dela Cruz Sunrise Bakeshop Co\. Check ₱2,799\.00/)).toBeVisible();
  await expect(screen.getByText('1 receipt issued, for ₱2,799.00 received.')).toBeVisible();

  // The next receipt from Juan brings his company, contact and email (docs/adr/0053), and is received by the same cashier.
  const next = screen.getByRole('form', 'New receipt');

  await expect(next.getByRole('textbox', 'Receipt No.')).toHaveValue('AR-2026-0002');
  await expect(next.getByRole('combobox', 'Name')).toHaveValue('Rosa Lim');
  await next.getByRole('combobox', 'Client / Payor name').fill('Juan Dela Cruz');
  await expect(next.getByRole('combobox', 'Company name')).toHaveValue('Sunrise Bakeshop Co.');
  await expect(next.getByRole('textbox', 'Email')).toHaveValue('juan@sunrise.ph');
  await next.getByRole('combobox', 'Line 1 description').fill('Virtual office, December 2026');
  await expect(next.getByRole('textbox', 'Line 1 amount')).toHaveValue('2299');

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('AR-2026-0001 from Juan Dela Cruz, ₱2,799.00 by check received.');
});

test('refuses a receipt it cannot issue, and says why on the field', async ({ app, screen }) => {
  await app.open('/#receipts');
  const form = screen.getByRole('form', 'New receipt');

  await form.getByRole('button', 'Save receipt').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter who paid.');
  await expect(form.getByRole('combobox', 'Client / Payor name')).toHaveAttribute('aria-invalid', 'true');

  await form.getByRole('combobox', 'Client / Payor name').fill('Juan Dela Cruz');
  await form.getByRole('button', 'Save receipt').tap();
  await expect(form.getByRole('alert')).toHaveText('List what was paid for, each with its amount.');

  await form.getByRole('combobox', 'Line 1 description').fill('Virtual office');
  await form.getByRole('textbox', 'Line 1 amount').fill('2299');
  await form.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await form.getByRole('button', 'Save receipt').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the check number.');
  await expect(form.getByRole('textbox', 'Check No.')).toBeFocused();
});

test('opens a saved receipt, changes it, and removes it after asking', async ({ app, screen }) => {
  await app.open('/#receipts');
  const form = screen.getByRole('form', 'New receipt');

  await form.getByRole('combobox', 'Client / Payor name').fill('Maria Santos');
  await form.getByRole('combobox', 'Line 1 description').fill('Event deposit');
  await form.getByRole('textbox', 'Line 1 amount').fill('10000');
  await form.getByRole('button', 'Save receipt').tap();
  const register = screen.getByRole('table', 'Receipts issued');

  await register.getByRole('cell', 'AR-2026-0001').tap();
  const editing = screen.getByRole('form', 'Editing AR-2026-0001');

  await editing.getByRole('textbox', 'Transaction remarks').fill('Balance due on the day.');
  await editing.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'AR-2026-0001 updated.')).toBeVisible();

  await register.getByRole('button', 'Actions for AR-2026-0001').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  const ask = screen.getByRole('alertdialog', 'Remove AR-2026-0001?');

  await ask.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await ask.getByRole('button', 'Remove receipt').tap();
  await expect(screen.getByText('No receipts yet.')).toBeVisible();
});
