# Requests for Funds

## Owns
- `src/index.tsx`: the screen. The owner sees each request waiting for a decision as a card (amount, purpose, payee,
  who asked, settle by) with an optional note, Decline and Approve, each asked first; the cards stack on a phone.
  Below them, the register of requests, and the form to ask for funds: what it is for, the amount, the payee from the
  directory, and settle ASAP or by a date. Signed in, the requester is the member; with nobody signed in, they type
  their name. A request still waiting opens for its requester to edit or withdraw; any other opens read-only, with the
  owner's answer and the voucher it drafted.
- `src/rules.ts`: its rules, tested in `test/rules.test.ts`:
  - numbering `RF-2026-0001` and on, from the last number given out (kept where every member reads it, because staff
    read only their own requests in the cloud);
  - filing, editing and withdrawing, by the requester only, while the request waits;
  - deciding, by the owner signed in to the cloud only (`ctx.who.role === 'owner'`); a decision is final;
  - the log lines, which name a request's number and who filed or decided it, never its purpose or amount.
- The order: For Approval, then Approved, Declined or Withdrawn.

## Contributes
- **Overview:** the "Requests for funds" figure, each request waiting in the waiting list (ASAP ones first), and the
  "New request for funds" button.
- **Finding:** for the owner, the requests waiting for a decision (priority 35 when one is ASAP, else 25); for a
  requester, the answer to their request for seven days (40), then their requests still waiting (5); with nobody
  signed in, the requests waiting for the owner (15).
- **Home:** a tile.
- **Activity:** log tag `RF`.
- **Cloud documents:** `documents` keeps each request in `keystone/apg/rf/{no}`, with `status`, `uid` and `decision`
  beside its body for `firestore.rules`, which let only the owner decide and staff read only their own
  (docs/adr/0011). The rest of its data (the last number) stays in `ext/funds`.
- **Draft key:** `funds.draft`.

## Needs
- Directory records to pay (data, not the Directory module).
- `vouchers.drafts` from Check Vouchers, to draft the check voucher when the owner approves: one particular, the
  request's purpose and number, For Approval. Without Check Vouchers the approval stands and the screen says that no
  voucher was drafted.
- A sign-in to decide anything: the cloud build's member, with role `owner`. A build that keeps its records on the
  computer files requests but never decides them.

## Removing it
Its figure, finding, waiting items, tile, button and log filter disappear. Saved requests stay in `state.json` under
`ext.funds`; in the cloud they stay in `rf`, unread, until a build with this module opens them again. Check Vouchers
keeps every voucher an approval drafted.
