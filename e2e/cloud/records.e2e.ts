import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { asMember, documentIds, emptyCloud, expectHome, idToken, keepRecordsHere, makeAccount, marker, record, recordsInCloud, saveElsewhere, signIn } from './emulators';

// The records in the cloud (apps/keystone/src/platform/cloud.ts, firestore.ts; docs/adr/0009), their only source
// (docs/adr/0018): the CEO's first sign-in starts them empty and nothing a computer holds is ever copied in, every
// change is written as the documents it touched, even one the page reloads on before the cloud has it (pending.ts,
// docs/adr/0013), and any computer opens the same records. Most tests start with the sample records already saved in
// the cloud (recordsInCloud). app.restart() reopens Keystone on the same computer; app.clearState() is another
// computer, signed out and empty.

test.beforeEach(async () => {
  await emptyCloud();
});

test('the CEO\'s first sign-in starts the records empty, copying in nothing this computer holds', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  // Nothing of this computer's: no records and no log. The company itself is built in (docs/adr/0023), so Home asks
  // for nothing.
  await expect(screen.getByText(/^Fill in Company Details/)).toBeHidden();
  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByText('No activity yet.')).toBeVisible();

  expect(await marker('status')).toBe('ready');
  expect(await marker('by')).toBe(owner.uid);

  for (const list of ['dir', 'cv', 'bs', 'ids', 'log', 'ext', 'company']) expect(await documentIds(list)).toEqual([]);

  // What the CEO then saves is what the cloud holds: what documents start from, a document of its own.
  await app.open('/#company');
  const form = screen.getByRole('form', 'Company details');

  await form.getByRole('textbox', 'Audited by').fill('Accounting');
  await form.getByRole('button', 'Save company details').tap();
  await expect(screen.getByRole('dialog', 'Company details saved.')).toBeVisible();
  await expect.poll(() => record('company', 'details'), { timeout: 10_000 }).toMatchObject({ checkedBy: 'Accounting', dueInDays: 0 });
});

test('writes each change to the cloud, stays signed in when reopened, and another computer opens the same records', async ({ app, screen }) => {
  const owner = await makeAccount('owner');
  const staff = await makeAccount('staff');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#vouchers');
  // The form is on its own tab, beside the register.
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  // The CEO's own voucher needs nobody's approval: it is approved as it is saved.
  await form.getByRole('button', 'Save and approve').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and approved.')).toBeVisible();

  // The new voucher and its log entry reach the cloud; the other vouchers are not written again.
  await expect.poll(() => record('cv', '888-001'), { timeout: 10_000 }).toMatchObject({ no: '888-001', status: 'Approved' });
  await expect.poll(async () => (await documentIds('log')).length, { timeout: 10_000 }).toBe(8);
  expect(await documentIds('cv')).toEqual(['888-001', 'CV-2026-0139', 'CV-2026-0140', 'CV-2026-0141']);

  // Reopened on the same computer: still signed in, and the voucher is there.
  await app.restart();
  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 .* Approved/)).toBeVisible({ timeout: 15_000 });

  // Another computer: signed out, with no records of its own. A staff member signs in and sees the CEO's voucher.
  await app.clearState();
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();
  await signIn(screen, staff);
  await expectHome(screen);

  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^888-001 .* ₱1,250\.50 Approved/)).toBeVisible();

  // The staff member's change reaches the cloud too (firestore.rules lets members write records): the check, written
  // after the CEO approved the voucher.
  await register.getByRole('cell', '888-001').tap();
  const approved = screen.getByRole('form', 'Editing 888-001');

  await approved.getByRole('textbox', 'Check No.').fill('0004530');
  await approved.getByRole('button', 'Save changes').tap();
  await expect.poll(() => record('cv', '888-001'), { timeout: 10_000 }).toMatchObject({ status: 'Approved', check: '0004530' });

  // A staff member's own voucher still waits for the CEO's approval.
  await screen.getByRole('button', 'New voucher').tap();
  const mine = screen.getByRole('form', 'New voucher');

  await mine.getByRole('textbox', 'Payee').fill('Manila Water Company');
  await mine.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await mine.getByRole('textbox', 'Line 1 amount').fill('980');
  await mine.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-002 saved and routed for approval.')).toBeVisible();
  await expect.poll(() => record('cv', '888-002'), { timeout: 10_000 }).toMatchObject({ status: 'For Approval' });
});

test('a computer with records of its own opens the cloud\'s, never copying its own over them', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await recordsInCloud();
  // A laptop that kept records of its own signs in.
  await keepRecordsHere(app, browser, 'the laptop');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#activity');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries.first()).toContainText('Records kept in the cloud.');
  await expect(screen.getByText('Records kept on the laptop.', { exact: false })).toBeHidden();
  expect(await documentIds('log')).toHaveLength(7);
});

test('firestore.rules let only the CEO change the company\'s details, and every member read them', async () => {
  await recordsInCloud();
  const owner = await idToken(await makeAccount('owner'));
  const staff = await idToken(await makeAccount('staff'));
  const outsider = await idToken(await makeAccount());
  const body = JSON.stringify({ name: 'Somebody Else', paymentInstructions: 'Account Number: 0000 0000 00' });

  expect(await asMember(staff, '/company/details')).toBe(200);
  expect(await asMember(outsider, '/company/details')).toBe(403);
  expect(await asMember(staff, '/company/details', { body })).toBe(403);
  expect(await record('company', 'details')).toMatchObject({ name: 'ALPHA PREMIER GROUP OF COMPANIES OPC' });
  expect(await asMember(owner, '/company/details', { body })).toBe(200);
  expect(await record('company', 'details')).toMatchObject({ name: 'Somebody Else' });
});

test('a change made just before a reload reaches the cloud, and is there when Keystone reopens', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#banks');
  await screen.getByRole('button', 'Add account').tap();
  const dialog = screen.getByRole('dialog', 'Add account');

  await dialog.getByRole('textbox', 'Bank').fill('BDO');
  await dialog.getByRole('textbox', 'Account name').fill('Alpha Premier Group of Companies OPC');
  await dialog.getByRole('textbox', 'Account number').fill('0012 3456 7890');
  await dialog.getByRole('button', 'Add account').tap();
  await expect(screen.getByRole('dialog', 'B-002 added.')).toBeVisible();

  // Reloaded at once, before the change has had time to reach the cloud.
  await browser.reload();

  await expect(screen.getByRole('table', 'Bank accounts').getByRole('row', /^B-002 BDO /)).toBeVisible({ timeout: 15_000 });
  // In the cloud: the accounts, B-002 with them, and the Activity Log entry for it.
  await expect.poll(() => record('ext', 'banks'), { timeout: 10_000 }).toMatchObject({
    module: 'banks',
    data: { accounts: [{ id: 'B-001' }, { id: 'B-002', bank: 'BDO', number: '0012 3456 7890' }] },
  });
  await expect.poll(async () => (await documentIds('log')).length, { timeout: 10_000 }).toBe(8);

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('B-002 BDO');
});

test('shows what another computer saves as it is saved, without reopening, and keeps a change made here', async ({ app, screen }) => {
  const owner = await makeAccount('owner');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^CV-2026-0141 .*For Approval/)).toBeVisible();

  // Someone else approves CV-2026-0141 and deletes CV-2026-0140: this screen follows at once.
  const waiting = await record('cv', 'CV-2026-0141');

  await saveElsewhere('cv', 'CV-2026-0141', { ...waiting, status: 'Approved' });
  await expect(register.getByRole('row', /^CV-2026-0141 .*Approved/)).toBeVisible({ timeout: 10_000 });
  await saveElsewhere('cv', 'CV-2026-0140', null);
  await expect(register.getByRole('row', /^CV-2026-0140 /)).toBeHidden({ timeout: 10_000 });

  // A save made here after that is written over what the cloud holds now, and brings back nothing deleted elsewhere.
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Water Company');
  await form.getByRole('textbox', 'Line 1 description').fill('Water bill');
  await form.getByRole('textbox', 'Line 1 amount').fill('980');
  await form.getByRole('button', 'Save and approve').tap();
  await expect.poll(() => documentIds('cv'), { timeout: 10_000 }).toEqual(['888-001', 'CV-2026-0139', 'CV-2026-0141']);
  expect(await record('cv', 'CV-2026-0141')).toMatchObject({ status: 'Approved' });
});
