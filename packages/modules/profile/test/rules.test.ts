import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { emptyState, type Ctx } from '@keystone/core';
import { bankChanged, checkBank, checkName, MAX_NAME, nameChanged, NO_SIGN_IN } from '../src/rules';

/** 12 Nov 2026, 10:46 in Manila, signed in as the CEO. */
const ctx: Ctx = { now: () => new Date(2026, 10, 12, 10, 46), who: { uid: 'owner-1', name: 'Deign Lazaro', role: 'owner' } };

describe('your bank account (docs/adr/0052)', () => {
  const typed = { bank: ' BDO ', branch: ' ', name: ' Deign Lazaro ', number: ' 0012 3456 7890 ' };

  it('keeps the account as typed, trimmed, and refuses one it could not pay into, naming the field', () => {
    expect(checkBank(typed, ctx)).toEqual({ bank: 'BDO', branch: '', name: 'Deign Lazaro', number: '0012 3456 7890' });
    expect(refusalOf(() => checkBank({ ...typed, bank: ' ' }, ctx))).toEqual({ error: 'Enter your bank.', fields: ['bank'] });
    expect(refusalOf(() => checkBank({ ...typed, name: '' }, ctx))).toEqual({ error: 'Enter the account name, as the bank holds it.', fields: ['accountName'] });
    expect(refusalOf(() => checkBank({ ...typed, number: 'none' }, ctx))).toEqual({ error: 'Enter your account number.', fields: ['number'] });
    expect(refusalOf(() => checkBank({ ...typed, number: '1'.repeat(41) }, ctx))).toEqual({ error: 'Keep it to 40 characters.', fields: ['number'] });
    expect(() => checkBank(typed, { now: ctx.now })).toThrow(NO_SIGN_IN);
  });

  it('logs that it was saved or removed, never the bank or the number', () => {
    const bank = checkBank(typed, ctx);
    const saved = bankChanged(emptyState(), bank, ctx);
    expect(saved.state.log[0]).toMatchObject({ mod: 'PROF', text: 'Deign Lazaro saved their bank account.' });
    expect(saved.record).toEqual({ ...ctx.who, bank });
    const removed = bankChanged(emptyState(), null, { ...ctx, who: { ...ctx.who!, bank } });
    expect(removed.state.log[0].text).toBe('Deign Lazaro removed their bank account.');
    expect(removed.record).not.toHaveProperty('bank');
  });
});

describe('your profile', () => {
  it('takes a new name on one line with single spaces', () => {
    expect(checkName('  Mark   Anthony Santos ', ctx)).toBe('Mark Anthony Santos');
  });

  it('refuses a blank name, one too long, and the name you have', () => {
    expect(refusalOf(() => checkName('   ', ctx))).toEqual({ error: 'Enter your name, as Keystone should show it.', fields: ['name'] });
    expect(refusalOf(() => checkName('x'.repeat(MAX_NAME + 1), ctx))).toEqual({ error: `Keep your name to ${MAX_NAME} characters.`, fields: ['name'] });
    expect(checkName('x'.repeat(MAX_NAME), ctx)).toHaveLength(MAX_NAME);
    expect(refusalOf(() => checkName(' Deign  Lazaro ', ctx))).toEqual({ error: 'That is already your name.', fields: ['name'] });
  });

  it('has nothing to change with nobody signed in', () => {
    expect(() => checkName('Mark Anthony Santos', { now: ctx.now })).toThrow(NO_SIGN_IN);
  });

  it('logs the change from the old name to the new', () => {
    const r = nameChanged(emptyState(), 'Deign Lazaro', 'Mark Anthony Santos', ctx);

    expect(r.state.log[0]).toEqual({ when: '2026-11-12 10:46', mod: 'PROF', text: 'Deign Lazaro changed their name to Mark Anthony Santos.', by: 'Deign Lazaro' });
    expect(r.record).toEqual({ uid: 'owner-1', name: 'Mark Anthony Santos', role: 'owner' });
    expect(r.message).toBe('Keystone shows you as Mark Anthony Santos from now on.');
  });
});
