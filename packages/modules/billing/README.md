# Billing Statements

## Owns
- `src/index.tsx`: the register (Mark paid, sent or overdue; void asks first), the form, VAT and EWT from the client's
  setup, editing in place while Sent, Print, and Export PDF.
- `src/StatementPaper.tsx`: the printed statement.
- `src/rules.ts`: its rules (totals with VAT and EWT, numbering, defaults from the client, `recordPayment`,
  overdue on open) and what it contributes. Tested in `test/rules.test.ts`.

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
