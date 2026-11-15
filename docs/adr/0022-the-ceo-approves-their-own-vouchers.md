# 0022. The owner is the CEO, and the CEO's own vouchers need no approval
Status: Accepted · Date: 2026-11-16
## Context
The member who makes accounts and decides requests for funds (docs/adr/0011, 0014) was shown as the **Owner**. At APG
that person is the CEO, and the CEO is also who approves check vouchers. A voucher the CEO makes still waited For
Approval, for the CEO to approve it again from its row menu.

An approved voucher could no longer be changed, and a voucher is released only once it has its check number. So a
voucher approved without a check number yet could not be released: the check could not be written on it.

## Decision
- **Keystone shows the owner as the CEO:** the rail ("Mark Reyes · CEO"), User Accounts' Role column, Profile, and
  every sentence that named the owner. `roleLabel` moves to core, so one place decides the name. The role stays saved
  as `owner` on each member document, where `firestore.rules` read it, so no account in the cloud changes.
- **A voucher the CEO saves is approved as it is saved** (`approvesOnSave` in Check Vouchers' rules): the button says
  **Save and approve** and the log says who approved it. Anyone else's voucher waits For Approval as before. Editing a
  voucher approves nothing, and a voucher the `vouchers.drafts` service drafts (the CEO approving a request for funds
  paid by check) still waits, for accounting to complete it.
- **An approved voucher still takes its check number and date of check until it is released** (`takesCheck`,
  `withCheck`). Nothing else on it changes; the form says so and offers **Save check**. A released or void voucher
  stays read-only.

## Consequences
- The CEO's vouchers never show on Overview, Home or the finding as waiting for approval.
- Accounting can write the check after any voucher is approved, the CEO's or one the CEO approved from the register.
- On a computer where nobody signs in there is no CEO: every voucher waits For Approval, as before.
- Whoever marks a voucher approved from its row menu is still not checked; approving stays a step anyone records.
