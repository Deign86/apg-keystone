import type { Member } from './state';

// Who may open the company's records in the cloud, as every part sees them (docs/adr/0014, 0033): a member with their
// email, what the CEO asks for a new one, what a connected system lets the CEO give a member, the one test of "is this
// the CEO", and the sentences that refuse. The accounts themselves live with the sign-in, behind the `accounts`
// service (services.ts), which the platform provides.

/**
 * Whether this member is an owner, shown as the CEO. The one place the app asks; firestore.rules asks the same of the
 * member document (`owner(company)`), and is the judge.
 */
export const isOwner = (who: Pick<Member, 'role'> | null | undefined): boolean => who?.role === 'owner';

/** A member of the records in the cloud, with the email they sign in with ('' for one added by hand without it). */
export interface MemberAccount extends Member {
  email: string;
  /** What the CEO has given this member, by the field each is kept under (`MemberGrant.field`). */
  grants?: readonly string[];
}

/** What the CEO gives for a new account: the person's name, their email, and the password they first sign in with. */
export interface NewAccount {
  name: string;
  email: string;
  password: string;
}

/**
 * Something a connected system lets the CEO give a staff member's account, which that system then reads from the
 * member (docs/adr/0030). A connector contributes it (`Connector.memberGrant`); the accounts screen and the platform
 * know only this, never the system.
 */
export interface MemberGrant {
  /** The yes-or-no field kept on the member, which the connected system reads: letters only, never `role`, `name` or `email`. */
  field: string;
  /** Beside the role of a member who has it: "Attendance admin". */
  label: string;
  /** In a sentence, with its article: "an attendance admin". */
  as: string;
  /** What having it opens, to finish "… opens": "the attendance tracker's admin screens". */
  opens: string;
  /** What the CEO is asked first. `who` names the person, with their email when known. */
  asks: {
    give(who: string): string;
    take(who: string): string;
  };
}

/** What a member document already holds; a grant is never kept under one of these. */
export const MEMBER_FIELDS = ['role', 'name', 'email'] as const;

/** Why a grant cannot be contributed, or null when it can. */
export function grantProblem(g: MemberGrant): string | null {
  if (!/^[a-z][A-Za-z]{1,40}$/.test(g.field)) return `the field "${g.field}" must be letters, starting lowercase`;

  if (MEMBER_FIELDS.some((f) => f === g.field)) return `the field "${g.field}" is the member's own`;

  if (!g.label.trim() || !g.as.trim() || !g.opens.trim()) return 'it has no wording';

  return null;
}

// The sentences that refuse, said by the screen before it asks and by the platform when it is asked anyway.

export const ONLY_OWNER_MAKES = 'Only the CEO makes accounts.';
export const ONLY_OWNER_REMOVES = 'Only the CEO removes accounts.';
export const NOT_YOUR_OWN_ACCOUNT = 'You cannot remove your own account.';
export const CANNOT_KEEP_GRANT = 'This Keystone cannot keep that.';

/** "Only the CEO decides who opens the attendance tracker's admin screens." */
export const onlyOwnerGrants = (g: Pick<MemberGrant, 'opens'>) => `Only the CEO decides who opens ${g.opens}.`;
