import { readFile } from 'node:fs/promises';
import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { asMember, emptyCloud, expectHome, field, idToken, makeAccount, record, recordsInCloud, signIn } from './emulators';
import { PDF_MOST_BYTES_A_PAGE } from '../support/paper';

// Requests for funds in the cloud (docs/adr/0011, 0021): staff ask, each on their own computer and seeing only their
// own requests; the CEO decides them from a phone. Approving a check drafts the check voucher through Check Vouchers;
// approving a transfer makes the fund transfer request, which the CEO and the requester print or save as a PDF.
// Then firestore.rules on their own, for a member who goes past Keystone: only the CEO decides, and staff read only
// theirs. app.clearState() is another computer, signed out and empty.

test.beforeEach(async () => {
  await emptyCloud();
});

/** Signs in on a computer with nothing of its own, to the records the CEO keeps in the cloud. */
async function signInElsewhere(app: { clearState(): Promise<void>; open(path: string): Promise<void> }, screen: Screen, account: Parameters<typeof signIn>[1]) {
  await app.clearState();
  await app.open('/');
  await signIn(screen, account);
  await expectHome(screen);
}

/** Home's Requests for Funds tile, with the number of requests the member signed in sees waiting. */
const fundsTile = (screen: Screen, waiting: number) =>
  screen.getByRole('main').getByRole('list').first().getByRole('button', new RegExp(`^Requests for Funds .* Waiting for a decision ${waiting}$`));

test('staff ask for funds, the CEO decides from a phone, and the approved one becomes a voucher', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  // HR asks for the party's venue deposit. The requester is the member signed in, and only the CEO may decide.
  await signInElsewhere(app, screen, hr);
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await expect(form.getByRole('textbox', 'Requested by')).toHaveValue('Ana Cruz');
  await expect(screen.getByText('Only the CEO approves or declines requests. The answer shows here once it is given.')).toBeVisible();
  await form.getByRole('textbox', 'What it is for').fill('Christmas party: venue deposit');
  await form.getByRole('textbox', 'Line 1 description').fill('Venue deposit');
  await form.getByRole('textbox', 'Line 1 amount').fill('48000');
  await form.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await form.getByRole('combobox', 'Payee').tap();
  await screen.getByRole('option', 'Manila Water Company (V-002)').tap();
  await form.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();

  // The request is its own document, with its status and requester beside it for the rules.
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('For Approval');
  expect(await field('rf', 'RF-2026-0001', 'uid')).toBe(hr.uid);

  // IT sees none of HR's requests, and its own still takes the next number.
  await signInElsewhere(app, screen, it);
  await app.open('/#funds');
  await expect(screen.getByRole('tab', /^Your requests/)).toBeVisible();
  await expect(screen.getByText('No requests yet.')).toBeVisible();
  await screen.getByRole('tab', /^Request entry/).tap();
  const mine = screen.getByRole('form', 'New request');

  await mine.getByRole('textbox', 'What it is for').fill('Replacement laptop charger');
  await mine.getByRole('textbox', 'Line 1 description').fill('Laptop charger');
  await mine.getByRole('textbox', 'Line 1 amount').fill('2450.50');
  await mine.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await mine.getByRole('combobox', 'Settle').tap();
  await screen.getByRole('option', 'By a date').tap();
  await mine.getByRole('textbox', 'Settle by').fill('2026-11-20');
  await mine.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 sent to the CEO for approval.')).toBeVisible();
  await expect.poll(() => field('rf', 'RF-2026-0002', 'uid'), { timeout: 10_000 }).toBe(it.uid);

  // IT's Home counts only its own request, not HR's.
  await app.open('/');
  await expect(fundsTile(screen, 1)).toBeVisible();

  // The CEO, on a phone, is told what waits, opens the screen from the menu, approves one and declines the other.
  await app.clearState();
  await browser.setViewport({ width: 390, height: 844 });
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await expect(screen.getByText('2 requests for funds worth ₱50,450.50 wait for your decision, 1 of them ASAP.')).toBeVisible();
  await expect(fundsTile(screen, 2)).toBeVisible();

  await screen.getByRole('button', 'Menu').tap();
  await screen.getByRole('dialog', 'Keystone').getByRole('button', /Requests for Funds$/).tap();
  const party = screen.getByRole('article', 'RF-2026-0001');

  await expect(party).toContainText('₱48,000.00');
  await expect(party).toContainText('Ana Cruz on Nov 2, 2026');
  await party.getByRole('button', 'Approve').tap();
  await screen.getByRole('alertdialog', 'Approve RF-2026-0001?').getByRole('button', 'Approve').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 approved. 888-001 is drafted for accounting.')).toBeVisible();

  const charger = screen.getByRole('article', 'RF-2026-0002');

  await charger.getByRole('textbox', 'Note to the requester').fill('Use the spare in the IT cabinet');
  await charger.getByRole('button', 'Decline').tap();
  await screen.getByRole('alertdialog', 'Decline RF-2026-0002?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Decline RF-2026-0002?').getByRole('button', 'Decline').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 declined.')).toBeVisible();
  await expect(screen.getByRole('region', 'Waiting for your decision')).toBeHidden();

  // The decisions and the voucher reach the cloud: accounting finds the voucher For Approval, naming the request.
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('Approved');
  await expect.poll(() => record('cv', '888-001'), { timeout: 10_000 }).toMatchObject({
    payee: 'MANILA WATER COMPANY', address: 'MWSS Compound, Quezon City', status: 'For Approval', check: '', lines: [{ desc: 'Christmas party: venue deposit (RF-2026-0001)', amt: 48000 }],
  });
  await expect.poll(() => field('rf', 'RF-2026-0002', 'status'), { timeout: 10_000 }).toBe('Declined');

  // Decided, neither waits any more: the CEO's Home tile counts none.
  await app.open('/');
  await expect(fundsTile(screen, 0)).toBeVisible();

  // Each requester sees their own answer the next time Keystone opens, and nothing of theirs still waits.
  await signInElsewhere(app, screen, hr);
  await expect(screen.getByText('RF-2026-0001 was approved; 888-001 is drafted.')).toBeVisible();
  await expect(fundsTile(screen, 0)).toBeVisible();

  await signInElsewhere(app, screen, it);
  await expect(screen.getByText('RF-2026-0002 was declined: Use the spare in the IT cabinet.')).toBeVisible();
  await expect(fundsTile(screen, 0)).toBeVisible();
});

test('HR lists the fund\'s expenses, the CEO approves the transfer from a phone, and both save its fund transfer request', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  // HR lists what the fund paid for and the account it is topped up into. A first request is paid by transfer.
  await signInElsewhere(app, screen, hr);
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'What it is for').fill('Revolving fund, Nov 1 to 15');
  await form.getByRole('textbox', 'Line 1 description').fill('Pantry groceries');
  await form.getByRole('textbox', 'Line 1 amount').fill('3250.75');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier for payroll documents');
  await form.getByRole('textbox', 'Line 2 amount').fill('480');
  await form.getByRole('textbox', 'Bank').fill('BDO');
  await form.getByRole('textbox', 'Account name').fill('Liza Ramos');
  await form.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await form.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('For Approval');

  // The CEO, on a phone, sees each expense and where the money goes before approving.
  await app.clearState();
  await browser.setViewport({ width: 390, height: 844 });
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await expect(screen.getByText('Ana Cruz asks for ₱3,730.75 ASAP; it waits for your decision.')).toBeVisible();
  await expect(fundsTile(screen, 1)).toBeVisible();
  await app.open('/#funds');
  const card = screen.getByRole('article', 'RF-2026-0001');

  await expect(card.getByRole('list', 'Expenses on RF-2026-0001')).toContainText('Pantry groceries ₱3,250.75');
  await expect(card).toContainText('BDO · Liza Ramos · 0012 3456 7890');
  await card.getByRole('button', 'Approve').tap();
  await screen.getByRole('alertdialog', 'Approve RF-2026-0001?').getByRole('button', 'Approve').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 approved. Its fund transfer request is ready to print or save as a PDF.')).toBeVisible();

  // Approving opens the request with its paper, signed off, and saves it as a PDF. No voucher is drafted.
  const viewing = screen.getByRole('form', 'Viewing RF-2026-0001');

  await expect(screen.getByRole('article', 'Fund transfer request RF-2026-0001')).toContainText('Approved in Keystone by Mark Reyes on November 2, 2026 at 10:00.');
  // The form and the paper fit the phone's width: the paper scales down, and nothing scrolls sideways.
  expect(await browser.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

  const pdf = await browser.waitForDownload(async () => {
    await viewing.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved RF-2026-0001 fund transfer request.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  expect(pdf.suggestedFilename).toBe('RF-2026-0001 fund transfer request.pdf');
  const bytes = await readFile(pdf.absolutePath);

  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // Drawn at print resolution and compressed: a few hundred kilobytes a page, not the tens of megabytes of raw pixels.
  expect(bytes.length).toBeLessThan(PDF_MOST_BYTES_A_PAGE);
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('Approved');
  expect(await record('cv', '888-001')).toBeNull();
  await app.open('/');
  await expect(fundsTile(screen, 0)).toBeVisible();

  // HR is told, opens it, and can save the same paper.
  await browser.setViewport({ width: 1280, height: 800 });
  await signInElsewhere(app, screen, hr);
  await expect(screen.getByText('RF-2026-0001 was approved; open it to print or save its fund transfer request.')).toBeVisible();
  await app.open('/#funds');
  await screen.getByRole('table', 'Requests for funds').getByRole('cell', 'RF-2026-0001').tap();
  await expect(screen.getByRole('form', 'Viewing RF-2026-0001').getByRole('button', 'Export PDF')).toBeVisible();
  await expect(screen.getByRole('article', 'Fund transfer request RF-2026-0001')).toContainText('ACCOUNT NO. 0012 3456 7890');
});

test('firestore.rules let only the CEO decide a request, and staff read only their own', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');
  const [ownerToken, hrToken, itToken] = await Promise.all([owner, hr, it].map(idToken));
  const path = '/rf/RF-2026-0001';
  const request = (status: string, uid: string) => ({ body: JSON.stringify({ no: 'RF-2026-0001', status, uid }), status, uid });

  // HR files only as itself, and only waiting for a decision.
  expect(await asMember(hrToken, path, request('Approved', hr.uid))).toBe(403);
  expect(await asMember(hrToken, path, request('For Approval', it.uid))).toBe(403);
  expect(await asMember(hrToken, path, request('For Approval', hr.uid))).toBe(200);

  // Only HR and the CEO read it.
  expect(await asMember(itToken, path)).toBe(403);
  expect(await asMember(hrToken, path)).toBe(200);
  expect(await asMember(ownerToken, path)).toBe(200);

  // HR may not approve its own request, IT may not touch it, and the CEO decides it.
  expect(await asMember(hrToken, path, request('Approved', hr.uid))).toBe(403);
  expect(await asMember(itToken, path, request('Withdrawn', it.uid))).toBe(403);
  expect(await asMember(ownerToken, path, request('Approved', hr.uid))).toBe(200);

  // Decided, it stays decided for its requester: no edit, no withdrawing it.
  expect(await asMember(hrToken, path, request('For Approval', hr.uid))).toBe(403);
  expect(await asMember(hrToken, path, request('Withdrawn', hr.uid))).toBe(403);
  expect(await field('rf', 'RF-2026-0001', 'status')).toBe('Approved');
});
