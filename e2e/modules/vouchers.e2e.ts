import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Check Vouchers (packages/modules/vouchers). The sample data has CV-2026-0139 released, 0140 approved and 0141 for
// approval, so a new voucher is CV-2026-0142.

test('writes a voucher and routes it for approval', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('CV-2026-0142');
  await expect(form.getByRole('textbox', 'Date')).toHaveValue('2026-11-02');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier');
  await form.getByRole('textbox', 'Line 2 amount').fill('250');

  // The total, its amount in words and the printed voucher follow the form as you type.
  await expect(form.getByText('₱1,500.50')).toBeVisible();
  await expect(form.getByText('One Thousand Five Hundred Pesos and 50/100 Only')).toBeVisible();
  const paper = screen.getByRole('article', 'Disbursement voucher CV-2026-0142, 3 copies');

  await expect(paper.getByRole('row', 'Office supplies for November ₱1,250.50').first()).toBeVisible();

  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(screen.getByRole('dialog', 'CV-2026-0142 saved and routed for approval.')).toBeVisible();
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^CV-2026-0142 Nov 2, 2026 Manila Electric Company \(Meralco\).*₱1,500\.50 For Approval/)).toBeVisible();
  await expect(screen.getByText('2 vouchers worth ₱36,500.50 wait for approval.')).toBeVisible();

  // The form is blank again, numbered from the register.
  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('CV-2026-0143');
});

test('refuses a voucher with no particulars', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(form.getByRole('alert')).toHaveText('Add at least one particular with an amount.');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142/)).toBeHidden();
});

test('approves and releases a voucher from its row menu', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0141 /);

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(row.getByRole('cell', 'Approved')).toBeVisible();
  await expect(screen.getByText('Every voucher is signed. Record a disbursement and route it for signatures.')).toBeVisible();

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();
  await expect(row.getByRole('cell', 'Released')).toBeVisible();
});

test('will not release a voucher without its check number', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('button', 'Save and route for approval').tap();
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142 /);

  await row.getByRole('button', 'Actions for CV-2026-0142').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();

  await expect(screen.getByRole('dialog', 'Enter the check number on CV-2026-0142 before releasing it.')).toBeVisible();
  await expect(row.getByRole('cell', 'For Approval')).toBeVisible();
});

test('asks before voiding, and a void voucher stays void', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0141 /);

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Void voucher…').tap();
  const confirm = screen.getByRole('alertdialog', 'Void CV-2026-0141?');

  await expect(confirm.getByText('₱35,000.00 to Vergara & Associates Law Office. A void voucher stays in the register and cannot be reopened.')).toBeVisible();
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(row.getByRole('cell', 'For Approval')).toBeVisible();

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Void voucher…').tap();
  await screen.getByRole('alertdialog', 'Void CV-2026-0141?').getByRole('button', 'Void voucher').tap();
  await expect(row.getByRole('cell', 'Void')).toBeVisible();

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await expect(screen.getByRole('menuitem', 'Mark approved')).toBeDisabled();
  await expect(screen.getByRole('menuitem', 'Void voucher…')).toBeDisabled();
});

test('edits a voucher while it waits for approval, and saves changes in place', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('cell', 'CV-2026-0141').tap();
  const form = screen.getByRole('form', 'Editing CV-2026-0141');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('CV-2026-0141');
  await form.getByRole('textbox', 'Check No.').fill('0001190');
  await form.getByRole('button', 'Save changes').tap();

  await expect(register.getByRole('row', /^CV-2026-0141 .* 0001190 /)).toBeVisible();
  await expect(register.getByRole('row')).toHaveCount(4);
});

test('prints three copies to a sheet', async ({ app, screen }) => {
  await app.open('/#vouchers');

  await expect(screen.getByRole('article', 'Disbursement voucher CV-2026-0142, 3 copies')).toBeVisible();
});

test('a saved voucher shows in the activity log', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', 'CV-2026-0142 saved and routed for approval.')).toBeVisible();

  await app.open('/#activity');
  const first = screen.getByRole('region', 'Entries').getByRole('listitem').first();

  await expect(first).toContainText('CV-2026-0142');
  await expect(first).toContainText('Manila Electric Company (Meralco)');
});
