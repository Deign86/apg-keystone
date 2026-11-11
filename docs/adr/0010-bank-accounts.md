# 0010. Bank accounts are their own part, and statements and vouchers pick one through a service

Status: Accepted · Date: 2026-11-11

## Context

- The company pays checks from, and asks clients to pay into, more than one bank.
- Keystone knew one account, and only as text: the default payment instructions in the reference data ("Bank: BPI",
  "Account Name: …", "Account Number: 4011 0258 68"). To bill a client into another account, someone retyped those
  lines on every statement.
- Billing owns the statement and its payment instructions. A list of the company's accounts is not a billing
  decision: checks are drawn on the same accounts.

## Decision

- **A new module, `banks` (Bank Accounts),** under Settings on the rail after Data. It owns the company's bank
  accounts: a register, a dialog to add or edit one (Bank, Branch, Account name, Account number), and removing one
  after asking. The bank, account name and number are required, and a number already in use is refused, naming the
  account that has it. Each change is logged under `BANK`.
- **Saved data:** `state.ext.banks` = `{ accounts: [{ id, bank, branch, name, number }] }` (rule 9), read back with
  core's safe decoders. Until any account is saved, the list is the reference data's: core's seed gains
  `reference.bankAccounts`, holding the BPI account the default payment instructions already name. Nothing is
  written to the saved state until someone changes the list.
- **A new service, `banks.bank-accounts`** (`SERVICES.bankAccounts`, `BankAccounts` in core, with the `BankAccount`
  type):

  ```ts
  interface BankAccounts {
    accounts(state: TerminalState, ctx: Ctx): BankAccount[];
    label(account: BankAccount): string; // "BPI · 4011 0258 68"
  }
  ```

  `accounts` takes the context because, until an account is saved, the list comes from the reference data
  (`ctx.seed`), which rules always read through the context.
- **Billing uses it and works without it.** With the service, the statement form shows **Pay into**, listing the
  accounts and showing the one the payment instructions name (matched by account number). Picking one rewrites the
  Bank, Account Name and Account Number lines and keeps the rest of the text. A statement still saves its payment
  instructions as text, so the printed statement, the PDF and every saved statement are unchanged in format. Without
  the service there is no Pay into, and the instructions are typed as before.
- **Check Vouchers uses it the same way.** With the service, the voucher form shows **Bank**, the account the check is
  drawn on; a new voucher starts with the last voucher's bank, or the first account before any. The voucher keeps it
  as text in `bank`, the prototype's own key, and prints it in the Bank box. Without the service there is no Bank
  field.

## Consequences

- **Good:**
  - Accounts are kept once and picked, not retyped; the printed statement names the account picked.
  - Removing Bank Accounts takes only its screen, its log filter and Pay into with it. Every statement keeps the
    instructions it was saved with, and the saved accounts stay in `state.json` for when the module comes back.
  - Check Vouchers asks the same service for the account a check is drawn on, without importing either part.
- **Cost:**
  - A statement keeps the account as text, not as a reference: editing or removing an account never changes a
    statement already issued, and a statement shows no account under Pay into when its text names none on the list.
  - New statements start from the reference data's payment instructions, which name the BPI account; after that
    account is edited or removed, Pay into shows none until one is picked.
  - Core's seed type gains `reference.bankAccounts`, so the reference data now names the company account twice (in
    the list and in the default instructions). The test in `packages/modules/banks/test/rules.test.ts` holds the two
    together.
