# 0011. Requests for funds, decided by the owner

Status: Accepted · Date: 2026-11-11

## Context

- **Spending starts with a request.** HR buying for the Christmas party, or admin paying a supplier, first needs Sir
  Mark's go-ahead. Today that happens in chat, and the voucher is typed up afterwards; nothing records what was asked,
  for how much, or what he answered.
- **Sir Mark asked for a form:** what the money is for, the budget, the payee, and when it must be settled (as soon as
  possible, or by a date). Only he approves or declines, from his PC or his phone. Approving drafts the check voucher
  for that amount, and the person who asked sees the answer.
- **Since 0009 the records can live in Firestore** behind a sign-in, with each member's role (`owner` or `staff`) in
  `keystone/apg/members/{uid}`. Three things stand in the way:
  - No part knows who is signed in.
  - A module's data under `ext` is one document, rewritten whole by every save that touches it. Two people filing
    requests from two computers would each save over the other's.
  - A record is kept as JSON text (`body`), which `firestore.rules` cannot read, so the rules cannot tell an approval
    from any other edit, or one person's request from another's.
- **Check Vouchers** moves a voucher For Approval → Approved → Released. An approved voucher can no longer be changed
  (#21), so its check number goes on before approval.
- **Keystone is a desktop app.** Its browser build has only been a development preview.

## Decision

- **A new module, `funds`** (Requests for Funds, log tag `RF`, numbered `RF-2026-0001`), in the Disbursements section
  after Check Vouchers. A request holds:
  - what it is for, the amount, the payee (a directory record, as on a voucher), and settle by (ASAP or a date);
  - who asked;
  - its status: For Approval, then Approved, Declined or Withdrawn;
  - the decision (who, when, an optional note) and the voucher drafted from it.

  It is kept under `state.ext.funds` (rule 9), with the last number given out.
- **The rules know who is signed in.** `Ctx` gains an optional `who: { uid, name, role }`, read from the member's
  document when the cloud records open. The platform carries it (`Platform.who`); a local build has none.
- **Only the owner decides, and only in the cloud.** A request can be approved or declined only by a member whose
  role is `owner`. A local build has no sign-in, so it files requests but cannot decide them, and its screen says so.
  The requester may edit or withdraw their own request while it waits. A decision is final: to undo an approval, void
  its voucher and file again.
- **Staff see only their own requests; the owner sees all.**
  - Locally there is one computer and no accounts, so its screen lists every request.
  - The activity log, which every member reads, names a request's number and who filed it, never its purpose or
    amount. Once approved, its voucher is in the register like any other, with the purpose in its particulars.
- **The cloud enforces both, not only the screen.**
  - Each request is its own document, `keystone/apg/rf/{no}`. Its `status`, requester `uid` and `decision` are copied
    beside its `body`, and when it is read back those fields win over the body.
  - `firestore.rules`: an owner reads every request; any other member reads only their own, and Keystone reads them
    with a query for their own. A member files a request only as themselves and only For Approval, and edits or
    withdraws only their own while it waits. Only an owner sets Approved or Declined, writes a decision, or changes or
    deletes a decided request (moving the records in, restoring a backup); Keystone itself never does the last two.
  - The kernel change behind it: a `ModuleDef` may declare one list in its data as `documents` (collection, list, key
    field, checked fields, and the field naming the member who may read it). `toDocuments`/`fromDocuments` then keep
    each record of that list in its own document; the rest of the module's data stays in `ext/{id}`. The registry
    refuses a collection that is taken. Payroll-only access (AID-70) can use the same.
  - Staff cannot see each other's numbers, so the last number given out stays in `ext/funds`, which every member
    reads.
- **Approving drafts the voucher through a service.** Check Vouchers publishes `vouchers.drafts`
  (`SERVICES.voucherDrafts`): `draft(state, { payee, amount, particulars }, ctx)` saves a voucher For Approval under
  the next number (8888-…), with one particular, the signatories and bank a new voucher starts with (the last
  voucher's, 0010) and no check yet. The request keeps the voucher's
  number, and the voucher's particular names the request.
  - Accounting adds the check number and date, prints it, and it is approved as every voucher is.
  - Without Check Vouchers installed, approving still records the decision and says that no voucher was drafted.
- **What each person sees outside the screen:**
  - The owner: requests waiting for a decision on Home and Overview (a figure, the finding, waiting items, ASAP ones
    first).
  - A requester: their own requests while they wait, and for seven days after a decision, the answer as the finding
    ("RF-2026-0003 was approved; 8888-001 is drafted.").
- **On a phone:** Keystone's web build, hosted on Firebase Hosting in the same project (`firebase.json › hosting`),
  opens in a phone browser with the same sign-in. Below 768px the shell swaps the rail for a top bar with a menu, and
  the Requests for Funds screen fits a phone. IT deploys it (docs/FIREBASE.md); CI does not.

## Consequences

- **Good:**
  - Every request, and Sir Mark's answer, is on record, and approving leaves a voucher ready for accounting.
  - Two people filing at once no longer save over each other: each request is its own document.
  - What a staff member may read or decide is held by `firestore.rules`, not by the screen.
  - Funds works without Check Vouchers, and Check Vouchers without Funds.
- **Cost and limits:**
  - No live updates yet (0009): a requester sees the answer the next time Keystone opens, and the owner sees new
    requests the same way.
  - Two people filing at the same moment can take the same number. The rules refuse the second save, which then
    shows "Could not save"; the first request is kept.
  - The voucher is numbered from what the owner's computer last read. If accounting saved a voucher since, the later
    save wins (0009), so the owner reopens Keystone before deciding when it has been open a long time.
  - The owner approves twice: the request, then its voucher once accounting has filled it in.
  - A local build cannot tell people apart, so the requester types their name, and nobody there can decide.
  - The web build puts Keystone's sign-in page on the internet. The records stay behind the sign-in and the rules.
