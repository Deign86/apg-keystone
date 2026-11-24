# Billing Statements

## Owns
- `src/index.tsx`: two tabs, **Statements issued** (shown first, with the count) and **Statement entry** (the form
  beside the statement it prints; the tab names the statement open in it, or New). Opening a statement, New
  statement, and Overview's and Home's actions show the entry tab; which tab is shown is kept with the drafts
  (`billing.view`). The register (Mark paid, sent or overdue; void asks first), the form, editing in place while Sent,
  Print, and Export PDF. **Bill to** is typed as it prints; typing a directory client's name brings its VAT, EWT and
  Attention, and any other name leaves them to be set by hand. Its **Address** is typed too (never from the
  directory), kept only when typed and printed under the name. **Prepared by** starts as whoever is signed in,
  **Checked by** and **Approved by** as the last statement's (Company Details' before the first). Each signatory has a
  position under their name (**Preparer's position**, **Checker's position**, **Approver's position**), kept only when
  typed, printed under the name, and started from the last statement's.
- `src/StatementPaper.tsx`: the printed statement, laid out as the company's Billing Statement under every paper's
  letterhead (kit's `Letterhead`: the title across the top, the Group of Companies logo with the address beside it, the
  number and date): Bill to, its address under it when one is typed, and Attention, the invoice box (number, invoice and
  due dates), Qty · Description · Unit price · Amount, then the totals box: Subtotal, VAT (12%), Less: EWT (2% or 5%)
  and the total amount due, every line shown, a dash where a tax does not apply. Then payment instructions, the
  **Penalty** line (the statement's own, `penalty`, started from Company Details' penalty; one saved before it kept one
  prints Company Details'), notes and who signs, each with the signature Company Details keeps for them (docs/adr/0038).
  It prints once, on a whole upright A4 page (the kit's `Sheet`), not twice on a sheet cut in two as the check voucher
  does.
- `src/rules.ts`: its rules (totals with VAT and EWT, numbering, the client typed or from the directory,
  `recordPayment`, overdue on open, the account the payment instructions name) and what it contributes. Tested in
  `test/rules.test.ts`.
- **EWT** is 2% (services) or 5% (rentals and professional fees), picked under **EWT rate** once withholding is ticked
  and kept on the statement as `ewtRate`; a new statement starts at 2%. A statement saved before it kept its rate
  withheld 5% and still does, so its amount due never changes.
- **Pay into**, when Bank Accounts is installed: kit's `BankAccountPicker`, the same list as a check voucher's Bank. It
  shows the account the payment instructions name; picking one rewrites their Bank, Account Name and Account Number
  lines (`payInto`) and keeps the rest of the text. **Others…** adds an account to Bank Accounts and picks it;
  **Remove…** takes the picked one off. A new statement pays into the account the last statement named, else the one
  Company Details' instructions name, else the first kept. Tested with and without the service in
  `test/pay-into.test.tsx`.

**Invoice numbers** are 888- and the statement's date as month, day and year: `888-112426`. A second statement that
day is `888-112426-2`, then `-3` (`nextStatementNo`). A new statement's number follows its date as the date changes
(`withStatementDate`); one typed over it is kept unless it is taken. Older `010100-2026` and `BS-2026-0087` numbers
stay as they are (docs/adr/0038). Older statements keep their billing period and reference;
neither is entered or printed any more.

## Contributes
- **Overview:** the "Receivables outstanding" figure (the lead), open statements in the waiting list, and the "New
  statement" button.
- **Finding:** overdue money (priority 30, the most urgent).
- **On open:** Sent statements past their due date become Overdue.
- **Home:** a tile.
- **Activity:** log tag `BS`.
- **Draft key:** `billing.draft`.
- **Directory:** a client a statement saved before Bill to was typed names by code is kept (`refersTo`), marked `BS`; a
  new client is said to be selectable in Billing Statements (`selects`), where typing its name brings its setup.

## Provides
`billing.statement-payments` (`SERVICES.statementPayments`, typed `StatementPayments` in core): the open statements,
earliest due first, and settling one with a reported payment (a short payment is refused). The website's payment
matching uses it.

## Needs
Clients in the directory (data), for their VAT, EWT and Attention when their name is typed. Uses `banks.bank-accounts` (`SERVICES.bankAccounts`) when it is installed, for Pay
into; without it there is no Pay into, and the payment instructions are typed.

## Removing it
The above disappear, and so does the statement-payments service. Saved statements stay in `state.json`.
