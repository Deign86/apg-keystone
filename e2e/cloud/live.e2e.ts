import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import type { Page } from 'playwright-core';
import { anotherComputer } from './another-computer';
import { emptyCloud, expectHome, makeAccount, record, recordsInCloud, saveElsewhere, setMember, signIn } from './emulators';

// Live updates (apps/keystone/src/platform/firestore.ts, cloud.ts; docs/adr/0049): two people, each with Keystone open on
// their own computer, signed in to the same records. What one saves appears on the other's screen without reopening
// Keystone, with a quiet word naming who saved it and a mark on the screen it changed; a record the other has open in a
// form is not changed under them, the form says so; and a computer that was offline catches up when it is back. The
// test's browser is Mark, the CEO; anotherComputer() is Ana, on staff.

test.beforeEach(async () => {
  await emptyCloud();
});

/** Saves a new voucher on Ana's computer, from Check Vouchers' form, routed for approval as a staff member's is. */
async function anaSavesVoucher(page: Page, payee: string, amount: string) {
  await page.getByRole('tab', { name: /^Voucher entry/ }).click();
  const form = page.getByRole('form', { name: 'New voucher' });

  await form.getByRole('combobox', { name: 'Payee' }).fill(payee);
  await form.getByRole('combobox', { name: 'Line 1 description' }).fill('Water bill');
  await form.getByRole('textbox', { name: 'Line 1 amount' }).fill(amount);
  await form.getByRole('button', { name: 'Save and route for approval' }).click();
}

/** Opens a screen on Ana's computer by its address, as the rail does. */
const anaOpens = (page: Page, id: string) => page.goto(`${new URL(page.url()).origin}/#${id}`);

test('a voucher one person saves appears on the other\'s Keystone as it is saved, saying who saved it', async ({ app, screen, browser }) => {
  const mark = await makeAccount('owner', 'Mark Reyes');
  const ana = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, mark);
  await expectHome(screen);

  const anas = await anotherComputer(browser, ana);

  try {
    await anaOpens(anas.page, 'vouchers');
    await anaSavesVoucher(anas.page, 'Manila Water Company', '980');
    await anas.page.getByRole('dialog', { name: '888001 saved and routed for approval.' }).waitFor();

    // Mark, on Home, is told, and Check Vouchers is marked in the rail until he opens it.
    await expect(screen.getByRole('dialog', 'From Ana Cruz: 888001 for MANILA WATER COMPANY saved and routed for approval (₱980.00).')).toBeVisible({ timeout: 15_000 });
    const rail = screen.getByRole('navigation', 'Keystone');

    await rail.getByRole('button', 'Check Vouchers, changed by someone else').tap();
    await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^888001 .*MANILA WATER COMPANY .*₱980\.00 For Approval/)).toBeVisible();
    await expect(rail.getByRole('button', 'Check Vouchers, changed by someone else')).toBeHidden();

    // And the other way: the CEO's voucher, approved as he saves it, appears in Ana's register as it is, never reopened.
    await screen.getByRole('button', 'New voucher').tap();
    const form = screen.getByRole('form', 'New voucher');

    await form.getByRole('combobox', 'Payee').fill('Manila Electric Company');
    await form.getByRole('combobox', 'Line 1 description').fill('Electricity for November');
    await form.getByRole('textbox', 'Line 1 amount').fill('4200');
    await form.getByRole('button', 'Save and approve').tap();
    await expect(screen.getByRole('dialog', '888002 saved and approved.')).toBeVisible();

    await anas.page.getByRole('dialog', { name: /^From Mark Reyes: 888002 for MANILA ELECTRIC COMPANY saved and approved by Mark Reyes/ }).waitFor({ timeout: 15_000 });
    await anas.page.getByRole('tab', { name: /^Voucher register/ }).click();
    await anas.page.getByRole('table', { name: 'Voucher register' }).getByRole('row', { name: /^888002 .*MANILA ELECTRIC COMPANY .*Approved/ }).waitFor();

    // Nothing that arrived was written back: each voucher is in the cloud once, as its maker saved it.
    expect(await record('cv', '888001')).toMatchObject({ status: 'For Approval', payee: 'MANILA WATER COMPANY' });
    expect(await record('cv', '888002')).toMatchObject({ status: 'Approved', payee: 'MANILA ELECTRIC COMPANY' });
  } finally {
    await anas.close();
  }
});

test('a voucher open in a form that someone else changes stays as typed, and the form says so', async ({ app, screen, browser }) => {
  const mark = await makeAccount('owner', 'Mark Reyes');
  const ana = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, mark);
  await expectHome(screen);
  await app.open('/#vouchers');

  // Mark opens CV-2026-0141 and starts changing it.
  await screen.getByRole('table', 'Voucher register').getByRole('cell', 'CV-2026-0141').tap();
  const form = screen.getByRole('form', 'Editing CV-2026-0141');

  await form.getByRole('combobox', 'Line 1 description').fill('Retainer for November, revised');

  const anas = await anotherComputer(browser, ana);

  try {
    // Meanwhile Ana writes the check number on the same voucher and saves it.
    await anaOpens(anas.page, 'vouchers');
    await anas.page.getByRole('table', { name: 'Voucher register' }).getByRole('cell', { name: 'CV-2026-0141', exact: true }).click();
    const hers = anas.page.getByRole('form', { name: 'Editing CV-2026-0141' });

    await hers.getByRole('textbox', { name: 'Check No.' }).fill('0001190');
    await hers.getByRole('button', { name: 'Save changes' }).click();
    await anas.page.getByRole('dialog', { name: 'CV-2026-0141 updated.' }).waitFor();

    // Mark's form says so, and still holds what he typed.
    await expect(form.getByText(/^Someone else saved a change to CV-2026-0141 while it was open here\./)).toBeVisible({ timeout: 15_000 });
    await expect(form.getByRole('combobox', 'Line 1 description')).toHaveValue('Retainer for November, revised');
    await expect(form.getByRole('textbox', 'Check No.')).not.toHaveValue('0001190');
  } finally {
    await anas.close();
  }
});

test('a computer that was offline shows what was saved meanwhile once it is back, without reopening', async ({ app, screen, browser }) => {
  const mark = await makeAccount('owner', 'Mark Reyes');
  const ana = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, mark);
  await expectHome(screen);

  const anas = await anotherComputer(browser, ana);

  try {
    await anaOpens(anas.page, 'vouchers');
    const register = anas.page.getByRole('table', { name: 'Voucher register' });

    await register.getByRole('row', { name: /^CV-2026-0141 / }).waitFor();
    // Ana's computer loses the network; Mark saves a voucher meanwhile.
    await anas.page.context().setOffline(true);

    await app.open('/#vouchers');
    await screen.getByRole('tab', /^Voucher entry/).tap();
    const form = screen.getByRole('form', 'New voucher');

    await form.getByRole('combobox', 'Payee').fill('Manila Water Company');
    await form.getByRole('combobox', 'Line 1 description').fill('Water bill');
    await form.getByRole('textbox', 'Line 1 amount').fill('980');
    await form.getByRole('button', 'Save and approve').tap();
    await expect.poll(() => record('cv', '888001'), { timeout: 10_000 }).toMatchObject({ status: 'Approved' });
    expect(await register.getByRole('row', { name: /^888001 / }).count()).toBe(0);

    // The network comes back: the voucher appears, and Ana is told who saved it.
    await anas.page.context().setOffline(false);
    await register.getByRole('row', { name: /^888001 .*MANILA WATER COMPANY .*Approved/ }).waitFor({ timeout: 30_000 });
    await anas.page.getByRole('dialog', { name: /^From Mark Reyes: 888001 for MANILA WATER COMPANY saved and approved/ }).waitFor();
  } finally {
    await anas.close();
  }
});

test('a computer whose live updates were refused says so, and listens again by itself once it may', async ({ app, screen }) => {
  const ana = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, ana);
  await expectHome(screen);
  await app.open('/#vouchers');
  const rail = screen.getByRole('navigation', 'Keystone');
  const register = screen.getByRole('table', 'Voucher register');

  // The CEO removes Ana's account by mistake, then approves CV-2026-0141: the cloud refuses to send her the change, which
  // ends her listeners, and her rail says live updates stopped.
  await saveElsewhere('members', ana.uid, null);
  const waiting = await record('cv', 'CV-2026-0141');

  await saveElsewhere('cv', 'CV-2026-0141', { ...waiting, status: 'Approved' });
  await expect(rail.getByRole('status')).toHaveText(/^Live updates are paused\. Keystone checks the cloud for others' changes every 2 minutes/);
  await expect(register.getByRole('row', /^CV-2026-0141 .*For Approval/)).toBeVisible();

  // He puts her account back: her Keystone listens again by itself and shows the approval, never reopened.
  await setMember(ana.uid, 'staff', 'Ana Cruz');
  await expect(register.getByRole('row', /^CV-2026-0141 .*Approved/)).toBeVisible({ timeout: 30_000 });
  await expect(rail.getByText(/^Live updates are paused/)).toBeHidden();
});