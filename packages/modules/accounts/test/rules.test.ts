import { describe, expect, it } from 'vitest';
import { bundledSeed, type Ctx, type Member } from '@keystone/core';
import type { MemberAccount } from '@keystone/kit';
import {
  accountMade, accountsLine, checkAccount, makesAccounts, membersInOrder, newAccountDraft, NO_SIGN_IN, ONLY_OWNER,
} from '../src/rules';

/** 30 Oct 2026, 09:05 in Manila. */
const at = () => new Date(2026, 9, 30, 9, 5);
const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const asOwner: Ctx = { seed: bundledSeed, now: at, who: owner };
const asStaff: Ctx = { seed: bundledSeed, now: at, who: hr };
const local: Ctx = { seed: bundledSeed, now: at };

const members: MemberAccount[] = [
  { ...hr, email: 'ana.cruz@alphapremiergroup.com' },
  { ...owner, email: 'mark@alphapremiergroup.com' },
  // Added by hand in the Firebase console, before Keystone kept emails.
  { uid: 'it-1', name: 'Paolo Santos', role: 'staff', email: '' },
];

const draft = { name: '  Liza   Bautista ', email: ' Liza.Bautista@AlphaPremierGroup.com ', password: 'correct horse' };

describe('who makes accounts', () => {
  it('is the owner signed in to the cloud, and nobody else', () => {
    expect(makesAccounts(asOwner)).toBe(true);
    expect(makesAccounts(asStaff)).toBe(false);
    expect(makesAccounts(local)).toBe(false);
  });

  it('is what the line under the title says', () => {
    expect(accountsLine(members, asOwner)).toBe('3 people can open APG\'s records. Make an account for each new staff member.');
    expect(accountsLine(members.slice(0, 1), asStaff)).toBe('1 person can open APG\'s records. Only the owner makes accounts.');
    expect(accountsLine(null, asOwner)).toBe('Who can open APG\'s records. Make an account for each new staff member.');
    expect(accountsLine(null, local)).toBe(NO_SIGN_IN);
  });

  it('lists owners first, then everyone by name', () => {
    expect(membersInOrder(members).map((m) => m.name)).toEqual(['Mark Reyes', 'Ana Cruz', 'Paolo Santos']);
  });
});

describe('making an account', () => {
  it('takes the name on one line, the email in lower case, and the password exactly as typed', () => {
    expect(checkAccount(draft, members, asOwner)).toEqual({
      name: 'Liza Bautista', email: 'liza.bautista@alphapremiergroup.com', password: 'correct horse',
    });
  });

  it('is refused to staff and with nobody signed in, whatever they typed', () => {
    expect(() => checkAccount(draft, members, asStaff)).toThrow(ONLY_OWNER);
    expect(() => checkAccount(draft, members, local)).toThrow(ONLY_OWNER);
  });

  it('needs a name, an email and a password of at least 8 characters', () => {
    expect(() => checkAccount({ ...draft, name: '  ' }, members, asOwner)).toThrow('Enter the person\'s name, as Keystone should show it.');
    expect(() => checkAccount(newAccountDraft(), members, asOwner)).toThrow('Enter the person\'s name');

    for (const email of ['', 'liza', 'liza@alphapremiergroup', 'liza bautista@apg.com', '@apg.com']) {
      expect(() => checkAccount({ ...draft, email }, members, asOwner)).toThrow('Enter the email they will sign in with, like ana.cruz@alphapremiergroup.com.');
    }

    expect(() => checkAccount({ ...draft, password: '1234567' }, members, asOwner)).toThrow('The password needs at least 8 characters.');
    expect(checkAccount({ ...draft, password: '12345678' }, members, asOwner).password).toBe('12345678');
  });

  it('refuses an email that already has an account, whatever its case, naming whose it is', () => {
    expect(() => checkAccount({ ...draft, email: 'ANA.CRUZ@alphapremiergroup.com' }, members, asOwner))
      .toThrow('ana.cruz@alphapremiergroup.com already has an account: Ana Cruz.');
  });

  it('logs who it is for and their email, never the password', () => {
    const made: MemberAccount = { uid: 'new-1', name: 'Liza Bautista', email: 'liza.bautista@alphapremiergroup.com', role: 'staff' };
    const s = structuredClone(bundledSeed.state);
    const r = accountMade(s, made, asOwner);

    expect(r.record).toBe(made);
    expect(r.message).toBe('Liza Bautista can now sign in as liza.bautista@alphapremiergroup.com.');
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'ACCT', text: 'Account made for Liza Bautista (liza.bautista@alphapremiergroup.com), staff.' });
    expect(r.state.log.slice(1)).toEqual(s.log);
    expect(JSON.stringify(r.state)).not.toContain('correct horse');
  });
});
