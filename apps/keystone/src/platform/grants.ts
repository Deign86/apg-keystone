import { CANNOT_KEEP_GRANT, isOwner, onlyOwnerGrants, type Member, type MemberAccount, type MemberGrant } from '@keystone/core';

// What a connected system lets the CEO give a member (Connector.memberGrant, docs/adr/0030), as the cloud platform
// keeps it: a yes-or-no field on the member document. Apart from firestore.ts so it needs no Firebase to test.

/**
 * The grant to write for this field, or the sentence that refuses. Only a field a connector contributed is ever
 * written to a member document (never `role`, and nothing a part made up), and only by an owner; firestore.rules hold
 * the second line too.
 */
export function grantToWrite(grants: readonly MemberGrant[], field: string, who: Member): MemberGrant {
  const grant = grants.find((g) => g.field === field);

  if (!grant) throw new Error(CANNOT_KEEP_GRANT);

  if (!isOwner(who)) throw new Error(onlyOwnerGrants(grant));

  return grant;
}

/** Which of the grants a member document holds, by field. Anything but `true` is "no". */
export const grantsHeld = (grants: readonly MemberGrant[], holds: (field: string) => boolean): NonNullable<MemberAccount['grants']> =>
  grants.flatMap((g) => (holds(g.field) ? [g.field] : []));
