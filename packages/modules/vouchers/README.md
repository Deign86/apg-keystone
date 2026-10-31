# Check Vouchers

## Owns
- `src/index.tsx`: the register (status changes from the row menu; void asks first), the form, editing in place while a
  voucher is For Approval, Save as new, Print, and Export PDF.
- `src/VoucherPaper.tsx`: the printed voucher, laid out as the company's Disbursement Voucher: payee and address,
  check no. and date of check, particulars and amount, then Prepared, Audited, Approved and Received by. Three copies
  to a sheet, cut apart after printing; Print scales the sheet to one A4 page.
- `src/rules.ts`: its rules (numbering, saving, status changes, the release check number) and what it
  contributes. Tested in `test/rules.test.ts`.

Older vouchers keep the bank and account code they were saved with; neither is entered or printed any more.

## Contributes
- **Overview:** the "Vouchers awaiting approval" figure, each voucher awaiting approval in the waiting list, and the
  "New check voucher" button.
- **Finding:** "N vouchers worth ₱… wait for approval" (priority 20).
- **Home:** a tile.
- **Activity:** log tag `CV`.
- **Draft key:** `vouchers.draft`.

## Needs
Directory records to pay (data, not the Directory module). Payees are vendors, then clients, then employees.

## Removing it
Its figure, finding, waiting items, tile and button disappear. Saved vouchers stay in `state.json`, and vendors they
pay stay protected from deletion.
