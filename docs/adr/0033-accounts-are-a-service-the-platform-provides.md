# 0033. Accounts are a service the platform provides, and a connector says what the CEO may give a member

Status: Accepted · Date: 2026-11-18 · Changes [0014](0014-the-owner-makes-accounts.md), [0015](0015-the-owner-removes-staff-accounts.md), [0016](0016-changing-and-resetting-a-password.md), [0020](0020-changing-your-own-name.md) and [0030](0030-the-ceo-names-attendance-admins.md)

## Context

- 0014 to 0016 and 0020 put the accounts on the kit's `Platform` (`accounts: AppAccounts`), so every account
  capability was a change to the kernel, the Firebase platform and the accounts module together. `platform.ts` and
  `platform/firestore.ts` changed together in eight commits.
- 0030 added `attendanceAdmin` and `setAttendanceAdmin` to that kernel contract, and the accounts module held the
  wording and menu for the attendance tracker. Removing the attendance connector left "Make attendance admin…" in
  place: one connected system's idea had entered the kernel and a module without passing through `Connector`.
- "Is this the CEO?" was written five times (`ctx.who?.role === 'owner'`), and the sentences that refuse were typed
  once in the accounts module and again in `platform/firestore.ts`.
- The Firebase platform decided what a caller may do from a flag that `member()` set, so its accounts depended on
  `member()` having been called first.
- The owner was away when this was decided and asked for the work to be finished; it is listed for him in
  `docs/untangle/decision-log.md` under "Calls made without the owner".

## Decision

- **`accounts` is a published service** (`SERVICES.accounts`, contract `Accounts` in core's `services.ts`, beside the
  others). A platform offers services under `Platform.provides`; the cloud platform offers this one. A screen asks
  `useModuleApp().service(SERVICES.accounts)` and works without it, as with any service. `Platform` no longer
  mentions accounts.
- **A connector contributes what the CEO may give a member** (`Connector.memberGrant`): the yes-or-no field kept on
  the member document, its label, and the question asked first. User Accounts lists the installed connectors' grants;
  the accounts module and the kit name no connected system. The attendance connector contributes "attendance admin".
- **The service writes only a field a connector contributed** (`setGrant(uid, field, on)`), and only for an owner.
  The registry refuses a connector whose field is `role`, `name` or `email`, or one another connector already keeps.
- **`isOwner` is asked in one place** (core), and the refusals are core's: "Only the CEO makes accounts.", "Only the
  CEO removes accounts.", "You cannot remove your own account.", "Only the CEO decides who opens …".
- **The cloud platform builds its accounts for the member who signed in** (`cloud.accounts(who)`), after
  `cloud.member()` has answered. The order at start is the same: sign in, read the member, then the records.
- **Nothing in the cloud changes.** The field is still `attendanceAdmin`, written `true` or `false` by an owner, and
  `firestore.rules` is untouched. The attendance kiosk reads the field exactly as before.

## Consequences

- **Good:** a new account capability is a change to the contract in core and its provider; a second connected system
  that wants a tick on a member contributes one without a change to the kernel or the accounts module; removing the
  attendance connector removes its menu item.
- **Cost and limits:**
  - Every sentence User Accounts shows for "attendance admin" is the same, but the words now live in
    `packages/connectors/attendance`. The accounts module's tests use a stand-in worded the same;
    `apps/keystone/src/test/accounts.test.tsx` checks the real two together.
  - A member list read by a Keystone without the attendance connector does not show who is an attendance admin. The
    field stays on the member document.
  - The registry does not see a platform's services, so "one provider per service" is not checked between a module
    and the platform; a module's is found first. No module offers `accounts`, and a contract test holds that.
  - `MemberAccount.attendanceAdmin` is gone from the types; a member's grants are `grants: ['attendanceAdmin']`.
