# Check Vouchers

## Owns
- `src/index.tsx`: the register (status changes from the row menu; void asks first), the form, editing in place while a
  voucher is For Approval, Save as new, Print, and Export PDF. An approved, released or void voucher opens read-only
  and prints as it was saved; Copy to new voucher starts a new one from it, with no check yet.
- The order: For Approval, then Approved, then Released with the check number. Approval can be taken back until the
  check is released; a released voucher can only be voided, and a void voucher stays void.
- `src/VoucherPaper.tsx`: the printed Check Voucher, ruled into boxes like the company's cash voucher, out to near the
  paper's edges: payee and TIN, address, bank and issuer, the number, date, check no. and date of check, particulars
  and amount, the total in figures and in words, then a box each for Prepared, Audited, Approved and Received payment
  by, each signatory's position above their name. Everything filled in is bold. The voucher prints twice on one A4
  sheet, a copy on each half, cut apart along the dashed line across the middle; Export PDF makes the same page.
- The TIN prints only when it is typed on the voucher; the directory's TIN is never put in. The issuer and the
  positions start as the last voucher's, like the signatories.
- `src/rules.ts`: its rules (numbering, saving, status changes, the release check number, the lock on an approved
  voucher, copying one) and what it contributes. Tested in `test/rules.test.ts`.
- Numbering: 888-001, 888-002 and on, with no year (older vouchers keep their CV-2026-… or 8888-… numbers). A new
  voucher's signatories start as the last voucher's, so each preparer types their full name once.

Older vouchers keep the account code they were saved with; it is no longer entered or printed.

## Contributes
- **Overview:** the "Vouchers awaiting approval" figure, each voucher awaiting approval in the waiting list, and the
  "New check voucher" button.
- **Finding:** "N vouchers worth ₱… wait for approval" (priority 20).
- **Home:** a tile.
- **Activity:** log tag `CV`.
- **Draft key:** `vouchers.draft`.

## Needs
Directory records to pay (data, not the Directory module). Payees are vendors, then clients, then employees.
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
