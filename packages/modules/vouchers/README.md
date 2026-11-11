# Check Vouchers

## Owns
- `src/index.tsx`: the register (status changes from the row menu; void asks first), the form, editing in place while a
  voucher is For Approval, Save as new, Print, and Export PDF. An approved, released or void voucher opens read-only
  and prints as it was saved; Copy to new voucher starts a new one from it, with no check yet.
- The order: For Approval, then Approved, then Released with the check number. Approval can be taken back until the
  check is released; a released voucher can only be voided, and a void voucher stays void.
- `src/VoucherPaper.tsx`: the printed Check Voucher, ruled into boxes like the company's cash voucher: payee (with
  TIN) and address, the number, date, check no., bank and date of check, particulars and amount, the total in figures
  and in words, then a box each for Prepared, Audited, Approved and Received payment by. One voucher on the top half
  of an A4 sheet, cut once along the dashed line; Print and Export PDF scale it to that half.
- `src/rules.ts`: its rules (numbering, saving, status changes, the release check number, the lock on an approved
  voucher, copying one) and what it contributes. Tested in `test/rules.test.ts`.
- Numbering: 8888-001, 8888-002 and on, with no year (older vouchers keep their CV-2026-… numbers). A new
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
drawn on. Without it there is no Bank field, and a voucher prints the bank it was saved with, if any.

## Removing it
Its figure, finding, waiting items, tile and button disappear. Saved vouchers stay in `state.json`, and vendors they
pay stay protected from deletion.
