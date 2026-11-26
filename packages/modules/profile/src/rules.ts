import { CLOUD_LAYOUT, KeystoneError, logged, type Change, type Ctx, type Member, type PayoutAccount, type TerminalState } from '@keystone/core';

// Your own profile (docs/adr/0020): the name Keystone shows for whoever is signed in, in the rail, as who prepared a
// voucher or asked for funds, and in the activity log. The name lives with the sign-in (core's `accounts` service); these rules
// check the new one and log the change.

/** This module's id, written once: its route, its ModuleDef.id. */
export const ID = 'profile';
export const TAG = 'PROF';

/** The longest name Keystone keeps: the one firestore.rules allows. */
export const MAX_NAME = CLOUD_LAYOUT.maxName;

export const NO_SIGN_IN = 'This Keystone keeps its records on this computer, where nobody signs in, so there is no profile to change.';

/** The new name on one line with single spaces, or the sentence saying what to fix. */
export function checkName(name: string, ctx: Ctx): string {
  if (!ctx.who) throw new KeystoneError(NO_SIGN_IN);
  const next = name.trim().replace(/\s+/g, ' ');

  if (!next) throw new KeystoneError('Enter your name, as Keystone should show it.', 'name');

  if (next.length > MAX_NAME) throw new KeystoneError(`Keep your name to ${MAX_NAME} characters.`, 'name');

  if (next === ctx.who.name) throw new KeystoneError('That is already your name.', 'name');

  return next;
}

// ---------- your bank account (docs/adr/0052) ----------

/** The bank account as typed, trimmed, or the sentence saying what to fix, naming the field. */
export function checkBank(a: PayoutAccount, ctx: Ctx): PayoutAccount {
  if (!ctx.who) throw new KeystoneError(NO_SIGN_IN);
  const bank = { bank: a.bank.trim(), branch: a.branch.trim(), name: a.name.trim(), number: a.number.trim() };

  if (!bank.bank) throw new KeystoneError('Enter your bank.', 'bank');

  if (!bank.name) throw new KeystoneError('Enter the account name, as the bank holds it.', 'accountName');

  if (!/\d/.test(bank.number)) throw new KeystoneError('Enter your account number.', 'number');

  for (const [key, value, most] of [['bank', bank.bank, 100], ['branch', bank.branch, 100], ['accountName', bank.name, 100], ['number', bank.number, 40]] as const) {
    if (value.length > most) throw new KeystoneError(`Keep it to ${most} characters.`, key);
  }

  return bank;
}

/**
 * Logs that the member signed in saved their bank account, or removed it. Everyone reads the log, so it never gives
 * the bank or the number.
 */
export function bankChanged(s: TerminalState, bank: PayoutAccount | null, ctx: Ctx): Change<Member> {
  if (!ctx.who) throw new KeystoneError(NO_SIGN_IN);
  const { bank: _old, ...who } = ctx.who;

  return {
    state: logged(s, TAG, `${ctx.who.name} ${bank ? 'saved' : 'removed'} their bank account.`, ctx),
    record: bank ? { ...who, bank } : who,
    message: bank ? 'Your requests for funds by transfer start with this account from now on.' : 'Your bank account is removed.',
  };
}

/** Logs that the member signed in changed their name, from `from` to `to`. */
export function nameChanged(s: TerminalState, from: string, to: string, ctx: Ctx): Change<Member> {
  if (!ctx.who) throw new KeystoneError(NO_SIGN_IN);

  return {
    state: logged(s, TAG, `${from} changed their name to ${to}.`, ctx),
    record: { ...ctx.who, name: to },
    message: `Keystone shows you as ${to} from now on.`,
  };
}
