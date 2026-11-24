# Check Vouchers

## Owns
- `src/index.tsx`: two tabs, **Voucher register** (shown first, with the count of vouchers) and **Voucher entry** (the
  form beside the voucher it prints, the tab naming the voucher open in it, or New). Opening a voucher, New voucher, and
  Overview's and Home's actions show the entry tab; which tab is shown is kept with the drafts (`vouchers.view`), so
  it is the same on coming back. The register (Edit voucher, or View voucher once it can no longer change, and status changes from
  the row menu; void asks first; ten vouchers to a page; the voucher open in the form marked in its row), the form, editing in place while a
  voucher is For Approval or Approved, Save as new, Print, and Export PDF. An approved voucher stays open so a mistake
  on it can be put right: writing in only its Check No. and Date of check keeps the approval; any other change, saved by
  anyone but the CEO, sends it back for approval (**Save and return for approval**, `returnsForApproval`). A released
  or void one opens read-only and prints as it was saved; Copy to new voucher starts a new one from it, with no check
  yet.
- The order: For Approval, then Approved, then Released with the check number. A voucher the CEO saves (signed in,
  role `owner`) is approved as it is saved, with **Save and approve** (docs/adr/0022); anyone else's waits for approval.
  Approval can be taken back until the check is released; a released voucher can only be voided, and a void voucher
  stays void.
- **The register does not grow without end.** A void voucher is cleared from it 7 days after it was voided
  (`VOID_KEPT_DAYS`, on open, one log line), and **Delete voucher…** in its row menu clears it now, after asking. Only a
  void voucher can be deleted. Numbering follows the register: the next voucher is one past the highest 888- number left, so deleting the last
  vouchers brings the count back down and their numbers are given out again. (An earlier build held deleted numbers
  back under `state.ext.vouchers`; opening the app drops that.) Several vouchers can be ticked and approved, released,
  voided or deleted together. A voucher released before this month folds into a dropdown for the month it is dated, newest
  month first, each showing its count and total; everything still waiting, everything released this month and every
  void voucher stays on top (`voucherRegister`). A voucher is dated as it is released (`released`) and voided
  (`voided`); older ones count from their own date. Vouchers to the same payee fold into one row with their count and
  total, which opens to show them (`payeeKey`: the name in capitals, letters and digits only, so "Meralco" and "MERALCO."
  are one payee).
- **Names are in capitals:** the payee, the issuer and the three signatories turn to capitals as they are typed, are
  saved that way, and print that way, older vouchers too. Positions and addresses stay as typed.
- `src/VoucherPaper.tsx`: the printed Check Voucher, headed by the Alpha Premier Group of Companies logo with the
  company's built-in address right beside it (core's `COMPANY`, docs/adr/0023; the logo names the company), and ruled into boxes like the company's cash
  voucher, out to near the paper's edges: payee and TIN, address, issuer and bank, the number, date, check no. and date
  of check, particulars and amount, the total in figures and in words, then a box each for Prepared, Audited, Approved
  and Received payment by, each signatory's name above their position, as the form lists them. Everything filled in
  is bold. A firm line runs between the form's parts, a light one between the boxes inside each part, and no frame
  runs around it, so nothing is drawn along the paper's edges; the
  particulars' headings and the total sit on pale gold bands, in the paper's gold. The voucher prints twice on one A4
  sheet, a copy on each half, cut apart along the dashed line across the middle; Export PDF makes the same page.
- The payee and their address are typed on the voucher, not picked from the directory, and a new voucher starts with
  neither. A voucher saved before then holds a directory code, and prints and loads that record's name and address
  (`payeeOf`). The TIN prints only when it is typed on the voucher. The issuer and the positions start as the last
  voucher's, like the signatories.
- One line divides the form's right-hand column, the dates and the amounts, from top to total: each part draws it on
  that column's left, and the tables keep their borders separate, inside each cell, so none falls half a pixel to one
  side.
- `src/rules.ts`: its rules (numbering, saving, approving the CEO's own, status changes, the release check number, the
  lock once released, what an edit does to an approval, copying one) and what it contributes. Tested in
  `test/rules.test.ts`.
- Numbering: 888-001, 888-002 and on, with no year (older vouchers keep their CV-2026-… or 8888-… numbers). A new
  voucher's CV No. offers the next number, as the register stands when it is saved, and can be changed, as Billing's
  Invoice No. can: the number typed is kept, and one already used is refused with the next free one (`draftNo`). A saved
  voucher keeps its number. A new voucher's signatories start as the last voucher's, so each preparer types their full
  name once.
- Opening a voucher (its row, or Edit/View in its menu) and New voucher bring the form into view, under the register.

Older vouchers keep the account code they were saved with; it is no longer entered or printed.

## Contributes
- **Overview:** the "Vouchers awaiting approval" figure, each voucher awaiting approval in the waiting list, and the
  "New check voucher" button.
- **Finding:** "N vouchers worth ₱… wait for approval" (priority 20).
- **Home:** a tile.
- **On open:** void vouchers 7 days past voiding are cleared from the register.
- **Activity:** log tag `CV`.
- **Draft key:** `vouchers.draft`.
- **Save draft:** the form's work kept with the records as it is typed, and when the form or Keystone is left, listed
  under Drafts above the register, opened again or deleted; saving the voucher for real finishes it (docs/adr/0041). A
  draft has no number: it takes the next one when it is saved.
- **Directory:** a record that an older voucher names by code is kept (`refersTo`), marked `CV`.

## Needs
Directory records (data, not the Directory module), only for vouchers saved with a directory code, and for one drafted
through `vouchers.drafts`, which still names its payee by code and takes that record's name and address.
Optionally the bank-accounts service (Bank Accounts): the form's **Bank** lists its accounts for the one a check is
drawn on, and **Others…** last. Others opens a small form (Bank name, Account number, Account name starting as the
company's, an optional Branch) whose **Save account** keeps the account in Bank Accounts through the service and picks
it, so no account has to be added on that screen first, nor typed again on a later voucher. **Remove…** beside the list
removes the account picked, after asking; the check is then drawn on the first account still kept. Vouchers already
saved keep the bank written on them. Without the service there is no Bank field, and a voucher prints the bank it was
saved with, if any.

## Removing it
Its figure, finding, waiting items, tile and button disappear. Saved vouchers stay in `state.json`, and vendors they
pay stay protected from deletion.
