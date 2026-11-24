import { test, type Browser, type WebApp } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile } from 'node:fs/promises';
import { faintPaperText, paperValueLines, PDF_MOST_BYTES, tinyPaperText, voucherColumnLines } from '../support/paper';
import { pickSignatory, typeSignatory } from '../support/signatory';

// Check Vouchers (packages/modules/vouchers). The sample data has CV-2026-0139 released, 0140 approved (₱13,150.00 to
// JL Santos Printing Services) and 0141 for approval (₱35,000.00 to Vergara & Associates Law Office, check 0001188).
// New vouchers are numbered 888-001, 888-002 and on, with no year. The register and the form are on two tabs; the
// register is shown first, and opening a voucher, or New voucher, shows the form.

const REGISTER = /^Voucher register/;
const ENTRY = /^Voucher entry/;

test('writes a voucher and routes it for approval', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('888-001');
  await expect(form.getByRole('textbox', 'Date')).toHaveValue('2026-11-02');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier');
  await form.getByRole('textbox', 'Line 2 amount').fill('250');

  // The total, its amount in words and the printed voucher follow the form as you type.
  await expect(form.getByText('₱1,500.50')).toBeVisible();
  await expect(form.getByText('One Thousand Five Hundred Pesos and 50/100 Only')).toBeVisible();
  const paper = screen.getByRole('article', 'Check voucher 888-001');

  await expect(paper.getByRole('row', 'Office supplies for November ₱1,250.50').first()).toBeVisible();

  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
  // The form is blank again, numbered from the register.
  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('888-002');

  await screen.getByRole('tab', REGISTER).tap();
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^888-001 Nov 2, 2026 MANILA ELECTRIC COMPANY \(MERALCO\).*₱1,500\.50 For Approval/)).toBeVisible();
  await expect(screen.getByText('2 vouchers worth ₱36,500.50 wait for approval.')).toBeVisible();
});

test('keeps the register and the form on tabs of their own, and pins the preview beside the form', async ({ app, screen, browser }) => {
  await browser.setViewport({ width: 1440, height: 900 });
  await app.open('/#vouchers');

  // The register shows first; the form waits on its own tab.
  await expect(screen.getByRole('tab', REGISTER)).toHaveAttribute('aria-selected', 'true');
  await expect(screen.getByRole('table', 'Voucher register')).toBeVisible();
  await expect(screen.getByRole('form', 'New voucher')).toBeHidden();

  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await expect(form).toBeVisible();
  await expect(screen.getByRole('table', 'Voucher register')).toBeHidden();

  // Pinned, as it starts, the preview stays at the top of the window while the form scrolls up under it.
  const pin = screen.getByRole('button', 'Pin preview');
  const preview = screen.getByRole('region', 'Document preview');
  const scrollTo = (y: number) => browser.evaluate((to: number) => document.getElementById('main')?.scrollTo(0, to), y);

  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await scrollTo(400);
  expect((await preview.boundingBox())?.y).toBeGreaterThanOrEqual(0);

  // Unpinned, it scrolls up with the page.
  await scrollTo(0);
  await pin.tap();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await scrollTo(400);
  expect((await preview.boundingBox())?.y).toBeLessThan(0);

  // And pinned again, it is back in view without scrolling.
  await scrollTo(0);
  await pin.tap();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await scrollTo(400);
  expect((await preview.boundingBox())?.y).toBeGreaterThanOrEqual(0);
});

test('refuses a voucher with no particulars', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('button', 'Save and route for approval').tap();

  await expect(form.getByRole('alert')).toHaveText('Add at least one particular with an amount.');
  await screen.getByRole('tab', REGISTER).tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001/)).toBeHidden();
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
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('button', 'Save and route for approval').tap();
  await screen.getByRole('tab', REGISTER).tap();
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 /);

  await row.getByRole('button', 'Actions for 888-001').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();
  await expect(screen.getByRole('dialog', 'Approve 888-001 before releasing it.')).toBeVisible();
  await expect(row.getByRole('cell', 'For Approval')).toBeVisible();

  await row.getByRole('button', 'Actions for 888-001').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(row.getByRole('cell', 'Approved')).toBeVisible();
  await row.getByRole('button', 'Actions for 888-001').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();

  await expect(screen.getByRole('dialog', 'Enter the check number on 888-001 before releasing it.')).toBeVisible();
  await expect(row.getByRole('cell', 'Approved')).toBeVisible();

  // The check is often written after approval: an approved voucher still takes it, and then it is released.
  await row.getByRole('cell', '888-001').tap();
  const approved = screen.getByRole('form', 'Editing 888-001');

  await approved.getByRole('textbox', 'Check No.').fill('0004530');
  await approved.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', '888-001 updated.')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  await row.getByRole('button', 'Actions for 888-001').tap();
  await screen.getByRole('menuitem', 'Mark released').tap();
  await expect(row.getByRole('cell', 'Released')).toBeVisible();
});

test('a released voucher stays released', async ({ app, screen }) => {
  await app.open('/#vouchers');
  // Released in October, it is folded under October 2026 by November.
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0139 /)).toBeHidden();
  await screen.getByText('October 2026').tap();
  const row = screen.getByRole('table', 'Vouchers, October 2026').getByRole('row', /^CV-2026-0139 /);

  await row.getByRole('button', 'Actions for CV-2026-0139').tap();
  await screen.getByRole('menuitem', 'Mark for approval').tap();

  await expect(screen.getByRole('dialog', 'CV-2026-0139 is released and stays released. Void it if the check is cancelled.')).toBeVisible();
  await expect(row.getByRole('cell', 'Released')).toBeVisible();
});

test('asks before voiding, a void voucher stays void, and deleting it removes it for good', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0141 /);

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Void voucher…').tap();
  const confirm = screen.getByRole('alertdialog', 'Void CV-2026-0141?');

  await expect(confirm.getByText('₱35,000.00 to Vergara & Associates Law Office. A void voucher cannot be reopened, and is cleared from the register 7 days after.')).toBeVisible();
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(row.getByRole('cell', 'For Approval')).toBeVisible();

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Void voucher…').tap();
  await screen.getByRole('alertdialog', 'Void CV-2026-0141?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Void CV-2026-0141?').getByRole('button', 'Void voucher').tap();
  await expect(row.getByRole('cell', 'Void')).toBeVisible();

  await row.getByRole('button', 'Actions for CV-2026-0141').tap();
  await expect(screen.getByRole('menuitem', 'Mark approved')).toBeDisabled();
  await expect(screen.getByRole('menuitem', 'Void voucher…')).toBeHidden();

  // Deleting asks too, and says when it would have been cleared on its own.
  await screen.getByRole('menuitem', 'Delete voucher…').tap();
  const del = screen.getByRole('alertdialog', 'Delete CV-2026-0141?');

  await expect(del.getByText('The void voucher for ₱35,000.00 to Vergara & Associates Law Office is removed from the register now, instead of on Nov 9, 2026.')).toBeVisible();
  await del.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await del.getByRole('button', 'Delete voucher').tap();
  await expect(row).toBeHidden();
});

test('edits a voucher while it waits for approval, and saves changes in place', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('cell', 'CV-2026-0141').tap();
  const form = screen.getByRole('form', 'Editing CV-2026-0141');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('CV-2026-0141');
  await form.getByRole('textbox', 'Check No.').fill('0001190');
  await form.getByRole('button', 'Save changes').tap();
  await screen.getByRole('tab', REGISTER).tap();

  await expect(register.getByRole('row', /^CV-2026-0141 .* 0001190 /)).toBeVisible();
  // The heading row, 0140 and 0141: the released 0139 is folded under October 2026.
  await expect(register.getByRole('row')).toHaveCount(3);
});

test('an approved voucher stays open: its check keeps the approval, any other change sends it back', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('cell', 'CV-2026-0140').tap();
  const form = screen.getByRole('form', 'Editing CV-2026-0140');

  await expect(form.getByText('CV-2026-0140 is approved. The check number and date of check can be written in as it is; any other change sends it back for approval.')).toBeVisible();
  await expect(form.getByRole('textbox', 'Line 1 amount')).toBeEnabled();
  const paper = screen.getByRole('article', 'Check voucher CV-2026-0140');

  // The check, written once approved, keeps the approval.
  await form.getByRole('textbox', 'Check No.').fill('0004531');
  await form.getByRole('textbox', 'Date of check').fill('2026-11-03');
  await expect(paper.getByRole('definition').filter({ hasText: '0004531' }).first()).toBeVisible();
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'CV-2026-0140 updated.')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  await expect(register.getByRole('row', /^CV-2026-0140 .* 0004531 Nov 3, 2026 .*Approved/)).toBeVisible();

  // A mistake on it is put right in place, and the corrected voucher goes back for approval.
  await register.getByRole('cell', 'CV-2026-0140').tap();
  await form.getByRole('textbox', 'Line 1 amount').fill('12000');
  await form.getByRole('button', 'Save and return for approval').tap();
  await expect(screen.getByRole('dialog', 'CV-2026-0140 updated and returned for approval.')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  await expect(register.getByRole('row', /^CV-2026-0140 .*₱12,650\.00 For Approval/)).toBeVisible();

  await app.open('/#activity');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries.first()).toContainText('CV-2026-0140 for JL SANTOS PRINTING SERVICES edited after approval, and returned for approval (₱12,650.00).');
  await expect(entries.nth(1)).toContainText('CV-2026-0140 check 0004531 entered, dated Nov 3, 2026.');
});

test('copies a released voucher to a new voucher with no check', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByText('October 2026').tap();
  await screen.getByRole('table', 'Vouchers, October 2026').getByRole('cell', 'CV-2026-0139').tap();
  await screen.getByRole('form', 'Viewing CV-2026-0139').getByRole('button', 'Copy to new voucher').tap();
  const copy = screen.getByRole('form', 'New voucher');

  await expect(copy.getByRole('textbox', 'CV No.')).toHaveValue('888-001');
  await expect(copy.getByRole('textbox', 'Check No.')).toHaveValue('');
  await copy.getByRole('textbox', 'Check No.').fill('0004521');
  await copy.getByRole('button', 'Save and route for approval').tap();
  await screen.getByRole('tab', REGISTER).tap();

  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 Nov 2, 2026 .* 0004521 .*For Approval/)).toBeVisible();
});

test('a released voucher opens read-only, its check too', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByText('October 2026').tap();
  await screen.getByRole('table', 'Vouchers, October 2026').getByRole('cell', 'CV-2026-0139').tap();
  const form = screen.getByRole('form', 'Viewing CV-2026-0139');

  await expect(form.getByText('CV-2026-0139 is released and can no longer be changed. Copy it to a new voucher to change it.')).toBeVisible();
  await expect(form.getByRole('textbox', 'Check No.')).toBeDisabled();
  await expect(form.getByRole('button', 'Save check')).toBeHidden();
  await expect(form.getByRole('button', 'Copy to new voucher')).toBeVisible();
});

test('prints the voucher twice on one A4 sheet, ruled into boxes like the cash voucher', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Check No.').fill('0004512');
  await form.getByRole('textbox', 'Date of check').fill('2026-11-05');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  const paper = screen.getByRole('article', 'Check voucher 888-001');

  // A copy on each half of the page, cut apart along the dashed line between them.
  await expect(paper).toHaveAttribute('data-print-fit', 'halves');
  await expect(paper.getByText('No. 888-001')).toHaveCount(2);
  // Every paper's letterhead (docs/adr/0038): the title across the top, then the Group of Companies logo with the
  // built-in address, the Philippine Stock Exchange Centre one, beside it (docs/adr/0023); the logo names the company,
  // so neither the registered name nor the contact prints at the top.
  await expect(paper.getByRole('img', 'Alpha Premier Group of Companies')).toBeVisible();
  await expect(paper.getByText('Suites 3104, Philippine Stock Exchange Centre, Tektite East Tower, Exchange Road, Ortigas Center, Pasig City 1605').first()).toBeVisible();
  await expect(paper.getByText(/Unit 3104C/)).toBeHidden();
  await expect(paper.getByText('ALPHA PREMIER GROUP OF COMPANIES OPC', { exact: true })).toBeHidden();
  await expect(paper.getByText(/02 8650 2540/)).toBeHidden();

  const box = (text: string) => paper.getByRole('definition').filter({ hasText: text });

  // The payee and their address are typed, not picked: a new voucher starts with nobody.
  await expect(form.getByRole('textbox', 'Payee')).toHaveValue('');
  await expect(form.getByRole('textbox', 'Address')).toHaveValue('');
  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Address').fill('Ortigas Ave., Pasig City');
  // Names print in capitals, however they are typed.
  await expect(box('MANILA ELECTRIC COMPANY (MERALCO)')).toBeVisible();
  await expect(box('Ortigas Ave., Pasig City')).toBeVisible();

  // The payee's TIN prints only once someone types it.
  await expect(paper.getByText('000-101-528-000')).toBeHidden();
  await form.getByRole('textbox', 'TIN').fill('000-101-528-000');
  await expect(box('000-101-528-000')).toBeVisible();
  await expect(box('BPI · 4011 0258 68')).toBeVisible();
  await form.getByRole('textbox', 'Issuer').fill('Alpha Premier Realty');
  await expect(box('ALPHA PREMIER REALTY')).toBeVisible();
  // The issuer comes first on its row, under the payee, and the bank beside it, under the TIN; each on one line.
  await expect(paper.first()).toContainText(/Issuer\s*ALPHA PREMIER REALTY\s*Bank\s*BPI · 4011 0258 68\s*Date of check/i);
  expect(await paperValueLines(browser, 'ALPHA PREMIER REALTY')).toBe(1);
  expect(await paperValueLines(browser, 'BPI · 4011 0258 68')).toBe(1);
  // The line before the dates runs on down the amounts to the total, straight: not a hair to one side anywhere.
  expect(await voucherColumnLines(browser)).toHaveLength(1);
  await expect(box('November 2, 2026')).toBeVisible();
  await expect(box('0004512')).toBeVisible();
  await expect(box('November 5, 2026')).toBeVisible();
  await expect(paper.getByRole('row', 'Office supplies for November ₱1,250.50')).toBeVisible();
  await expect(paper.getByRole('row', 'Total ₱1,250.50')).toBeVisible();
  await expect(box('One Thousand Two Hundred Fifty Pesos and 50/100 Only')).toBeVisible();

  for (const role of ['Prepared by', 'Audited by', 'Approved by', 'Received payment by']) await expect(paper.getByText(role).first()).toBeVisible();

  // Each signatory's name prints above their position.
  await typeSignatory(screen, form, 'Approved by', 'Mark Anthony Santos');
  await form.getByRole('textbox', "Approver's position").fill('Chief Executive Officer');
  await expect(paper.getByText('MARK ANTHONY SANTOS').first()).toBeVisible();
  await expect(paper.getByText('Chief Executive Officer').first()).toBeVisible();
  await expect(paper).toContainText(/MARK ANTHONY SANTOS\s*Chief Executive Officer/);

  // Its labels included, nothing on it is smaller than 11px or fainter than 4.5:1.
  expect(await tinyPaperText(browser)).toEqual([]);
  expect(await faintPaperText(browser)).toEqual([]);
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
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('combobox', 'Bank')).toHaveText('BPI · 4011 0258 68');
  await form.getByRole('combobox', 'Bank').tap();
  await screen.getByRole('option', 'BDO · 0012 3456 7890').tap();
  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  await expect(screen.getByRole('article', 'Check voucher 888-001').getByRole('definition').filter({ hasText: 'BDO · 0012 3456 7890' })).toBeVisible();
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();

  await expect(form.getByRole('combobox', 'Bank')).toHaveText('BDO · 0012 3456 7890');
});

test('adds an account not listed under Others, keeps it for the next voucher, and removes one from the Bank list', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  // A new account, typed on the voucher itself: nothing to add on the Bank Accounts screen first.
  await form.getByRole('combobox', 'Bank').tap();
  await screen.getByRole('option', 'Others…').tap();
  const added = form.getByRole('group', 'New bank account');

  // The account's name starts as the company's, as Company Details keeps it.
  await expect(added.getByRole('textbox', 'Account name')).toHaveValue('ALPHA PREMIER GROUP OF COMPANIES OPC');
  await added.getByRole('textbox', 'Bank name').fill('Security Bank');
  await added.getByRole('textbox', 'Account number').fill('0000 1111');
  await added.getByRole('button', 'Save account').tap();
  await expect(screen.getByRole('dialog', 'B-002 added.')).toBeVisible();
  await expect(added).toBeHidden();
  await expect(form.getByRole('combobox', 'Bank')).toHaveText('Security Bank · 0000 1111');

  // The same number again is refused, and says which account has it.
  await form.getByRole('combobox', 'Bank').tap();
  await screen.getByRole('option', 'Others…').tap();
  await added.getByRole('textbox', 'Bank name').fill('BDO');
  await added.getByRole('textbox', 'Account number').fill('0000-1111');
  await added.getByRole('button', 'Save account').tap();
  await expect(added.getByRole('alert')).toHaveText('Account number 0000-1111 is already saved as B-002 (Security Bank, ALPHA PREMIER GROUP OF COMPANIES OPC).');
  await added.getByRole('button', 'Cancel').tap();

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();

  // The next voucher lists it, and Bank Accounts keeps it.
  await form.getByRole('combobox', 'Bank').tap();
  await expect(screen.getByRole('option', 'Security Bank · 0000 1111')).toBeVisible();
  await screen.getByRole('option', 'BPI · 4011 0258 68').tap();

  // Removing the one picked asks first, then the check is drawn on the first account still kept.
  await form.getByRole('button', 'Remove…').tap();
  const confirm = screen.getByRole('alertdialog', 'Remove B-001?');

  await confirm.getByRole('checkbox', 'I understand this can’t be undone').tap();

  await confirm.getByRole('button', 'Remove account').tap();
  await expect(screen.getByRole('dialog', 'B-001 removed.')).toBeVisible();
  await expect(form.getByRole('combobox', 'Bank')).toHaveText('Security Bank · 0000 1111');

  await app.open('/#banks');
  const accounts = screen.getByRole('table', 'Bank accounts');

  await expect(accounts.getByRole('row', /^B-002 Security Bank /)).toBeVisible();
  await expect(accounts.getByRole('row', /^B-001 /)).toBeHidden();
});

test('starts each voucher with the signatories the last one was saved with', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  // Whoever prepares vouchers types their own full name; the next voucher starts with it.
  await typeSignatory(screen, form, 'Prepared by', 'Kristine Joy L. Villanueva');
  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('888-002');
  // She is an employee in the directory, so the list names her as it does; the voucher prints her name in capitals.
  await expect(form.getByRole('combobox', 'Prepared by')).toHaveText('Kristine Joy L. Villanueva');
  await expect(screen.getByRole('article', 'Check voucher 888-002').getByText('KRISTINE JOY L. VILLANUEVA').first()).toBeVisible();
});

test('a saved voucher shows in the activity log', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();

  await app.open('/#activity');
  const first = screen.getByRole('region', 'Entries').getByRole('listitem').first();

  await expect(first).toContainText('888-001');
  await expect(first).toContainText('MANILA ELECTRIC COMPANY (MERALCO)');
});

test('New voucher puts away the voucher open in the form and starts a blank one', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('table', 'Voucher register').getByRole('cell', 'CV-2026-0141').tap();

  await expect(screen.getByRole('dialog', 'CV-2026-0141 loaded into the form.')).toBeVisible();
  await expect(screen.getByRole('form', 'Editing CV-2026-0141')).toBeVisible();

  await screen.getByRole('button', 'New voucher').tap();
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('888-001');
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
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  // The toast shows for 3.2 s and the download can finish later, so it is read while the download is awaited. Drawing
  // the voucher into a PDF takes several seconds on a busy machine.
  const file = await browser.waitForDownload(async () => {
    await form.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved 888-001.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  expect(file.suggestedFilename).toBe('888-001.pdf');
  const pdf = await readFile(file.absolutePath);

  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  // Drawn at print resolution and compressed: a few hundred kilobytes, not the tens of megabytes of raw pixels.
  expect(pdf.length).toBeLessThan(PDF_MOST_BYTES);
});

test('Ctrl+S saves the voucher being written', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('textbox', 'Line 1 amount').press('Control+s');

  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
  await expect(form.getByRole('textbox', 'CV No.')).toHaveValue('888-002');
  await screen.getByRole('tab', REGISTER).tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 .* ₱980\.00 For Approval/)).toBeVisible();
});

test('adds and removes particulars, and always keeps one line', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  await expect(form.getByRole('button', 'Remove line 1')).toBeDisabled();
  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
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
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 .* ₱1,000\.00 For Approval/)).toBeVisible();
});

test('logs each edit, approval, release and void, under the Vouchers filter', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('cell', 'CV-2026-0141').tap();
  const form = screen.getByRole('form', 'Editing CV-2026-0141');

  await form.getByRole('textbox', 'Line 1 description').fill('Retainer – October 2026, with court filings');
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'CV-2026-0141 updated.')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();

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
  await screen.getByRole('alertdialog', 'Void CV-2026-0140?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Void CV-2026-0140?').getByRole('button', 'Void voucher').tap();
  await expect(register.getByRole('row', /^CV-2026-0140 /).getByRole('cell', 'Void')).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Vouchers').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  // Four new entries, newest first, then the sample data's three voucher entries; no Billing or ID entry.
  await expect(entries).toHaveCount(7);
  await expect(entries).toContainText([
    'CV-2026-0140 voided (₱13,150.00).',
    'CV-2026-0141 released; check 0001188 to VERGARA & ASSOCIATES LAW OFFICE.',
    'CV-2026-0141 approved by CEO.',
    'CV-2026-0141 for VERGARA & ASSOCIATES LAW OFFICE edited (₱35,000.00).',
    'CV-2026-0141 for Vergara & Associates Law Office saved and routed for approval (₱35,000.00).',
    'CV-2026-0140 approved by CEO.',
    'CV-2026-0139 released; check 0004509 picked up by Meralco collector.',
  ]);
});

test('ticks several vouchers and voids, then deletes, them together', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await register.getByRole('checkbox', 'Select CV-2026-0140').tap();
  await register.getByRole('checkbox', 'Select CV-2026-0141').tap();
  const bar = screen.getByRole('toolbar', 'Voucher register: selected');

  await expect(bar.getByText('2 selected')).toBeVisible();
  // Each action counts only the vouchers it applies to: 0141 waits for approval, 0140 is approved.
  await expect(bar.getByRole('button', 'Mark approved (1)')).toBeEnabled();
  await expect(bar.getByRole('button', 'Delete void (0)…')).toBeDisabled();

  await bar.getByRole('button', 'Void (2)…').tap();
  await screen.getByRole('alertdialog', 'Void 2 vouchers?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Void 2 vouchers?').getByRole('button', 'Void vouchers').tap();
  await expect(register.getByRole('row', /^CV-2026-0140 /).getByRole('cell', 'Void')).toBeVisible();
  await expect(register.getByRole('row', /^CV-2026-0141 /).getByRole('cell', 'Void')).toBeVisible();
  await expect(bar).toBeHidden();

  // Ticking every row at once, then deleting the void ones.
  await register.getByRole('checkbox', 'Select every row in Voucher register').tap();
  await screen.getByRole('toolbar', 'Voucher register: selected').getByRole('button', 'Delete void (2)…').tap();
  await screen.getByRole('alertdialog', 'Delete 2 void vouchers?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Delete 2 void vouchers?').getByRole('button', 'Delete vouchers').tap();
  await expect(register.getByRole('row', /^CV-2026-014[01] /)).toHaveCount(0);
});

test('offers the next CV No., keeps one typed in, and refuses one already used', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');
  const no = form.getByRole('textbox', 'CV No.');

  await expect(no).toHaveValue('888-001');
  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Power bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('4200');

  await no.fill('CV-2026-0141');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(form.getByRole('alert')).toHaveText('CV No. CV-2026-0141 is already used. The next free one is 888-001.');

  // The number typed is the one the voucher prints and saves under, and numbering carries on after it.
  await no.fill('888-050');
  await expect(screen.getByRole('article', 'Check voucher 888-050')).toBeVisible();
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-050 saved and routed for approval.')).toBeVisible();
  await expect(no).toHaveValue('888-051');
  await screen.getByRole('tab', REGISTER).tap();
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^888-050 Nov 2, 2026 MANILA ELECTRIC COMPANY \(MERALCO\)/)).toBeVisible();

  // A saved voucher keeps its number.
  await register.getByRole('cell', '888-050').tap();
  await expect(screen.getByRole('form', 'Editing 888-050').getByRole('textbox', 'CV No.')).toHaveAttribute('readonly', '');
});

test('marks the voucher open in the form in the register, and opens one from its row menu', async ({ app, screen }) => {
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');
  const pending = register.getByRole('row', /^CV-2026-0141 /);
  const approved = register.getByRole('row', /^CV-2026-0140 /);

  await expect(pending).not.toHaveAttribute('aria-current');

  // Edit for a voucher that can still change, View for one that cannot.
  await pending.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Edit voucher').tap();
  await expect(screen.getByRole('form', 'Editing CV-2026-0141')).toBeVisible();
  // The form's tab names the voucher open in it.
  await expect(screen.getByRole('tab', ENTRY)).toHaveText(/CV-2026-0141/);
  await screen.getByRole('tab', REGISTER).tap();
  await expect(pending).toHaveAttribute('aria-current', 'true');
  await expect(approved).not.toHaveAttribute('aria-current');

  await approved.getByRole('cell', 'CV-2026-0140').tap();
  await expect(screen.getByRole('form', 'Editing CV-2026-0140')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  await expect(approved).toHaveAttribute('aria-current', 'true');
  await expect(pending).not.toHaveAttribute('aria-current');

  await screen.getByText('October 2026').tap();
  const october = screen.getByRole('table', 'Vouchers, October 2026');

  await october.getByRole('button', 'Actions for CV-2026-0139').tap();
  await screen.getByRole('menuitem', 'View voucher').tap();
  await expect(screen.getByRole('form', 'Viewing CV-2026-0139')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  await expect(october.getByRole('row', /^CV-2026-0139 /)).toHaveAttribute('aria-current', 'true');

  // A new voucher marks none.
  await screen.getByRole('button', 'New voucher').tap();
  await expect(screen.getByRole('tab', ENTRY)).toHaveText(/New$/);
  await screen.getByRole('tab', REGISTER).tap();
  await expect(october.getByRole('row', /^CV-2026-0139 /)).not.toHaveAttribute('aria-current');
});

/** The sample records with `n` more vouchers waiting for approval, 888-001 and on, each to its own payee, as if saved before this test. */
async function withMoreVouchers(app: WebApp, browser: Browser, n: number) {
  await app.open('/');
  await browser.evaluate((more: number) => {
    const saved = JSON.parse(localStorage.getItem('keystone-state') ?? '{}');
    const like = saved.cv.find((v: { no: string }) => v.no === 'CV-2026-0141');

    for (let i = 1; i <= more; i++) saved.cv.push({ ...like, no: `888-${String(i).padStart(3, '0')}`, payee: `SUPPLIER NO. ${i}`, date: '2026-11-02' });
    localStorage.setItem('keystone-state', JSON.stringify(saved));
  }, n);
  await browser.reload();
}

test('shows the register ten vouchers to a page, from the keyboard too', async ({ app, screen, browser }) => {
  await withMoreVouchers(app, browser, 12);
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');
  const pages = screen.getByRole('navigation', 'Voucher register, pages');

  // 0141, 0140 and 888-012 down to 888-005 on the first page; the heading row too.
  await expect(register.getByRole('row')).toHaveCount(11);
  await expect(pages.getByText('1–10 of 14')).toBeVisible();
  await expect(register.getByRole('row', /^888-004 /)).toBeHidden();
  await expect(pages.getByRole('button', 'Previous')).toHaveAttribute('aria-disabled', 'true');

  await pages.getByRole('button', 'Next').press('Enter');
  await expect(pages.getByText('11–14 of 14')).toBeVisible();
  await expect(register.getByRole('row', /^888-001 /)).toBeVisible();
  await expect(register.getByRole('row', /^CV-2026-0141 /)).toBeHidden();
  // At the last page Next is off, and keeps the focus.
  await expect(pages.getByRole('button', 'Next')).toHaveAttribute('aria-disabled', 'true');
  await expect(pages.getByRole('button', 'Next')).toBeFocused();

  await pages.getByRole('button', 'Previous').tap();
  await expect(register.getByRole('row', /^CV-2026-0141 /)).toBeVisible();

  // The box over the rows ticks the page shown.
  await register.getByRole('checkbox', 'Select every row on this page of Voucher register').tap();
  await expect(screen.getByRole('toolbar', 'Voucher register: selected').getByText('10 selected')).toBeVisible();
});

test('opens a voucher from Overview on the page the register shows it', async ({ app, screen, browser }) => {
  await withMoreVouchers(app, browser, 12);
  await app.open('/#overview');
  await screen.getByRole('region', 'Waiting on you').getByRole('button', /^888-002 /).tap();

  await expect(screen.getByRole('form', 'Editing 888-002')).toBeVisible();
  await screen.getByRole('tab', REGISTER).tap();
  const row = screen.getByRole('table', 'Voucher register').getByRole('row', /^888-002 /);

  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(screen.getByRole('navigation', 'Voucher register, pages').getByText('11–14 of 14')).toBeVisible();
});

test('picks a signatory from the directory\'s employees and those already signing, or types one under Other…', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');
  const paper = screen.getByRole('article', 'Check voucher 888-001');

  // The list: the employees, Company Details' names and those on saved vouchers, each once, then Other….
  await form.getByRole('combobox', 'Audited by').tap();
  await expect(screen.getByRole('option', 'Angelica S. Bautista')).toBeVisible();
  await expect(screen.getByRole('option', 'A. Bautista')).toHaveCount(1);
  await expect(screen.getByRole('option', 'Other…')).toBeVisible();
  await screen.getByRole('option', 'Angelica S. Bautista').tap();
  await expect(form.getByRole('combobox', 'Audited by')).toHaveText('Angelica S. Bautista');
  await expect(paper.getByText('ANGELICA S. BAUTISTA').first()).toBeVisible();

  // Other… clears the name and asks for it.
  await typeSignatory(screen, form, 'Audited by', 'Ma. Teresa Gomez');
  await expect(form.getByRole('combobox', 'Audited by')).toHaveText('Other…');
  await expect(paper.getByText('MA. TERESA GOMEZ').first()).toBeVisible();

  await pickSignatory(screen, form, 'Audited by', 'A. Bautista');
  await expect(form.getByRole('textbox', 'Audited by, name')).toBeHidden();
  await expect(paper.getByText('A. BAUTISTA', { exact: true }).first()).toBeVisible();
});

test('folds vouchers to the same payee into one row that opens to show them', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', ENTRY).tap();
  const form = screen.getByRole('form', 'New voucher');

  // Two more to Meralco, typed two ways: one payee.
  for (const [no, payee, amount] of [['888-001', 'Meralco', '500'], ['888-002', 'MERALCO.', '700']]) {
    await form.getByRole('textbox', 'Payee').fill(payee);
    await form.getByRole('textbox', 'Line 1 description').fill('Power');
    await form.getByRole('textbox', 'Line 1 amount').fill(amount);
    await form.getByRole('button', 'Save and route for approval').tap();
    await expect(screen.getByRole('dialog', `${no} saved and routed for approval.`)).toBeVisible();
  }

  await screen.getByRole('tab', /^Voucher register/).tap();
  const register = screen.getByRole('table', 'Voucher register');
  const fold = register.getByRole('button', /^MERALCO\.?, 2 vouchers$/);

  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(register.getByRole('row', /^888-001 /)).toBeHidden();
  await expect(fold).toContainText('₱1,200.00');

  await fold.tap();
  await expect(register.getByRole('row', /^888-001 /)).toBeVisible();
  await expect(register.getByRole('row', /^888-002 /)).toBeVisible();

  await fold.tap();
  await expect(register.getByRole('row', /^888-002 /)).toBeHidden();
});

// Save draft (docs/adr/0041): a voucher's work kept with the records and listed under Drafts above the register. A
// draft has no number, so the next voucher saved still takes 888-001, and saving it for real takes the draft away.
test('saves a draft, opens it again from Drafts, and takes it away once the voucher is saved', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save draft').tap();
  await expect(screen.getByRole('dialog', 'Draft saved. Open it again from Drafts.')).toBeVisible();

  await screen.getByRole('button', 'New voucher').tap();
  await screen.getByRole('tab', /^Voucher register/).tap();
  const draft = screen.getByRole('list', 'Drafts').getByRole('listitem', 'MANILA ELECTRIC COMPANY (MERALCO) · ₱1,250.50');

  await expect(draft.getByText('Draft', { exact: true })).toBeVisible();
  await draft.getByRole('button', 'Open').tap();
  await expect(screen.getByRole('tab', /^Voucher entry/)).toHaveAttribute('aria-selected', 'true');
  const opened = screen.getByRole('form', 'New voucher');

  await expect(opened.getByRole('textbox', 'Payee')).toHaveValue('MANILA ELECTRIC COMPANY (MERALCO)');
  await expect(opened.getByRole('textbox', 'Line 1 amount')).toHaveValue('1250.50');
  await opened.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();
  await screen.getByRole('tab', /^Voucher register/).tap();
  await expect(screen.getByRole('list', 'Drafts')).toBeHidden();
});
