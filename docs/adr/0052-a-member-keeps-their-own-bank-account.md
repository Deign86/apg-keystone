# 0052. A member keeps their own bank account, and their requests for funds start with it

Status: Accepted · Date: 2026-11-26

## Context

- **The ask:** bank account numbers should be specific to each user account. Each person keeps their own bank
  account, and every request for funds they file by bank transfer fills it in by itself.
- **What there was:** a new request started with the account the same person's last transfer went to (0021). A first
  request started blank. Nothing kept the account apart from the requests.
- **Who may change it matters.** The account is where approved money goes. If someone could change another person's
  saved account, that person's next request would send the money elsewhere, and nobody might notice.
- **Where it could live:**
  - In the funds module's own data (`ext/funds`). Every member writes that document, so anyone could change anyone's
    account. Refused.
  - On each member's own document (`keystone/apg/members/{uid}`). firestore.rules already let a member change only
    their own name there (0020), and an owner anything.

## Decision

- **The member document keeps an optional `bank`:** `{ bank, branch, name, number }`. It is `PayoutAccount` in core,
  and `Member.bank` on whoever is signed in (`ctx.who`). `bank` joins `MEMBER_FIELDS`, so no connected system can claim
  it as a grant (0030).
- **The `accounts` service gains `setBank?(bank | null)`.** It changes the member signed in only. The platform writes
  it, with null deleting the field. The kit moves `ctx.who` when it succeeds, as it does for `rename`.
- **Profile** has a "Your bank account" form with these fields: bank, branch (optional), account name and account
  number. It has **Save bank account**, and **Remove…**, which asks first.
  - The Profile module's own rules check the form (`checkBank`): a bank, an account name, a number with a digit, and
    short text in each field. A refusal names the field.
  - The log says "Ana Cruz saved their bank account." or "… removed …". Everyone reads the log, so it never shows the
    bank or the number.
- **Requests for Funds:** a new request paid by transfer starts with `ctx.who.bank`. Without it, it starts with the
  account the person's last transfer went to, as before.
  - The account can still be changed on the request.
  - The form says where the account came from, with a link to Profile when Profile is installed.
- **firestore.rules:** a member may update their own member document when only `bank` changes, and it is a proper
  account (`payoutAccount`) or removed. Nobody but an owner changes someone else's. The rules for the name and the role
  are unchanged.
- **Where nobody signs in** there is no member, so there is no profile. A request there starts as before.

## Consequences

- **Good:**
  - The account is typed once, on Profile, and follows the person to every computer and phone.
  - Only they, or the CEO, can change it.
- **Cost and limits:**
  - Member documents are read by every member, and every request is too (0051). So a member's saved account is no more
    private than the requests that carry it.
  - `ctx.who` is read when Keystone opens. An account changed on another device reaches this one the next time Keystone
    opens, or after signing in again.
  - The live `firestore.rules` must be published for Save bank account to work. Until then, saving one is refused.
