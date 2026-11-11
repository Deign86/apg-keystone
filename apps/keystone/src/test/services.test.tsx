import { describe, expect, it } from 'vitest';
import { SERVICES } from '@keystone/core';
import { buildRegistry, findService, KeystoneStore } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';

// Billing publishes the statement-payments service (packages/core/src/kernel/services.ts) for any part that settles
// statements from outside billing. Checked here against the parts that ship, with and without billing installed.

describe('the statement-payments service, as shipped', () => {
  it('is provided by billing under its published name, and lists the statements still open', async () => {
    const desk = findService(buildRegistry(builtInModules, plugins).modules, SERVICES.statementPayments);
    const store = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null, saveState: async () => {} });

    expect(desk).toBeDefined();
    expect(desk!.open(store.state).length).toBeGreaterThan(0);
  });

  it('is absent, not broken, without billing', () => {
    const r = buildRegistry(builtInModules.filter((m) => m.id !== 'billing'), plugins);

    expect(r.refused).toEqual([]);
    expect(findService(r.modules, SERVICES.statementPayments)).toBeUndefined();
  });
});

// Timekeeping publishes employee-attendance for payroll to price a cut-off. Payroll still installs without it and pays
// every weekday in full.

describe('the employee-attendance service, as shipped', () => {
  it('is provided by timekeeping under its published name, and counts a cut-off', async () => {
    const attendance = findService(buildRegistry(builtInModules, plugins).modules, SERVICES.employeeAttendance);
    const store = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null, saveState: async () => {} });

    expect(attendance).toBeDefined();
    expect(attendance!.tally(store.state, 'E-001', '2026-10-01', '2026-10-15', store.ctx)).toMatchObject({ scheduled: 11, worked: 0 });
  });

  it('is absent, not broken, without timekeeping, and payroll stays installed', () => {
    const r = buildRegistry(builtInModules.filter((m) => m.id !== 'timekeeping'), plugins);

    expect(r.refused).toEqual([]);
    expect(findService(r.modules, SERVICES.employeeAttendance)).toBeUndefined();
    expect(r.modules.map((m) => m.id)).toContain('payroll');
  });
});

// Bank Accounts publishes bank-accounts for a statement's "Pay into". Billing still installs without it, and its
// payment instructions are then only typed.

describe('the bank-accounts service, as shipped', () => {
  it('is provided by banks under its published name, and lists the company account until one is saved', async () => {
    const banks = findService(buildRegistry(builtInModules, plugins).modules, SERVICES.bankAccounts);
    const store = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null, saveState: async () => {} });

    expect(banks).toBeDefined();
    expect(banks!.accounts(store.state, store.ctx).map(banks!.label)).toEqual(['BPI · 4011 0258 68']);
  });

  it('is absent, not broken, without banks, and billing stays installed', () => {
    const r = buildRegistry(builtInModules.filter((m) => m.id !== 'banks'), plugins);

    expect(r.refused).toEqual([]);
    expect(findService(r.modules, SERVICES.bankAccounts)).toBeUndefined();
    expect(r.modules.map((m) => m.id)).toContain('billing');
  });
});

// Check Vouchers publishes voucher-drafts for Requests for Funds to draft the check voucher of an approved request
// (docs/adr/0011). Funds still installs without it, and an approval then drafts nothing (src/test/funds.test.tsx).

describe('the voucher-drafts service, as shipped', () => {
  it('is provided by vouchers under its published name, and drafts a voucher For Approval', async () => {
    const drafts = findService(buildRegistry(builtInModules, plugins).modules, SERVICES.voucherDrafts);
    const store = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null, saveState: async () => {} });

    expect(drafts).toBeDefined();
    expect(drafts!.draft(store.state, { payee: 'V-002', amount: 48000, particulars: 'Christmas party (RF-2026-0001)' }, store.ctx).record)
      .toMatchObject({ no: '888-001', payee: 'V-002', status: 'For Approval', check: '' });
  });

  it('is absent, not broken, without vouchers, and funds stays installed', () => {
    const r = buildRegistry(builtInModules.filter((m) => m.id !== 'vouchers'), plugins);

    expect(r.refused).toEqual([]);
    expect(findService(r.modules, SERVICES.voucherDrafts)).toBeUndefined();
    expect(r.modules.map((m) => m.id)).toContain('funds');
  });
});
