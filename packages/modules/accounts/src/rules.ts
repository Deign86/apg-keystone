import {
  count, isOwner, KeystoneError, logged, NOT_YOUR_OWN_ACCOUNT, ONLY_OWNER_MAKES, ONLY_OWNER_REMOVES, onlyOwnerGrants, roleLabel,
  type Change, type Ctx, type Member, type MemberAccount, type MemberGrant, type NewAccount, type TerminalState,
} from '@keystone/core';

// Who may open APG's records in the cloud, the CEO making an account for each staff member (docs/adr/0014) and
// removing one (docs/adr/0015), and anyone signed in changing their own password (docs/adr/0016). The accounts
// themselves live with the sign-in, behind core's `accounts` service; these rules check what is asked for, word what
// the screen says, and log each account made or removed and each password changed. The refusals the platform repeats
// when asked anyway are core's, so the two never drift.

/** This module's id, written once: its route, its ModuleDef.id. */
export const ID = 'accounts';
export const TAG = 'ACCT';

/** The shortest password a new account may start with. Firebase itself takes 6. */
export const MIN_PASSWORD = 8;

export const NO_SIGN_IN = 'This Keystone keeps its records on this computer, where nobody signs in, so there are no accounts to make.';
export const CLOUD_ONLY = 'Accounts come with APG\'s records in the cloud: there, the CEO makes one here for each staff member, and they sign in with it on any computer or phone.';

/** Whether this person makes accounts: the CEO, signed in to the cloud. */
export const makesAccounts = (ctx: Ctx) => isOwner(ctx.who);

/** The CEO first, then everyone by name. */
export const membersInOrder = (members: MemberAccount[]) =>
  [...members].sort((a, b) => Number(isOwner(b)) - Number(isOwner(a)) || a.name.localeCompare(b.name));

/** The line under the screen's title. `members` is null until they have been read. */
export function accountsLine(members: MemberAccount[] | null, ctx: Ctx): string {
  if (!ctx.who) return NO_SIGN_IN;
  const who = members ? `${count(members.length, 'person', 'people')} can open APG's records.` : 'Who can open APG\'s records.';

  return makesAccounts(ctx) ? `${who} Make an account for each new staff member.` : `${who} ${ONLY_OWNER_MAKES}`;
}

// ---------- making an account ----------

export interface AccountDraft {
  name: string;
  email: string;
  password: string;
}

export const newAccountDraft = (): AccountDraft => ({ name: '', email: '', password: '' });

/** One line with single spaces. */
const clean = (x: string) => x.trim().replace(/\s+/g, ' ');

/** Something, an @, something with a dot: enough to catch a slip. The sign-in service checks the rest. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The account to make from the CEO's form, or the sentence saying what to fix. The password is kept as typed. */
export function checkAccount(d: AccountDraft, members: MemberAccount[], ctx: Ctx): NewAccount {
  if (!makesAccounts(ctx)) throw new KeystoneError(ONLY_OWNER_MAKES);
  const name = clean(d.name);
  const email = d.email.trim().toLowerCase();

  if (!name) throw new KeystoneError('Enter the person\'s name, as Keystone should show it.');

  if (!EMAIL.test(email)) throw new KeystoneError('Enter the email they will sign in with, like ana.cruz@alphapremiergroup.com.');
  const taken = members.find((m) => m.email.toLowerCase() === email);

  if (taken) throw new KeystoneError(`${email} already has an account: ${taken.name}.`);

  if (d.password.length < MIN_PASSWORD) throw new KeystoneError(`The password needs at least ${MIN_PASSWORD} characters.`);

  return { name, email, password: d.password };
}

/** Logs the account the CEO made. The log, which every member reads, names the person and their email, never the password. */
export function accountMade(s: TerminalState, account: MemberAccount, ctx: Ctx): Change<MemberAccount> {
  return {
    state: logged(s, TAG, `Account made for ${account.name} (${account.email}), ${roleLabel(account).toLowerCase()}.`, ctx),
    record: account,
    message: `${account.name} can now sign in as ${account.email}.`,
  };
}

// ---------- removing an account ----------

/** The person and, when known, their email: "Ana Cruz (ana.cruz@alphapremiergroup.com)". */
const named = (m: MemberAccount) => (m.email ? `${m.name} (${m.email})` : m.name);

/** Why the CEO may not remove this account here, or null when they may: staff only, and never their own. */
export function removeRefusal(m: MemberAccount, ctx: Ctx): string | null {
  if (!makesAccounts(ctx)) return ONLY_OWNER_REMOVES;

  if (m.uid === ctx.who?.uid) return NOT_YOUR_OWN_ACCOUNT;

  if (isOwner(m)) return `${m.name} is the CEO. A CEO's account is removed in the Firebase console (docs/FIREBASE.md).`;

  return null;
}

/** Refuses, with the sentence to show, unless the CEO may remove this account. */
export function checkRemoval(m: MemberAccount, ctx: Ctx): void {
  const refusal = removeRefusal(m, ctx);

  if (refusal) throw new KeystoneError(refusal);
}

/** What the CEO is asked before removing an account. */
export const removalQuestion = (m: MemberAccount) =>
  `${named(m)} can no longer open APG's records, on any computer or phone. What they filed keeps their name. `
  + 'Their sign-in stays but opens nothing; to let them back in, add them again in the Firebase console (docs/FIREBASE.md).';

/** Logs the account the CEO removed. */
export function accountRemoved(s: TerminalState, m: MemberAccount, ctx: Ctx): Change<MemberAccount> {
  return {
    state: logged(s, TAG, `Account removed for ${named(m)}; they can no longer open APG's records.`, ctx),
    record: m,
    message: `${m.name} can no longer open APG's records.`,
  };
}

// ---------- what a connected system lets the CEO give a member ----------

/** Whether the member has what this grant gives. */
export const hasGrant = (m: MemberAccount, g: MemberGrant) => m.grants?.includes(g.field) ?? false;

/** What the role column says: the role and, for staff, the label of each thing the CEO has given them, joined with " · ". */
export const roleLine = (m: MemberAccount, grants: readonly MemberGrant[] = []) =>
  [roleLabel(m), ...(isOwner(m) ? [] : grants.flatMap((g) => (hasGrant(m, g) ? [g.label] : [])))].join(' · ');

/**
 * Why the CEO may not change this here, or null when they may. A CEO opens everything a grant opens already, so there
 * is nothing to give or take.
 */
export function grantRefusal(m: MemberAccount, g: MemberGrant, ctx: Ctx): string | null {
  if (!makesAccounts(ctx)) return onlyOwnerGrants(g);

  if (isOwner(m)) return `${m.name} is the CEO, who opens ${g.opens} already.`;

  return null;
}

/** The row menu's item and the question's button, giving it or taking it back: "Make <label>", "Remove as <label>". */
export const grantAction = (m: MemberAccount, g: MemberGrant) => (hasGrant(m, g) ? `Remove as ${g.label.toLowerCase()}` : `Make ${g.label.toLowerCase()}`);

/** The question's title, with the person's name: "Make <name> <as>?", "Remove <name> as <label>?". */
export const grantTitle = (m: MemberAccount, g: MemberGrant) => (hasGrant(m, g) ? `Remove ${m.name} as ${g.label.toLowerCase()}?` : `Make ${m.name} ${g.as}?`);

/** What the CEO is asked before giving it, or taking it back, in the connected system's own words. */
export const grantQuestion = (m: MemberAccount, g: MemberGrant) => (hasGrant(m, g) ? g.asks.take(named(m)) : g.asks.give(named(m)));

/** Logs what the CEO gave a member, or took back. */
export function grantSet(s: TerminalState, m: MemberAccount, g: MemberGrant, on: boolean, ctx: Ctx): Change<MemberAccount> {
  const refusal = grantRefusal(m, g, ctx);

  if (refusal) throw new KeystoneError(refusal);
  const others = (m.grants ?? []).filter((f) => f !== g.field);
  const record: MemberAccount = { ...m, grants: on ? [...others, g.field] : others };

  return {
    state: logged(s, TAG, on ? `${named(m)} made ${g.as}.` : `${named(m)} is no longer ${g.as}.`, ctx),
    record,
    message: on ? `${m.name} can now open ${g.opens}.` : `${m.name} no longer opens ${g.opens}.`,
  };
}

// ---------- changing your own password ----------

export interface PasswordDraft {
  current: string;
  next: string;
  again: string;
}

export const newPasswordDraft = (): PasswordDraft => ({ current: '', next: '', again: '' });

/** What the sign-in is asked to do: check `current`, then change it to `next`. */
export interface PasswordChange {
  current: string;
  next: string;
}

/** The current and new passwords, exactly as typed, or the sentence saying what to fix. */
export function checkPasswordChange(d: PasswordDraft, ctx: Ctx): PasswordChange {
  if (!ctx.who) throw new KeystoneError(NO_SIGN_IN);

  if (!d.current) throw new KeystoneError('Enter your current password.');

  if (d.next.length < MIN_PASSWORD) throw new KeystoneError(`The new password needs at least ${MIN_PASSWORD} characters.`);

  if (d.again !== d.next) throw new KeystoneError('The new password and its repeat do not match.');

  if (d.next === d.current) throw new KeystoneError('Choose a new password, not the one you have now.');

  return { current: d.current, next: d.next };
}

/** Logs that the member signed in changed their password; never the password. */
export function passwordChanged(s: TerminalState, ctx: Ctx): Change<Member> {
  if (!ctx.who) throw new KeystoneError(NO_SIGN_IN);

  return {
    state: logged(s, TAG, `${ctx.who.name} changed their password.`, ctx),
    record: ctx.who,
    message: 'Your password is changed. Sign in with the new one from now on.',
  };
}
