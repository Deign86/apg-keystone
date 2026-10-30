# Billing Statements

## Owns
- `index.tsx`: the register (Mark paid, sent or overdue; void asks first), the form, VAT and EWT from the client's
  setup, editing in place while Sent, Print, and Export PDF.
- `StatementPaper.tsx`: the printed statement.
- Rules: `@keystone/core` › `domains/billing.ts`, including `recordPayment`.

## Contributes
- **Overview:** the "Receivables outstanding" figure (the lead), open statements in the waiting list, and the "New
  statement" button.
- **Finding:** overdue money (priority 30, the most urgent).
- **On open:** Sent statements past their due date become Overdue.
- **Home:** a tile.
- **Activity:** log tag `BS`.
- **Draft key:** `billing.draft`.

## Needs
Clients in the directory (data).

## Removing it
The above disappear, and the website's Website screen is left out (it `requires: ['billing']`). Saved statements stay
in `state.json`.
