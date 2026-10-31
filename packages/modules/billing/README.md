# Billing Statements

## Owns
- `src/index.tsx`: the register (Mark paid, sent or overdue; void asks first), the form, VAT and EWT from the client's
  setup, editing in place while Sent, Print, and Export PDF.
- `src/StatementPaper.tsx`: the printed statement, laid out as the company's Billing Statement: Bill to and
  Attention, the invoice and due dates, the late-payment penalty, Qty · Description · Unit price · Amount with tax,
  subtotal, VAT, EWT when the client withholds, the total, then payment instructions and notes.
- `src/rules.ts`: its rules (totals with VAT and EWT, each line's amount with tax, numbering, defaults from the client,
  `recordPayment`, overdue on open) and what it contributes. Tested in `test/rules.test.ts`.

**Invoice numbers** are a six-digit running number and the year, `010100-2026`. A new statement offers the next one
(one past the highest in that format, across years) and keeps a number typed over it unless it is taken. Older
`BS-2026-0087` numbers stay as they are and don't count. Older statements keep their billing period and reference;
neither is entered or printed any more.

## Contributes
- **Overview:** the "Receivables outstanding" figure (the lead), open statements in the waiting list, and the "New
  statement" button.
- **Finding:** overdue money (priority 30, the most urgent).
- **On open:** Sent statements past their due date become Overdue.
- **Home:** a tile.
- **Activity:** log tag `BS`.
- **Draft key:** `billing.draft`.

## Provides
`billing.statement-payments` (`SERVICES.statementPayments`, typed `StatementPayments` in core): the open statements,
earliest due first, and settling one with a reported payment (a short payment is refused). The website's payment
matching uses it.

## Needs
Clients in the directory (data).

## Removing it
The above disappear. The Website screen stays and still lists payments and inquiries, but says matching needs
Billing. Saved statements stay in `state.json`.
