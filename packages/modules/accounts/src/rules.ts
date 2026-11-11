import { count, KeystoneError, logged, type Change, type Ctx, type TerminalState } from '@keystone/core';
import type { MemberAccount, NewAccount } from '@keystone/kit';

// Who may open APG's records in the cloud, and the owner making an account for each staff member (docs/adr/0014). The
// accounts themselves live with the sign-in (Platform.accounts); these rules check what the owner typed, word what the
// screen says, and log each account made.

export const TAG = 'ACCT';

/** The shortest password a new account may start with. Firebase itself takes 6. */
export const MIN_PASSWORD = 8;

export const NO_SIGN_IN = 'This Keystone keeps its records on this computer, where nobody signs in, so there are no accounts to make.';
export const CLOUD_ONLY = 'Accounts come with APG\'s records in the cloud: there, the owner makes one here for each staff member, and they sign in with it on any computer or phone.';
export const ONLY_OWNER = 'Only the owner makes accounts.';

/** Whether this person makes accounts: the owner, signed in to the cloud. */
export const makesAccounts = (ctx: Ctx) => ctx.who?.role === 'owner';

export const roleLabel = (m: Pick<MemberAccount, 'role'>) => (m.role === 'owner' ? 'Owner' : 'Staff');

/** Owners first, then everyone by name. */
export const membersInOrder = (members: MemberAccount[]) =>
  [...members].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.name.localeCompare(b.name));

/** The line under the screen's title. `members` is null until they have been read. */
export function accountsLine(members: MemberAccount[] | null, ctx: Ctx): string {
  if (!ctx.who) return NO_SIGN_IN;
  const who = members ? `${count(members.length, 'person', 'people')} can open APG's records.` : 'Who can open APG\'s records.';

  return makesAccounts(ctx) ? `${who} Make an account for each new staff member.` : `${who} ${ONLY_OWNER}`;
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

/** The account to make from the owner's form, or the sentence saying what to fix. The password is kept as typed. */
export function checkAccount(d: AccountDraft, members: MemberAccount[], ctx: Ctx): NewAccount {
  if (!makesAccounts(ctx)) throw new KeystoneError(ONLY_OWNER);
  const name = clean(d.name);
  const email = d.email.trim().toLowerCase();

  if (!name) throw new KeystoneError('Enter the person\'s name, as Keystone should show it.');

  if (!EMAIL.test(email)) throw new KeystoneError('Enter the email they will sign in with, like ana.cruz@alphapremiergroup.com.');
  const taken = members.find((m) => m.email.toLowerCase() === email);

  if (taken) throw new KeystoneError(`${email} already has an account: ${taken.name}.`);

  if (d.password.length < MIN_PASSWORD) throw new KeystoneError(`The password needs at least ${MIN_PASSWORD} characters.`);

  return { name, email, password: d.password };
}

/** Logs the account the owner made. The log, which every member reads, names the person and their email, never the password. */
export function accountMade(s: TerminalState, account: MemberAccount, ctx: Ctx): Change<MemberAccount> {
  return {
    state: logged(s, TAG, `Account made for ${account.name} (${account.email}), ${roleLabel(account).toLowerCase()}.`, ctx),
    record: account,
    message: `${account.name} can now sign in as ${account.email}.`,
  };
}
