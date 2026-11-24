import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { ONLY_OWNER_MAKES, ONLY_OWNER_REMOVES, type Ctx, type Member, type MemberAccount, type MemberGrant } from '@keystone/core';
import {
  accountMade, accountRemoved, accountsLine, checkAccount, grantAction, grantQuestion, grantRefusal, grantSet, grantTitle, checkPasswordChange, checkRemoval, makesAccounts, membersInOrder,
  newAccountDraft, newPasswordDraft, NO_SIGN_IN, passwordChanged, removalQuestion, removeRefusal, roleLine,
} from '../src/rules';
import { sampleState } from '@keystone/core/sample';

/** 30 Oct 2026, 09:05 in Manila. */
const at = () => new Date(2026, 9, 30, 9, 5);
const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const asOwner: Ctx = { now: at, who: owner };
const asStaff: Ctx = { now: at, who: hr };
const local: Ctx = { now: at };

const members: MemberAccount[] = [
  { ...hr, email: 'ana.cruz@alphapremiergroup.com' },
  { ...owner, email: 'mark@alphapremiergroup.com' },
  // Added by hand in the Firebase console, before Keystone kept emails.
  { uid: 'it-1', name: 'Paolo Santos', role: 'staff', email: '' },
];

/**
 * What a connected system lets the CEO give a staff member, worded as the attendance connector contributes it
 * (packages/connectors/attendance, which a module cannot import): the sentences below are the ones the screen has
 * always shown.
 */
const admin: MemberGrant = {
  field: 'attendanceAdmin',
  label: 'Attendance admin',
  as: 'an attendance admin',
  opens: 'the attendance tracker\'s admin screens',
  asks: {
    give: (who) => `${who} will open the attendance tracker's admin screens with their own email and password: interns, attendance, payroll and its settings.`,
    take: (who) => `${who} will no longer open the attendance tracker's admin screens with this account. An admin card they hold still works there.`,
  },
};

const draft = { name: '  Liza   Bautista ', email: ' Liza.Bautista@AlphaPremierGroup.com ', password: 'correct horse' };

describe('who makes accounts', () => {
  it('is the CEO signed in to the cloud, and nobody else', () => {
    expect(makesAccounts(asOwner)).toBe(true);
    expect(makesAccounts(asStaff)).toBe(false);
    expect(makesAccounts(local)).toBe(false);
  });

  it('is what the line under the title says', () => {
    expect(accountsLine(members, asOwner)).toBe('3 people can open APG\'s records. Make an account for each new staff member.');
    expect(accountsLine(members.slice(0, 1), asStaff)).toBe('1 person can open APG\'s records. Only the CEO makes accounts.');
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
    expect(() => checkAccount(draft, members, asStaff)).toThrow(ONLY_OWNER_MAKES);
    expect(() => checkAccount(draft, members, local)).toThrow(ONLY_OWNER_MAKES);
  });

  it('needs a name, an email and a password of at least 8 characters', () => {
    expect(refusalOf(() => checkAccount({ ...draft, name: '  ' }, members, asOwner))).toEqual({ error: 'Enter the person\'s name, as Keystone should show it.', fields: ['name'] });
    expect(refusalOf(() => checkAccount(newAccountDraft(), members, asOwner))).toEqual({ error: 'Enter the person\'s name, as Keystone should show it.', fields: ['name'] });

    for (const email of ['', 'liza', 'liza@alphapremiergroup', 'liza bautista@apg.com', '@apg.com']) {
      expect(refusalOf(() => checkAccount({ ...draft, email }, members, asOwner))).toEqual({ error: 'Enter the email they will sign in with, like ana.cruz@alphapremiergroup.com.', fields: ['email'] });
    }

    expect(refusalOf(() => checkAccount({ ...draft, password: '1234567' }, members, asOwner))).toEqual({ error: 'The password needs at least 8 characters.', fields: ['password'] });
    expect(checkAccount({ ...draft, password: '12345678' }, members, asOwner).password).toBe('12345678');
  });

  it('refuses an email that already has an account, whatever its case, naming whose it is', () => {
    expect(refusalOf(() => checkAccount({ ...draft, email: 'ANA.CRUZ@alphapremiergroup.com' }, members, asOwner)))
      .toEqual({ error: 'ana.cruz@alphapremiergroup.com already has an account: Ana Cruz.', fields: ['email'] });
  });

  it('logs who it is for and their email, never the password', () => {
    const made: MemberAccount = { uid: 'new-1', name: 'Liza Bautista', email: 'liza.bautista@alphapremiergroup.com', role: 'staff' };
    const s = sampleState();
    const r = accountMade(s, made, asOwner);

    expect(r.record).toBe(made);
    expect(r.message).toBe('Liza Bautista can now sign in as liza.bautista@alphapremiergroup.com.');
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'ACCT', text: 'Account made for Liza Bautista (liza.bautista@alphapremiergroup.com), staff.' });
    expect(r.state.log.slice(1)).toEqual(s.log);
    expect(JSON.stringify(r.state)).not.toContain('correct horse');
  });
});

describe('removing an account', () => {
  const [ana, mark, paolo] = members;

  it('is for the CEO, and only for staff other than themselves', () => {
    expect(removeRefusal(ana, asOwner)).toBeNull();
    expect(removeRefusal(paolo, asOwner)).toBeNull();
    expect(removeRefusal(mark, asOwner)).toBe('You cannot remove your own account.');
    expect(removeRefusal({ ...mark, uid: 'owner-2', name: 'Liza Bautista' }, asOwner))
      .toBe('Liza Bautista is the CEO. A CEO\'s account is removed in the Firebase console (docs/FIREBASE.md).');
    expect(removeRefusal(paolo, asStaff)).toBe(ONLY_OWNER_REMOVES);
    expect(removeRefusal(paolo, local)).toBe(ONLY_OWNER_REMOVES);

    expect(() => checkRemoval(ana, asOwner)).not.toThrow();
    expect(() => checkRemoval(ana, asStaff)).toThrow(ONLY_OWNER_REMOVES);
    expect(() => checkRemoval(mark, asOwner)).toThrow('You cannot remove your own account.');
  });

  it('says what removing does before it is done, with the email when there is one', () => {
    expect(removalQuestion(ana)).toBe(
      'Ana Cruz (ana.cruz@alphapremiergroup.com) can no longer open APG\'s records, on any computer or phone. What they filed keeps their '
      + 'name. Their sign-in stays but opens nothing; to let them back in, add them again in the Firebase console (docs/FIREBASE.md).',
    );
    expect(removalQuestion(paolo)).toMatch(/^Paolo Santos can no longer open APG's records/);
  });

  it('logs whose account was removed', () => {
    const s = sampleState();
    const r = accountRemoved(s, ana, asOwner);

    expect(r.record).toBe(ana);
    expect(r.message).toBe('Ana Cruz can no longer open APG\'s records.');
    expect(r.state.log[0]).toEqual({
      when: '2026-10-30 09:05', mod: 'ACCT', text: 'Account removed for Ana Cruz (ana.cruz@alphapremiergroup.com); they can no longer open APG\'s records.',
    });
    expect(r.state.log.slice(1)).toEqual(s.log);
    expect(accountRemoved(s, paolo, asOwner).state.log[0].text).toBe('Account removed for Paolo Santos; they can no longer open APG\'s records.');
  });
});

describe('changing your own password', () => {
  const good = { current: 'old password', next: ' new password ', again: ' new password ' };

  it('takes both passwords exactly as typed, for anyone signed in', () => {
    expect(checkPasswordChange(good, asStaff)).toEqual({ current: 'old password', next: ' new password ' });
    expect(checkPasswordChange(good, asOwner)).toEqual({ current: 'old password', next: ' new password ' });
  });

  it('needs a sign-in, the current password, 8 characters, the same new password twice, and a new one', () => {
    expect(() => checkPasswordChange(good, local)).toThrow(NO_SIGN_IN);
    expect(refusalOf(() => checkPasswordChange(newPasswordDraft(), asStaff))).toEqual({ error: 'Enter your current password.', fields: ['current'] });
    expect(refusalOf(() => checkPasswordChange({ ...good, next: '1234567', again: '1234567' }, asStaff))).toEqual({ error: 'The new password needs at least 8 characters.', fields: ['next'] });
    expect(refusalOf(() => checkPasswordChange({ ...good, again: 'new password' }, asStaff))).toEqual({ error: 'The new password and its repeat do not match.', fields: ['again'] });
    expect(refusalOf(() => checkPasswordChange({ current: 'same password', next: 'same password', again: 'same password' }, asStaff)))
      .toEqual({ error: 'Choose a new password, not the one you have now.', fields: ['next'] });
  });

  it('logs who changed their password, never the password', () => {
    const s = sampleState();
    const r = passwordChanged(s, asStaff);

    expect(r.record).toBe(hr);
    expect(r.message).toBe('Your password is changed. Sign in with the new one from now on.');
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'ACCT', text: 'Ana Cruz changed their password.' });
    expect(r.state.log.slice(1)).toEqual(s.log);
    expect(() => passwordChanged(s, local)).toThrow(NO_SIGN_IN);
  });
});

describe('who opens the attendance tracker\'s admin screens', () => {
  const ana: MemberAccount = { ...hr, email: 'ana.cruz@alphapremiergroup.com' };
  const ceo: MemberAccount = { ...owner, email: 'mark@alphapremiergroup.com' };

  it('only the CEO decides, and never for a CEO, who opens them already', () => {
    expect(grantRefusal(ana, admin, asOwner)).toBeNull();
    expect(grantRefusal(ana, admin, asStaff)).toBe('Only the CEO decides who opens the attendance tracker\'s admin screens.');
    expect(grantRefusal(ana, admin, local)).toBe('Only the CEO decides who opens the attendance tracker\'s admin screens.');
    expect(grantRefusal(ceo, admin, asOwner)).toBe('Mark Reyes is the CEO, who opens the attendance tracker\'s admin screens already.');
    expect(() => grantSet(sampleState(), ana, admin, true, asStaff)).toThrow('Only the CEO decides');
    expect(() => grantSet(sampleState(), ceo, admin, true, asOwner)).toThrow('is the CEO');
  });

  it('logs who was let in and who was stopped, and says so beside their role', () => {
    const s = sampleState();
    const made = grantSet(s, ana, admin, true, asOwner);

    expect(made.record).toEqual({ ...ana, grants: ['attendanceAdmin'] });
    expect(made.message).toBe('Ana Cruz can now open the attendance tracker\'s admin screens.');
    expect(made.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'ACCT', text: 'Ana Cruz (ana.cruz@alphapremiergroup.com) made an attendance admin.' });
    expect(made.state.log.slice(1)).toEqual(s.log);
    expect(roleLine(made.record, [admin])).toBe('Staff · Attendance admin');
    // Without the connected system installed, nothing is said of it.
    expect(roleLine(made.record)).toBe('Staff');

    const stopped = grantSet(s, made.record, admin, false, asOwner);

    expect(stopped.record.grants).toEqual([]);
    expect(stopped.message).toBe('Ana Cruz no longer opens the attendance tracker\'s admin screens.');
    expect(stopped.state.log[0].text).toBe('Ana Cruz (ana.cruz@alphapremiergroup.com) is no longer an attendance admin.');
    expect(roleLine(stopped.record, [admin])).toBe('Staff');
    expect(roleLine(ana, [admin])).toBe('Staff');
    // A CEO's line never changes, whatever the document holds.
    expect(roleLine({ ...ceo, grants: ['attendanceAdmin'] }, [admin])).toBe('CEO');
  });

  const made = (): MemberAccount => ({ ...ana, grants: ['attendanceAdmin'] });

  it('asks in words that say what the person will be able to open', () => {
    expect(grantQuestion(ana, admin)).toMatch(/^Ana Cruz \(ana\.cruz@alphapremiergroup\.com\) will open the attendance tracker's admin screens with their own email and password/);
    expect(grantQuestion({ ...ana, grants: ['attendanceAdmin'] }, admin)).toMatch(/will no longer open .* An admin card they hold still works there\.$/);
    // The menu item, the question's title and its button, for giving it and for taking it back.
    expect([grantAction(ana, admin), grantTitle(ana, admin)]).toEqual(['Make attendance admin', 'Make Ana Cruz an attendance admin?']);
    expect([grantAction(made(), admin), grantTitle(made(), admin)]).toEqual(['Remove as attendance admin', 'Remove Ana Cruz as attendance admin?']);
  });
});
