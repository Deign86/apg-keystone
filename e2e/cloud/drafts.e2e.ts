import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { deafToLeaving } from '../support/force-close';
import { asMember, deleteAsMember, documentIds, emptyCloud, expectHome, field, idToken, makeAccount, recordsInCloud, signIn } from './emulators';

// Saved drafts in the cloud (docs/adr/0041): a voucher's draft is shared with every member, like the vouchers
// themselves; a request for funds' draft is kept to whoever wrote it, like the requests, and the CEO. Then
// firestore.rules on their own, for a member who goes past Keystone. app.clearState() is another computer, signed out.

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

test('a request\'s draft stays with its author on any computer, and a voucher\'s draft is everyone\'s', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  // HR starts a request and a voucher, and saves both as drafts.
  await signInElsewhere(app, screen, hr);
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const request = screen.getByRole('form', 'New request');

  await request.getByRole('textbox', 'What it is for').fill('Pantry, November');
  await request.getByRole('textbox', 'Line 1 description').fill('Coffee and sugar');
  await request.getByRole('textbox', 'Line 1 amount').fill('1550.50');
  await request.getByRole('button', 'Save draft').tap();
  await expect(screen.getByRole('dialog', 'Draft saved. Open it again from Drafts.')).toBeVisible();

  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const voucher = screen.getByRole('form', 'New voucher');

  await voucher.getByRole('textbox', 'Payee').fill('Manila Water Company');
  await voucher.getByRole('textbox', 'Line 1 description').fill('Water, October');
  await voucher.getByRole('textbox', 'Line 1 amount').fill('2400');
  // The request's "Draft saved" may still show; the voucher's draft is checked in the cloud below.
  await voucher.getByRole('button', 'Save draft').tap();

  // Each is a document of its own; the request's names HR beside it, for the rules.
  await expect.poll(() => documentIds('mydrafts'), { timeout: 10_000 }).toEqual([`${hr.uid}-funds-1`]);
  expect(await field('mydrafts', `${hr.uid}-funds-1`, 'uid')).toBe(hr.uid);
  await expect.poll(() => documentIds('drafts'), { timeout: 10_000 }).toEqual([`${hr.uid}-vouchers-1`]);

  // IT sees HR's voucher draft, and none of HR's requests or their drafts.
  await signInElsewhere(app, screen, it);
  await app.open('/#vouchers');
  await expect(screen.getByRole('list', 'Drafts').getByRole('listitem', 'MANILA WATER COMPANY · ₱2,400.00')).toContainText('by Ana Cruz');
  await app.open('/#funds');
  await expect(screen.getByRole('list', 'Drafts')).toBeHidden();

  // The CEO, who reads every request, sees only their own drafts too.
  await signInElsewhere(app, screen, owner);
  await app.open('/#funds');
  await expect(screen.getByRole('list', 'Drafts')).toBeHidden();

  // HR, on yet another computer, opens the draft and sends it.
  await signInElsewhere(app, screen, hr);
  await app.open('/#funds');
  await screen.getByRole('list', 'Drafts').getByRole('listitem', 'Pantry, November · ₱1,550.50').getByRole('button', 'Open').tap();
  const opened = screen.getByRole('form', 'New request');

  await expect(opened.getByRole('textbox', 'Line 1 amount')).toHaveValue('1550.50');
  await opened.getByRole('combobox', 'Paid by').tap();
  await screen.getByRole('option', 'Check').tap();
  await opened.getByRole('combobox', 'Payee').tap();
  await screen.getByRole('option', 'Manila Water Company (V-002)').tap();
  await opened.getByRole('button', 'Send for approval').tap();
  await expect(screen.getByRole('dialog', 'RF-2026-0001 sent to the CEO for approval.')).toBeVisible();
  await expect.poll(() => documentIds('mydrafts'), { timeout: 10_000 }).toEqual([]);
});

test('firestore.rules keep a private draft to its author and the CEO, and share the others with every member', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');
  const [ownerToken, hrToken, itToken] = await Promise.all([owner, hr, it].map(idToken));
  const mine = `/mydrafts/${hr.uid}-funds-1`;
  const draft = (uid: string) => ({ body: JSON.stringify({ id: `${hr.uid}-funds-1`, module: 'funds', title: 'Pantry', body: {} }), uid });

  // HR saves a private draft only as itself, and nothing else beside it.
  expect(await asMember(hrToken, mine, draft(it.uid))).toBe(403);
  expect(await asMember(hrToken, mine, { ...draft(hr.uid), status: 'Draft' })).toBe(403);
  expect(await asMember(hrToken, mine, draft(hr.uid))).toBe(200);

  // Only HR and the CEO read it; IT may not save over it, give it away, or delete it.
  expect(await asMember(itToken, mine)).toBe(403);
  expect(await asMember(hrToken, mine)).toBe(200);
  expect(await asMember(ownerToken, mine)).toBe(200);
  expect(await asMember(itToken, mine, draft(it.uid))).toBe(403);
  expect(await asMember(hrToken, mine, draft(it.uid))).toBe(403);
  expect(await deleteAsMember(itToken, mine)).toBe(403);
  expect(await deleteAsMember(hrToken, mine)).toBe(200);

  // A shared draft: any member reads, saves over and deletes it, and it holds only its body.
  const shared = `/drafts/${hr.uid}-vouchers-1`;
  const body = { body: JSON.stringify({ id: `${hr.uid}-vouchers-1`, module: 'vouchers', title: 'Meralco', body: {} }) };

  expect(await asMember(hrToken, shared, { ...body, uid: hr.uid })).toBe(403);
  expect(await asMember(hrToken, shared, body)).toBe(200);
  expect(await asMember(itToken, shared)).toBe(200);
  expect(await asMember(itToken, shared, body)).toBe(200);
  expect(await deleteAsMember(itToken, shared)).toBe(200);
});

// A force close warns the page of nothing. In the cloud the draft kept while typing goes to Firestore's copy on this
// computer and to the cloud at once, and Keystone opened again reads it back under Drafts.
test('a draft typed steadily, with Keystone killed straight after, comes back from the cloud', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await signInElsewhere(app, screen, hr);

  // Killed, the page hears nothing (e2e/support/force-close.ts).
  await deafToLeaving(browser);
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  await screen.getByRole('form', 'New voucher').getByRole('textbox', 'Payee').pressSequentially('Manila Water Company', { delay: 110 });
  await browser.evaluate(() => { location.reload(); });

  await expect(screen.getByRole('list', 'Drafts').getByRole('listitem', /^MANILA WATER/)).toContainText('by Ana Cruz');
  await expect.poll(() => documentIds('drafts'), { timeout: 10_000 }).toEqual([`${hr.uid}-vouchers-1`]);
});
