import { CLOUD_LAYOUT, KeystoneError, logged, type Change, type Ctx, type Member, type TerminalState } from '@keystone/core';

// Your own profile (docs/adr/0020): the name Keystone shows for whoever is signed in, in the rail, as who prepared a
// voucher or asked for funds, and in the activity log. The name lives with the sign-in (Platform.accounts); these rules
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

  if (!next) throw new KeystoneError('Enter your name, as Keystone should show it.');

  if (next.length > MAX_NAME) throw new KeystoneError(`Keep your name to ${MAX_NAME} characters.`);

  if (next === ctx.who.name) throw new KeystoneError('That is already your name.');

  return next;
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
