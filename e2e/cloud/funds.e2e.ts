import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { asMember, emptyCloud, expectHome, field, idToken, keepRecordsHere, makeAccount, record, signIn } from './emulators';

// Requests for funds in the cloud (docs/adr/0011): staff ask, each on their own computer and seeing only their own
// requests; the owner decides them from a phone, and an approval drafts the check voucher through Check Vouchers. Then
// firestore.rules on their own, for a member who goes past Keystone: only the owner decides, and staff read only theirs.
// app.clearState() is another computer, signed out and empty.

test.beforeEach(async () => {
  await emptyCloud();
});

/** Signs in on a computer with nothing of its own, after the office computer moved the records in. */
async function signInElsewhere(app: { clearState(): Promise<void>; open(path: string): Promise<void> }, screen: Screen, account: Parameters<typeof signIn>[1]) {
  await app.clearState();
  await app.open('/');
  await signIn(screen, account);
  await expectHome(screen);
}

test('staff ask for funds, the owner decides from a phone, and the approved one becomes a voucher', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  // HR asks for the party's venue deposit. The requester is the member signed in, and only the owner may decide.
  await signInElsewhere(app, screen, hr);
  await app.open('/#funds');
  const form = screen.getByRole('form', 'New request');

  await expect(form.getByRole('textbox', 'Requested by')).toHaveValue('Ana Cruz');
  await expect(screen.getByText('Only the owner approves or declines requests. The answer shows here once it is given.')).toBeVisible();
  await form.getByRole('textbox', 'What it is for').fill('Christmas party: venue deposit');
  await form.getByRole('textbox', 'Amount').fill('48000');
  await form.getByRole('combobox', 'Payee').tap();
  await screen.getByRole('option', 'Manila Water Company (V-002)').tap();
  await form.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the owner for approval.')).toBeVisible();

  // The request is its own document, with its status and requester beside it for the rules.
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('For Approval');
  expect(await field('rf', 'RF-2026-0001', 'uid')).toBe(hr.uid);

  // IT sees none of HR's requests, and its own still takes the next number.
  await signInElsewhere(app, screen, it);
  await app.open('/#funds');
  await expect(screen.getByRole('heading', { name: 'Your requests', level: 2 })).toBeVisible();
  await expect(screen.getByText('No requests yet.')).toBeVisible();
  const mine = screen.getByRole('form', 'New request');

  await mine.getByRole('textbox', 'What it is for').fill('Replacement laptop charger');
  await mine.getByRole('textbox', 'Amount').fill('2450.50');
  await mine.getByRole('combobox', 'Settle').tap();
  await screen.getByRole('option', 'By a date').tap();
  await mine.getByRole('textbox', 'Settle by').fill('2026-11-20');
  await mine.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 sent to the owner for approval.')).toBeVisible();
  await expect.poll(() => field('rf', 'RF-2026-0002', 'uid'), { timeout: 10_000 }).toBe(it.uid);

  // The owner, on a phone, is told what waits, opens the screen from the menu, approves one and declines the other.
  await app.clearState();
  await browser.setViewport({ width: 390, height: 844 });
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await expect(screen.getByText('2 requests for funds worth ₱50,450.50 wait for your decision, 1 of them ASAP.')).toBeVisible();

  await screen.getByRole('button', 'Menu').tap();
  await screen.getByRole('dialog', 'Keystone').getByRole('button', /Requests for Funds$/).tap();
  const party = screen.getByRole('article', 'RF-2026-0001');

  await expect(party).toContainText('₱48,000.00');
  await expect(party).toContainText('Ana Cruz on Nov 2, 2026');
  await party.getByRole('button', 'Approve').tap();
  await screen.getByRole('alertdialog', 'Approve RF-2026-0001?').getByRole('button', 'Approve').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 approved. 8888-001 is drafted for accounting.')).toBeVisible();

  const charger = screen.getByRole('article', 'RF-2026-0002');

  await charger.getByRole('textbox', 'Note to the requester').fill('Use the spare in the IT cabinet');
  await charger.getByRole('button', 'Decline').tap();
  await screen.getByRole('alertdialog', 'Decline RF-2026-0002?').getByRole('button', 'Decline').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0002 declined.')).toBeVisible();
  await expect(screen.getByRole('region', 'Waiting for your decision')).toBeHidden();

  // The decisions and the voucher reach the cloud: accounting finds the voucher For Approval, naming the request.
  await expect.poll(() => field('rf', 'RF-2026-0001', 'status'), { timeout: 10_000 }).toBe('Approved');
  await expect.poll(() => record('cv', '8888-001'), { timeout: 10_000 }).toMatchObject({
    payee: 'V-002', status: 'For Approval', check: '', lines: [{ desc: 'Christmas party: venue deposit (RF-2026-0001)', amt: 48000 }],
  });
  await expect.poll(() => field('rf', 'RF-2026-0002', 'status'), { timeout: 10_000 }).toBe('Declined');

  // Each requester sees their own answer the next time Keystone opens.
  await signInElsewhere(app, screen, hr);
  await expect(screen.getByText('RF-2026-0001 was approved; 8888-001 is drafted.')).toBeVisible();

  await signInElsewhere(app, screen, it);
  await expect(screen.getByText('RF-2026-0002 was declined: Use the spare in the IT cabinet.')).toBeVisible();
});

test('firestore.rules let only the owner decide a request, and staff read only their own', async () => {
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

  // Only HR and the owner read it.
  expect(await asMember(itToken, path)).toBe(403);
  expect(await asMember(hrToken, path)).toBe(200);
  expect(await asMember(ownerToken, path)).toBe(200);

  // HR may not approve its own request, IT may not touch it, and the owner decides it.
  expect(await asMember(hrToken, path, request('Approved', hr.uid))).toBe(403);
  expect(await asMember(itToken, path, request('Withdrawn', it.uid))).toBe(403);
  expect(await asMember(ownerToken, path, request('Approved', hr.uid))).toBe(200);

  // Decided, it stays decided for its requester: no edit, no withdrawing it.
  expect(await asMember(hrToken, path, request('For Approval', hr.uid))).toBe(403);
  expect(await asMember(hrToken, path, request('Withdrawn', hr.uid))).toBe(403);
  expect(await field('rf', 'RF-2026-0001', 'status')).toBe('Approved');
});
