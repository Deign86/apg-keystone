# 0051. Every member sees every request for funds, and the CEO can delete one

Status: Accepted · Date: 2026-11-26

## Context

- **0011 kept each request to its requester and the CEO.** In the cloud, staff read only their own requests
  (`readBy: 'uid'`, and a `firestore.rules` read limited to the requester or an owner).
- **The ask:** requests for funds should be visible to everyone. When the marketing staff member asks for funds,
  every other account sees what she asked for. Requests are not kept apart per user.
- **Also asked:**
  - a request can be deleted from the register, whatever its status;
  - the register's "Status" becomes **Transaction state**, which is only Pending or Processing. A new **Payment
    status** column shows Paid, or Pending if not yet;
  - "Settle" becomes **Deadline**, and "Asked by" becomes **Requested by**;
  - money needs wet signatures, so the fund transfer request shows the saved e-signatures only when asked, with a
    checkmark.

## Decision

- **Every member reads every request**, with its expenses, its account, the CEO's decision and its receipts (0050).
  - `requestDocuments` no longer has `readBy`, so a staff member's Keystone asks for the whole `rf` collection.
  - `firestore.rules` changes the read on `rf/{no}` to `member(company)`.
  - Writing does not change. Only the requester files, edits, withdraws or marks paid their own request. Only the
    CEO decides one.
  - Someone else's request opens read-only, saying who can change it. The register's tab is "Requests" for everyone.
  - A request's saved drafts stay private to their author (0041). A draft is not a request yet.
- **The CEO deletes requests** (`deleteRequest`, `deleteRequests`), from a row's menu or for the ticked rows. Each
  delete is asked first and allowed whatever the status.
  - It matches `firestore.rules`, which already let only an owner delete an `rf` document.
  - On a computer where nobody signs in, whoever is there may delete, as they may file.
  - The number is never given out again: `last` keeps the highest number used.
  - A voucher that an approval drafted stays in Check Vouchers.
  - The log says who deleted it.
- **Two columns say where a request stands.** The saved statuses do not change, so nothing is moved in the cloud:

  | Saved status | Transaction state | Payment status |
  |---|---|---|
  | For Approval | Pending | Pending |
  | Approved | Processing | Pending |
  | Paid | Processing | Paid |
  | Declined | Declined | — |
  | Withdrawn | Withdrawn | — |

  Overview's waiting list calls a request waiting for the CEO "Pending".
- **Words:** the form's "Settle" and "Settle by" are now "Deadline" and "Deadline date". The register's "Settle" is now
  "Deadline", and the fund transfer request's "Settle by" is now "Deadline". "Asked by" is now "Requested by" on the
  register and on the approval card.
- **E-signatures are optional on the fund transfer request.** Below the form there is a checkbox, "Show e-signatures on
  the fund transfer request (leave unticked to sign by hand)". It is unticked by default, and then the paper prints
  blank lines to sign by hand. Ticked, the paper prints the signatures that Company Details keeps (0045). The choice is
  kept with the drafts (`funds.esign`), so it stays the same when you come back. Other papers are unchanged.

## Consequences

- **Good:**
  - Everyone sees what has been asked for and what was approved, so nobody asks twice for the same thing.
  - A test or mistaken request can be cleared away.
  - The payment status shows at a glance which approved requests still owe their receipts.
- **Cost and limits:**
  - Receipts and accounts are now read by every member, not only by the requester and the CEO. Sensitive details
    belong somewhere else.
  - Every member's Keystone now downloads every request, receipts included. 0050's limit on size now applies to
    everyone, not only to the CEO.
  - A delete cannot be undone. Only a backup brings a deleted request back.
  - The live `firestore.rules` must be published after the merge. Until then, staff still read only their own.
