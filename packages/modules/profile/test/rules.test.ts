import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { emptyState, type Ctx } from '@keystone/core';
import { checkName, MAX_NAME, nameChanged, NO_SIGN_IN } from '../src/rules';

/** 12 Nov 2026, 10:46 in Manila, signed in as the CEO. */
const ctx: Ctx = { now: () => new Date(2026, 10, 12, 10, 46), who: { uid: 'owner-1', name: 'Deign Lazaro', role: 'owner' } };

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

    expect(r.state.log[0]).toEqual({ when: '2026-11-12 10:46', mod: 'PROF', text: 'Deign Lazaro changed their name to Mark Anthony Santos.' });
    expect(r.record).toEqual({ uid: 'owner-1', name: 'Mark Anthony Santos', role: 'owner' });
    expect(r.message).toBe('Keystone shows you as Mark Anthony Santos from now on.');
  });
});
