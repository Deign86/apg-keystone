import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { documentIds, emptyCloud, expectHome, keepRecordsHere, makeAccount, marker, record, signIn } from './emulators';

// The records in the cloud (apps/keystone/src/platform/cloud.ts, firestore.ts; docs/adr/0009): the first computer
// moves its records in, every change is written as the documents it touched, even one the page reloads on before the
// cloud has it (pending.ts, docs/adr/0013), and any computer opens the same records.
// app.restart() reopens Keystone on the same computer; app.clearState() is another computer, signed out and empty.

test.beforeEach(async () => {
  await emptyCloud();
});

test('moves this computer\'s records in on the first sign-in, one document per record', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  // The records are this computer's: the sample's 6 log entries and the one naming it.
  await app.open('/#activity');
  await expect(screen.getByText('7 entries. The last was on Oct 30, 2026.')).toBeVisible();
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('Records kept on the office computer.');

  expect(await marker('status')).toBe('ready');
  expect(await marker('by')).toBe(owner.uid);
  expect(await documentIds('cv')).toEqual(['CV-2026-0139', 'CV-2026-0140', 'CV-2026-0141']);
  expect(await documentIds('bs')).toEqual(['010097-2026', '010098-2026', '010099-2026']);
  expect(await documentIds('log')).toHaveLength(7);
});

test('writes each change to the cloud, stays signed in when reopened, and another computer opens the same records', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');
  const staff = await makeAccount('staff');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888-001 saved and routed for approval.')).toBeVisible();

  // The new voucher and its log entry reach the cloud; the other vouchers are not written again.
  await expect.poll(() => record('cv', '888-001'), { timeout: 10_000 }).toMatchObject({ no: '888-001', status: 'For Approval' });
  await expect.poll(async () => (await documentIds('log')).length, { timeout: 10_000 }).toBe(8);
  expect(await documentIds('cv')).toEqual(['888-001', 'CV-2026-0139', 'CV-2026-0140', 'CV-2026-0141']);

  // Reopened on the same computer: still signed in, and the voucher is there.
  await app.restart();
  await app.open('/#vouchers');
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888-001 .* For Approval/)).toBeVisible({ timeout: 15_000 });

  // Another computer: signed out, with no records of its own. A staff member signs in and sees the owner's voucher.
  await app.clearState();
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();
  await signIn(screen, staff);
  await expectHome(screen);

  await app.open('/#vouchers');
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^888-001 .* ₱1,250\.50 For Approval/)).toBeVisible();

  // The staff member's change reaches the cloud too (firestore.rules lets members write records).
  await register.getByRole('button', 'Actions for 888-001').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(register.getByRole('row', /^888-001 /).getByRole('cell', 'Approved')).toBeVisible();
  await expect.poll(() => record('cv', '888-001'), { timeout: 10_000 }).toMatchObject({ status: 'Approved' });
});

test('a second computer opens the cloud\'s records, never moving its own over them', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  // A laptop that kept records of its own signs in after the office computer moved its records in.
  await app.clearState();
  await keepRecordsHere(app, browser, 'the laptop');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#activity');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries.first()).toContainText('Records kept on the office computer.');
  await expect(screen.getByText('Records kept on the laptop.', { exact: false })).toBeHidden();
  expect(await documentIds('log')).toHaveLength(7);
});

test('a change made just before a reload reaches the cloud, and is there when Keystone reopens', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
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
