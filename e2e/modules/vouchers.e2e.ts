import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile } from 'node:fs/promises';

// Check Vouchers (packages/modules/vouchers). The sample data has CV-2026-0139 released, 0140 approved (₱13,150.00 to
// JL Santos Printing Services) and 0141 for approval (₱35,000.00 to Vergara & Associates Law Office, check 0001188).
// New vouchers are numbered 8888-001, 8888-002 and on, with no year.

test('writes a voucher and routes it for approval', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('8888-001');
  await expect(form.getByRole('textbox', 'Date')).toHaveValue('2026-11-02');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier');
  await form.getByRole('textbox', 'Line 2 amount').fill('250');

  // The total, its amount in words and the printed voucher follow the form as you type.
  await expect(form.getByText('₱1,500.50')).toBeVisible();
  await expect(form.getByText('One Thousand Five Hundred Pesos and 50/100 Only')).toBeVisible();
  const paper = screen.getByRole('article', 'Check voucher 8888-001');

  await expect(paper.getByRole('row', 'Office supplies for November ₱1,250.50').first()).toBeVisible();

  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(screen.getByRole('dialog', '8888-001 saved and routed for approval.')).toBeVisible();
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^8888-001 Nov 2, 2026 Manila Electric Company \(Meralco\).*₱1,500\.50 For Approval/)).toBeVisible();
  await expect(screen.getByText('2 vouchers worth ₱36,500.50 wait for approval.')).toBeVisible();

  // The form is blank again, numbered from the register.
  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('8888-002');
});

test('refuses a voucher with no particulars', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(form.getByRole('alert')).toHaveText('Add at least one particular with an amount.');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001/)).toBeHidden();
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

test('releases a voucher only once it is approved and has its check number', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('button', 'Save and route for approval').tap();
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001 /);

  await row.getByRole('button', 'Actions for 8888-001').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();
  await expect(screen.getByRole('dialog', 'Approve 8888-001 before releasing it.')).toBeVisible();
  await expect(row.getByRole('cell', 'For Approval')).toBeVisible();

  await row.getByRole('button', 'Actions for 8888-001').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(row.getByRole('cell', 'Approved')).toBeVisible();
  await row.getByRole('button', 'Actions for 8888-001').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();

  await expect(screen.getByRole('dialog', 'Enter the check number on 8888-001 before releasing it.')).toBeVisible();
  await expect(row.getByRole('cell', 'Approved')).toBeVisible();
});

test('a released voucher stays released', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0139 /);

  await row.getByRole('button', 'Actions for CV-2026-0139').tap();
  await screen.getByRole('menuitem', 'Mark for approval').tap();

  await expect(screen.getByRole('dialog', 'CV-2026-0139 is released and stays released. Void it if the check is cancelled.')).toBeVisible();
  await expect(row.getByRole('cell', 'Released')).toBeVisible();
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

test('an approved voucher opens read-only and copies to a new voucher', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('cell', 'CV-2026-0140').tap();
  const form = screen.getByRole('form', 'Viewing CV-2026-0140');

  // What was approved is what prints: nothing on it can be typed over.
  await expect(form.getByText('CV-2026-0140 is approved and can no longer be changed. Copy it to a new voucher to change it.')).toBeVisible();
  await expect(form.getByRole('textbox', 'Line 1 amount')).toBeDisabled();
  await expect(form.getByRole('button', 'Save changes')).toBeHidden();
  const paper = screen.getByRole('article', 'Check voucher CV-2026-0140');

  await expect(paper.getByRole('row', 'Printing of lease folders (500 pcs) ₱12,500.00').first()).toBeVisible();

  await form.getByRole('button', 'Copy to new voucher').tap();
  const copy = screen.getByRole('form', 'New voucher');

  await expect(copy.getByRole('textbox', 'CV No.')).toHaveValue('8888-001');
  await expect(copy.getByRole('textbox', 'Check No.')).toHaveValue('');
  await expect(copy.getByRole('textbox', 'Line 1 description')).toHaveValue('Printing of lease folders (500 pcs)');
  await copy.getByRole('textbox', 'Check No.').fill('0004521');
  await copy.getByRole('button', 'Save and route for approval').tap();

  await expect(register.getByRole('row', /^8888-001 Nov 2, 2026 JL Santos Printing Services 0004521 .*₱13,150\.00 For Approval/)).toBeVisible();
  await expect(register.getByRole('row', /^CV-2026-0140 .*Approved/)).toBeVisible();
});

test('prints one voucher on half an A4 sheet, ruled into boxes like the cash voucher', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Check No.').fill('0004512');
  await form.getByRole('textbox', 'Date of check').fill('2026-11-05');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  const paper = screen.getByRole('article', 'Check voucher 8888-001');

  // Cut once along its dashed lower edge, at the middle of the page.
  await expect(paper).toHaveAttribute('data-print-fit', 'half');
  await expect(paper.getByText('ALPHA PREMIER GROUP OF COMPANIES OPC')).toBeVisible();
  await expect(paper.getByText('No. 8888-001')).toBeVisible();

  const box = (text: string) => paper.getByRole('definition').filter({ hasText: text });

  await expect(box('Manila Electric Company (Meralco) (TIN 000-101-528-000)')).toBeVisible();
  await expect(box('Ortigas Ave., Pasig City')).toBeVisible();
  await expect(box('BPI · 4011 0258 68')).toBeVisible();
  await expect(box('November 2, 2026')).toBeVisible();
  await expect(box('0004512')).toBeVisible();
  await expect(box('November 5, 2026')).toBeVisible();
  await expect(paper.getByRole('row', 'Office supplies for November ₱1,250.50')).toBeVisible();
  await expect(paper.getByRole('row', 'Total ₱1,250.50')).toBeVisible();
  await expect(box('One Thousand Two Hundred Fifty Pesos and 50/100 Only')).toBeVisible();

  for (const role of ['Prepared by', 'Audited by', 'Approved by', 'Received payment by']) await expect(paper.getByText(role)).toBeVisible();
});

test('draws the check on an account kept in Bank Accounts, and the next voucher starts with it', async ({ app, screen }) => {
  // A second account, kept on the Bank Accounts screen.
  await app.open('/#banks');
  await screen.getByRole('button', 'Add account').tap();
  const dialog = screen.getByRole('dialog', 'Add account');

  await dialog.getByRole('textbox', 'Bank').fill('BDO');
  await dialog.getByRole('textbox', 'Branch').fill('Ortigas Center');
  await dialog.getByRole('textbox', 'Account name').fill('Alpha Premier Group of Companies OPC');
  await dialog.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await dialog.getByRole('button', 'Add account').tap();
  await expect(screen.getByRole('dialog', 'B-002 added.')).toBeVisible();

  // The first voucher starts on the company's first account; this check is drawn on the new one.
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('combobox', 'Bank')).toHaveText('BPI · 4011 0258 68');
  await form.getByRole('combobox', 'Bank').tap();
  await screen.getByRole('option', 'BDO · 0012 3456 7890').tap();
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  await expect(screen.getByRole('article', 'Check voucher 8888-001').getByRole('definition').filter({ hasText: 'BDO · 0012 3456 7890' })).toBeVisible();
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '8888-001 saved and routed for approval.')).toBeVisible();

  await expect(form.getByRole('combobox', 'Bank')).toHaveText('BDO · 0012 3456 7890');
});

test('starts each voucher with the signatories the last one was saved with', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  // Whoever prepares vouchers types their own full name; the next voucher starts with it.
  await form.getByRole('textbox', 'Prepared by').fill('Kristine Joy L. Villanueva');
  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '8888-001 saved and routed for approval.')).toBeVisible();

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('8888-002');
  await expect(form.getByRole('textbox', 'Prepared by')).toHaveValue('Kristine Joy L. Villanueva');
  await expect(screen.getByRole('article', 'Check voucher 8888-002').getByText('Kristine Joy L. Villanueva')).toBeVisible();
});

test('a saved voucher shows in the activity log', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '8888-001 saved and routed for approval.')).toBeVisible();

  await app.open('/#activity');
  const first = screen.getByRole('region', 'Entries').getByRole('listitem').first();

  await expect(first).toContainText('8888-001');
  await expect(first).toContainText('Manila Electric Company (Meralco)');
});

test('New voucher puts away the voucher open in the form and starts a blank one', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('table', 'Voucher register').getByRole('cell', 'CV-2026-0141').tap();

  await expect(screen.getByRole('dialog', 'CV-2026-0141 loaded into the form.')).toBeVisible();
  await expect(screen.getByRole('form', 'Editing CV-2026-0141')).toBeVisible();

  await screen.getByRole('button', 'New voucher').tap();
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('8888-001');
  await expect(form.getByRole('textbox', 'Line 1 description')).toHaveValue('');
  await expect(form.getByRole('textbox', 'Check No.')).toHaveValue('');
  await expect(form.getByRole('button', 'Save as new')).toBeHidden();
});

test('returns an approved voucher for approval, and Home and Overview count it again', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0140 /);

  await row.getByRole('button', 'Actions for CV-2026-0140').tap();
  await screen.getByRole('menuitem', 'Mark for approval').tap();

  await expect(screen.getByRole('dialog', 'CV-2026-0140 marked for approval.')).toBeVisible();
  await expect(row.getByRole('cell', 'For Approval')).toBeVisible();
  await expect(screen.getByText('2 vouchers worth ₱48,150.00 wait for approval.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByRole('button', /^Check Vouchers .* Awaiting approval 2$/)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '₱48,150.00 pending signature' })).toBeVisible();
  await expect(screen.getByRole('region', 'Waiting on you').getByRole('button', /^CV-2026-0140 JL Santos Printing Services · voucher ₱13,150\.00 For Approval$/)).toBeVisible();

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('CV-2026-0140 returned for approval.');
});

test('exports the voucher as a PDF named after its number', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  // The toast shows for 3.2 s and the download can finish later, so it is read while the download is awaited. Drawing
  // the voucher into a PDF takes several seconds on a busy machine.
  const file = await browser.waitForDownload(async () => {
    await form.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved 8888-001.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  expect(file.suggestedFilename).toBe('8888-001.pdf');
  expect((await readFile(file.absolutePath)).subarray(0, 5).toString()).toBe('%PDF-');
});

test('Ctrl+S saves the voucher being written', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('textbox', 'Line 1 amount').press('Control+s');

  await expect(screen.getByRole('dialog', '8888-001 saved and routed for approval.')).toBeVisible();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001 .* ₱980\.00 For Approval/)).toBeVisible();
  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('8888-002');
});

test('adds and removes particulars, and always keeps one line', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('button', 'Remove line 1')).toBeDisabled();
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1000');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier');
  await form.getByRole('textbox', 'Line 2 amount').fill('500');
  await expect(form.getByText('₱1,500.00')).toBeVisible();
  await expect(form.getByRole('button', 'Remove line 1')).toBeEnabled();

  await form.getByRole('button', 'Remove line 2').tap();

  await expect(form.getByRole('textbox', 'Line 2 description')).toBeHidden();
  await expect(form.getByText('₱1,000.00')).toBeVisible();
  await expect(form.getByRole('button', 'Remove line 1')).toBeDisabled();

  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001 .* ₱1,000\.00 For Approval/)).toBeVisible();
});

test('logs each edit, approval, release and void, under the Vouchers filter', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('cell', 'CV-2026-0141').tap();
  const form = screen.getByRole('form', 'Editing CV-2026-0141');

  await form.getByRole('textbox', 'Line 1 description').fill('Retainer – October 2026, with court filings');
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'CV-2026-0141 updated.')).toBeVisible();

  const row = register.getByRole('row', /^CV-2026-0141 /);

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(row.getByRole('cell', 'Approved')).toBeVisible();
  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();
  await expect(row.getByRole('cell', 'Released')).toBeVisible();

  // The approved CV-2026-0140 is cancelled before its check goes out.
  await register.getByRole('button', 'Actions for CV-2026-0140').tap();
  await screen.getByRole('menuitem', 'Void voucher…').tap();
  await screen.getByRole('alertdialog', 'Void CV-2026-0140?').getByRole('button', 'Void voucher').tap();
  await expect(register.getByRole('row', /^CV-2026-0140 /).getByRole('cell', 'Void')).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Vouchers').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  // Four new entries, newest first, then the sample data's three voucher entries; no Billing or ID entry.
  await expect(entries).toHaveCount(7);
  await expect(entries).toContainText([
    'CV-2026-0140 voided (₱13,150.00).',
    'CV-2026-0141 released; check 0001188 to Vergara & Associates Law Office.',
    'CV-2026-0141 approved by CEO.',
    'CV-2026-0141 for Vergara & Associates Law Office edited (₱35,000.00).',
    'CV-2026-0141 for Vergara & Associates Law Office saved and routed for approval (₱35,000.00).',
    'CV-2026-0140 approved by CEO.',
    'CV-2026-0139 released; check 0004509 picked up by Meralco collector.',
  ]);
});
