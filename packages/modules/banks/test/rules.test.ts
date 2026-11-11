import { describe, expect, it } from 'vitest';
import { bundledSeed, moduleData, SERVICES, withModuleData, type BankAccount, type Ctx } from '@keystone/core';
import {
  accountDraftOf, accountLabel, accountsOf, bankAccounts, banksLine, newAccountDraft, nextAccountId, removeAccount, saveAccount,
} from '../src/rules';
import { banksModule } from '../src';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);
const bpi: BankAccount = { id: 'B-001', bank: 'BPI', branch: '', name: 'Alpha Premier Group of Companies OPC', number: '4011 0258 68' };
const bdo = { bank: 'BDO', branch: 'Ortigas Center', name: 'Alpha Premier Group of Companies OPC', number: '0012 3456 7890' };

describe('bank accounts', () => {
  it('start as the company account in the reference data, until one is saved', () => {
    expect(accountsOf(state(), ctx)).toEqual([bpi]);
    expect(bundledSeed.reference.defaults.paymentInstructions).toContain(`Account Number: ${bpi.number}`);
    expect(nextAccountId(state(), ctx)).toBe('B-002');
    expect(banksLine(accountsOf(state(), ctx))).toBe('1 account at BPI.');
  });

  it('adds an account under state.ext.banks with the next number, and logs it', () => {
    const r = saveAccount(state(), { ...newAccountDraft(), ...bdo }, ctx);

    expect(r.record).toEqual({ id: 'B-002', ...bdo });
    expect(r.message).toBe('B-002 added.');
    expect(moduleData(r.state, 'banks')).toEqual({ accounts: [bpi, { id: 'B-002', ...bdo }] });
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'BANK', text: 'B-002 BDO · 0012 3456 7890 added, in the name of Alpha Premier Group of Companies OPC.' });
    expect(banksLine(accountsOf(r.state, ctx))).toBe('2 accounts at BPI and BDO.');
  });

  it('trims what is typed and keeps one space between words', () => {
    const r = saveAccount(state(), { ...newAccountDraft(), bank: '  Security  Bank ', name: ' APG ', number: ' 0000  1111 ' }, ctx);

    expect(r.record).toEqual({ id: 'B-002', bank: 'Security Bank', branch: '', name: 'APG', number: '0000 1111' });
  });

  it('needs the bank, the account name and the account number', () => {
    const d = { ...newAccountDraft(), ...bdo };

    expect(() => saveAccount(state(), { ...d, bank: ' ' }, ctx)).toThrow('Enter the bank.');
    expect(() => saveAccount(state(), { ...d, name: '' }, ctx)).toThrow('Enter the account name.');
    expect(() => saveAccount(state(), { ...d, number: ' - ' }, ctx)).toThrow('Enter the account number.');
    // The branch may be left out.
    expect(saveAccount(state(), { ...d, branch: '' }, ctx).record.branch).toBe('');
  });

  it('refuses an account number already in use, however it is spaced, and names the account', () => {
    expect(() => saveAccount(state(), { ...newAccountDraft(), ...bdo, number: '4011-0258-68' }, ctx))
      .toThrow('Account number 4011-0258-68 is already saved as B-001 (BPI, Alpha Premier Group of Companies OPC).');
  });

  it('edits an account in place, keeping its number, and its own account number is no clash', () => {
    const r = saveAccount(state(), { ...accountDraftOf(bpi), branch: 'Tektite' }, ctx);

    expect(r.record).toEqual({ ...bpi, branch: 'Tektite' });
    expect(r.message).toBe('B-001 updated.');
    expect(accountsOf(r.state, ctx)).toEqual([{ ...bpi, branch: 'Tektite' }]);
    expect(r.state.log[0]).toMatchObject({ mod: 'BANK', text: 'B-001 BPI · 4011 0258 68 updated.' });
  });

  it('refuses to edit an account that is gone', () => {
    expect(() => saveAccount(state(), { ...accountDraftOf(bpi), editing: 'B-009' }, ctx)).toThrow('B-009 is no longer in Bank Accounts.');
  });

  it('removes an account and logs it; once the last is gone the list stays empty', () => {
    const r = removeAccount(state(), 'B-001', ctx);

    expect(r.message).toBe('B-001 removed.');
    expect(r.state.log[0]).toMatchObject({ mod: 'BANK', text: 'B-001 BPI · 4011 0258 68 removed.' });
    expect(accountsOf(r.state, ctx)).toEqual([]);
    expect(banksLine([])).toBe('No bank accounts are kept yet.');
    // Numbering starts again from the accounts there are.
    expect(saveAccount(r.state, { ...newAccountDraft(), ...bdo }, ctx).record.id).toBe('B-001');
    expect(() => removeAccount(r.state, 'B-001', ctx)).toThrow('B-001 is not in Bank Accounts.');
  });

  it('reads saved data back safely: junk is left out, and data that is not an object falls back to the reference', () => {
    const s = withModuleData(state(), 'banks', { accounts: [{ id: 'B-004', bank: 'BDO', number: 5 }, 'junk', { bank: 'No id' }] });

    expect(accountsOf(s, ctx)).toEqual([{ id: 'B-004', bank: 'BDO', branch: '', name: '', number: '' }]);
    expect(nextAccountId(s, ctx)).toBe('B-005');
    expect(accountsOf(withModuleData(state(), 'banks', 'broken'), ctx)).toEqual([bpi]);
    expect(accountsOf(withModuleData(state(), 'banks', {}), ctx)).toEqual([]);
  });

  it('never changes the state it is given', () => {
    const s = state();
    const before = JSON.stringify(s);
    saveAccount(s, { ...newAccountDraft(), ...bdo }, ctx);
    removeAccount(s, 'B-001', ctx);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('the bank-accounts service', () => {
  it('is provided under its published name, with the accounts and their labels', () => {
    expect(banksModule.provides?.[SERVICES.bankAccounts]).toBe(bankAccounts);
    expect(bankAccounts.accounts(state(), ctx)).toEqual([bpi]);
    expect(bankAccounts.label(bpi)).toBe('BPI · 4011 0258 68');
    expect(accountLabel({ ...bpi, number: '' })).toBe('BPI');
  });

  it('logs under its own tag, with its own filter label, and sits under Settings', () => {
    expect(banksModule).toMatchObject({ id: 'banks', title: 'Bank Accounts', section: 'Settings', logTags: { BANK: 'Bank Accounts' } });
  });
});
