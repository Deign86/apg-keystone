import { readFile } from 'node:fs/promises';
import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { asMember, deleteAsMember, documentIds, emptyCloud, setMemberBankAs, expectHome, field, idToken, makeAccount, record, recordsInCloud, signIn } from './emulators';
import { expectCleanPdf, PDF_MOST_BYTES_A_PAGE, paperInks, readPdf } from '../support/paper';

// Requests for funds in the cloud (docs/adr/0011, 0021, 0051): staff ask, each on their own computer, and every member
// sees every request; the CEO decides them from a phone. Approving a check drafts the check voucher through Check
// Vouchers; approving a transfer makes the fund transfer request, which the CEO and the requester print or save as a
// PDF. Then firestore.rules on their own, for a member who goes past Keystone: every member reads every request, only
// the CEO decides or deletes one, and only its requester changes it. app.clearState() is another computer, signed out
// and empty.

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

  // IT sees HR's request, and opens it to read but not to change. Its own takes the next number.
  await signInElsewhere(app, screen, it);
  await app.open('/#funds');
  await screen.getByRole('tab', /^Requests/).tap();
  await screen.getByRole('table', 'Requests for funds').getByRole('cell', 'RF-2026-0001').tap();
  const others = screen.getByRole('form', 'Viewing RF-2026-0001');

  await expect(others).toContainText('Only Ana Cruz can change RF-2026-0001.');
  await expect(others.getByRole('textbox', 'Line 1 amount')).toHaveValue('48000');
  await expect(others.getByRole('button', 'Withdraw…')).toBeHidden();
  await others.getByRole('button', 'New request').tap();
  const mine = screen.getByRole('form', 'New request');

  await mine.getByRole('textbox', 'What it is for').fill('Replacement laptop charger');
  await mine.getByRole('textbox', 'Line 1 description').fill('Laptop charger');
  await mine.getByRole('textbox', 'Line 1 amount').fill('2450.50');
  await mine.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await mine.getByRole('combobox', 'Deadline').tap();
  await screen.getByRole('option', 'By a date').tap();
  await mine.getByRole('textbox', 'Deadline date').fill('2026-11-20');
  await mine.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 sent to the CEO for approval.')).toBeVisible();
  await expect.poll(() => field('rf', 'RF-2026-0002', 'uid'), { timeout: 10_000 }).toBe(it.uid);

  // IT's Home counts both requests waiting, HR's too.
  await app.open('/');
  await expect(fundsTile(screen, 2)).toBeVisible();

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
  await expect(screen.getByRole('dialog', 'RF-2026-0001 approved. 888001 is drafted for accounting.')).toBeVisible();

  const charger = screen.getByRole('article', 'RF-2026-0002');

  await charger.getByRole('textbox', 'Note to the requester').fill('Use the spare in the IT cabinet');
  await charger.getByRole('button', 'Decline').tap();
  await screen.getByRole('alertdialog', 'Decline RF-2026-0002?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Decline RF-2026-0002?').getByRole('button', 'Decline').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 declined.')).toBeVisible();
  await expect(screen.getByRole('region', 'Waiting for your decision')).toBeHidden();

  // The decisions and the voucher reach the cloud: accounting finds the voucher For Approval, naming the request.
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('Approved');
  await expect.poll(() => record('cv', '888001'), { timeout: 10_000 }).toMatchObject({
    payee: 'MANILA WATER COMPANY', address: 'MWSS Compound, Quezon City', status: 'For Approval', check: '', lines: [{ desc: 'Christmas party: venue deposit (RF-2026-0001)', amt: 48000 }],
  });
  await expect.poll(() => field('rf', 'RF-2026-0002', 'status'), { timeout: 10_000 }).toBe('Declined');

  // Decided, neither waits any more: the CEO's Home tile counts none.
  await app.open('/');
  await expect(fundsTile(screen, 0)).toBeVisible();

  // Each requester sees their own answer the next time Keystone opens, and nothing of theirs still waits.
  await signInElsewhere(app, screen, hr);
  await expect(screen.getByText('RF-2026-0001 was approved; 888001 is drafted. Upload its receipts once the money is spent.')).toBeVisible();
  await expect(fundsTile(screen, 0)).toBeVisible();

  await signInElsewhere(app, screen, it);
  await expect(screen.getByText('RF-2026-0002 was declined: Use the spare in the IT cabinet.')).toBeVisible();
  await expect(fundsTile(screen, 0)).toBeVisible();

  // The CEO deletes the declined request, and it leaves the cloud (docs/adr/0051).
  await browser.setViewport({ width: 1280, height: 800 });
  await signInElsewhere(app, screen, owner);
  await app.open('/#funds');
  await screen.getByRole('tab', /^Requests/).tap();
  await screen.getByRole('table', 'Requests for funds').getByRole('button', 'Actions for RF-2026-0002').tap();
  await screen.getByRole('menuitem', 'Delete…').tap();
  await screen.getByRole('alertdialog', 'Delete RF-2026-0002?').getByRole('checkbox', 'I understand this can’t be undone').tap();
  await screen.getByRole('alertdialog', 'Delete RF-2026-0002?').getByRole('button', 'Delete').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 deleted.')).toBeVisible();
  await expect.poll(() => field('rf', 'RF-2026-0002', 'status'), { timeout: 10_000 }).toBeNull();
  expect(await field('rf', 'RF-2026-0001', 'status')).toBe('Approved');
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

  const inks = await paperInks(browser);

  const pdf = await browser.waitForDownload(async () => {
    await viewing.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved RF-2026-0001 fund transfer request.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  expect(pdf.suggestedFilename).toBe('RF-2026-0001 fund transfer request.pdf');
  const bytes = await readFile(pdf.absolutePath);

  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // Drawn as text and shapes: a few hundred kilobytes a page, not the tens of megabytes of raw pixels.
  expect(bytes.length).toBeLessThan(PDF_MOST_BYTES_A_PAGE);
  // Its expense and amount are text a PDF reader finds (docs/adr/0048), not a picture of the page.
  const pages = await readPdf(bytes);
  const read = pages.map((p) => p.text).join(' ');

  // As clean as the paper: each border once, in its colour, no seam, no frame (docs/adr/0048, "Every exported PDF").
  expectCleanPdf(pages, inks);

  expect(read).toContain('Pantry groceries');
  expect(read).toContain('₱3,250.75');
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('Approved');
  expect(await record('cv', '888001')).toBeNull();
  await app.open('/');
  await expect(fundsTile(screen, 0)).toBeVisible();

  // HR is told, opens it, and can save the same paper.
  await browser.setViewport({ width: 1280, height: 800 });
  await signInElsewhere(app, screen, hr);
  await expect(screen.getByText('RF-2026-0001 was approved; open it to print or save its fund transfer request, and upload its receipts once the money is spent.')).toBeVisible();
  await app.open('/#funds');
  await screen.getByRole('table', 'Requests for funds').getByRole('cell', 'RF-2026-0001').tap();
  await expect(screen.getByRole('form', 'Viewing RF-2026-0001').getByRole('button', 'Export PDF')).toBeVisible();
  await expect(screen.getByRole('article', 'Fund transfer request RF-2026-0001')).toContainText('ACCOUNT NO. 0012 3456 7890');

  // Once the money is spent, HR uploads the receipt, and that marks the request paid (docs/adr/0050).
  const receipts = screen.getByRole('region', 'Receipts');

  await expect(receipts).toContainText('Once the money is spent, upload the receipt or other proof of each expense, a photo or a PDF.');
  await expect(receipts.getByRole('button', 'Mark paid…')).toBeDisabled();
  await receipts.getByRole('button', 'Add receipt…').setInputFiles('shared/logo.png');
  await expect(receipts.getByRole('list', 'Receipts for RF-2026-0001')).toContainText('logo.jpg');
  await receipts.getByRole('button', 'Mark paid…').tap();
  await screen.getByRole('alertdialog', 'Mark RF-2026-0001 paid?').getByRole('button', 'Mark paid').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 is paid. 1 receipt kept with it.')).toBeVisible();
  await expect(receipts).toContainText('Paid on Nov 2, 2026, with 1 receipt from Ana Cruz.');
  await expect(receipts.getByRole('button', 'Add receipt…')).toBeHidden();
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('Paid');
  await expect.poll(async () => (await record('rf', 'RF-2026-0001'))?.receipts, { timeout: 10_000 }).toEqual([{ name: 'logo.jpg', data: expect.stringMatching(/^data:image\/jpeg;base64,/) }]);
  // The paper still carries the approval, and says when it was paid.
  await expect(screen.getByRole('article', 'Fund transfer request RF-2026-0001')).toContainText('Approved in Keystone by Mark Reyes on November 2, 2026 at 10:00. Paid on November 2, 2026 at 10:00.');
  await screen.getByRole('tab', /^Requests/).tap();
  await expect(screen.getByRole('table', 'Requests for funds').getByRole('row', /^RF-2026-0001 .* Processing Paid/)).toBeVisible();

  // The CEO sees it paid, and saves the receipt.
  await signInElsewhere(app, screen, owner);
  await app.open('/#funds');
  await screen.getByRole('table', 'Requests for funds').getByRole('cell', 'RF-2026-0001').tap();
  const kept = screen.getByRole('region', 'Receipts');

  await expect(kept).toContainText('Paid on Nov 2, 2026, with 1 receipt from Ana Cruz.');

  const saved = await browser.waitForDownload(async () => {
    await kept.getByRole('button', 'Save logo.jpg').tap();
  });

  expect(saved.suggestedFilename).toBe('logo.jpg');
  expect((await readFile(saved.absolutePath)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
});

test('a staff member keeps their bank account on Profile, and their next request by transfer starts with it', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  // HR saves the account its fund is kept in, once, on Profile (docs/adr/0052).
  await signInElsewhere(app, screen, hr);
  await app.open('/#profile');
  const bank = screen.getByRole('form', 'Your bank account');

  await expect(bank).toContainText('None saved yet.');
  const logged = (await documentIds('log')).length;

  await bank.getByRole('textbox', 'Bank').fill('BDO');
  await bank.getByRole('textbox', 'Account name').fill('Liza Ramos');
  await bank.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await bank.getByRole('button', 'Save bank account').tap();
  await expect(screen.getByRole('dialog', 'Your requests for funds by transfer start with this account from now on.')).toBeVisible();
  await expect(bank).toContainText('Saved with your sign-in.');
  // Its log line reaches the cloud before she moves on.
  await expect.poll(async () => (await documentIds('log')).length, { timeout: 10_000 }).toBe(logged + 1);

  // A new request starts with it, saying where it came from.
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await expect(form.getByRole('textbox', 'Bank')).toHaveValue('BDO');
  await expect(form.getByRole('textbox', 'Account name')).toHaveValue('Liza Ramos');
  await expect(form.getByRole('textbox', 'Account number')).toHaveValue('0012 3456 7890');
  await expect(form).toContainText('Filled in from your bank account on Profile.');

  // On another computer, it is still hers: it is kept with her sign-in, not on this computer.
  await signInElsewhere(app, screen, hr);
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  await expect(screen.getByRole('form', 'New request').getByRole('textbox', 'Account number')).toHaveValue('0012 3456 7890');

  // The log says she saved it, never the account.
  await app.open('/#activity');
  const entries = screen.getByRole('region', 'Entries');

  await expect(entries.getByRole('listitem').first()).toContainText('Ana Cruz saved their bank account.');
  await expect(entries).not.toContainText('0012 3456 7890');
});

test('firestore.rules let a member keep only their own bank account, and only a proper one', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');
  const [ownerToken, hrToken, itToken] = await Promise.all([owner, hr, it].map(idToken));
  const own = { bank: 'BDO', branch: 'Ortigas', name: 'Ana Cruz', number: '0012 3456 7890' };

  // HR keeps its own, and removes it; IT may not touch HR's, so nobody else can send HR's money elsewhere.
  expect(await setMemberBankAs(hrToken, hr.uid, own)).toBe(200);
  expect(await setMemberBankAs(itToken, hr.uid, { ...own, name: 'Paolo Santos' })).toBe(403);
  expect(await setMemberBankAs(hrToken, hr.uid, null)).toBe(200);

  // Only a proper account, and never with a role or anything else.
  expect(await setMemberBankAs(hrToken, hr.uid, { bank: 'BDO', name: 'Ana Cruz' })).toBe(403);
  expect(await setMemberBankAs(hrToken, hr.uid, { ...own, note: 'x' })).toBe(403);
  expect(await setMemberBankAs(hrToken, hr.uid, own, { role: 'owner' })).toBe(403);

  // The CEO may change anyone's.
  expect(await setMemberBankAs(ownerToken, hr.uid, own)).toBe(200);
});

test('firestore.rules let every member read a request, only the CEO decide or delete it, and only its requester change it', async () => {
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

  // Every member reads it, IT too (docs/adr/0051).
  expect(await asMember(itToken, path)).toBe(200);
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

  // Approved, only HR marks it paid (docs/adr/0050), changing nothing beside the body but its status: not the requester,
  // not the decision. IT may not mark HR's paid.
  const decided = { decision: { by: 'Mark Reyes', uid: owner.uid, at: '2026-11-02 10:00' } };

  expect(await asMember(ownerToken, path, request('Approved', hr.uid), decided)).toBe(200);
  expect(await asMember(itToken, path, request('Paid', hr.uid), decided)).toBe(403);
  expect(await asMember(hrToken, path, request('Paid', it.uid), decided)).toBe(403);
  expect(await asMember(hrToken, path, request('Paid', hr.uid), { decision: { ...decided.decision, by: 'Ana Cruz' } })).toBe(403);
  expect(await asMember(hrToken, path, request('Paid', hr.uid))).toBe(403);
  expect(await asMember(hrToken, path, request('Paid', hr.uid), decided)).toBe(200);
  expect(await field('rf', 'RF-2026-0001', 'status')).toBe('Paid');

  // Paid, it stays paid for HR.
  expect(await asMember(hrToken, path, request('Approved', hr.uid), decided)).toBe(403);
  expect(await asMember(hrToken, path, request('For Approval', hr.uid))).toBe(403);

  // Only the CEO deletes it: not its requester, not anyone else.
  expect(await deleteAsMember(hrToken, path)).toBe(403);
  expect(await deleteAsMember(itToken, path)).toBe(403);
  expect(await deleteAsMember(ownerToken, path)).toBe(200);
  expect(await field('rf', 'RF-2026-0001', 'status')).toBeNull();
});
