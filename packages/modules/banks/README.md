# Bank Accounts

The company's bank accounts: the ones it pays checks from and asks clients to pay into. Under Settings on the rail,
after Data.

## Owns
- `src/rules.ts`: the accounts and their rules, and the service it offers. Tested in `test/rules.test.ts`.
  - **An account** is `{ id, bank, branch, name, number }`: `B-001`, `BPI`, an optional branch, the account name as
    the bank holds it, and the number as it is printed (`4011 0258 68`). Numbers run `B-001`, `B-002`, … from the
    highest in use.
  - **Adding or editing** needs the bank, the account name and the account number. A number already in use is
    refused, naming the account that has it; numbers are compared by their letters and digits, so `4011-0258-68` is
    `4011 0258 68`.
  - **Removing** asks first. Statements already issued keep the payment instructions written on them.
- `src/index.tsx`: the screen. A register of the accounts; **Add account** opens a dialog (Bank, Branch, Account name,
  Account number), a row opens it for editing, and the row menu has Edit… and Remove….
- Its data: `state.ext.banks` = `{ accounts: [{ id, bank, branch, name, number }] }`. **Until any account is saved**,
  the list is the company's account from the reference data (`reference.bankAccounts` in `shared/data/seed.json`,
  BPI · 4011 0258 68), the one the default payment instructions name. Once saved, the saved list is the list, even
  when it is empty.

## Contributes
- **Activity:** log tag `BANK` (filter "Bank Accounts"): each account added, edited and removed.

## Provides
`banks.bank-accounts` (`SERVICES.bankAccounts`, typed `BankAccounts` in core): `accounts(state, ctx)`, the accounts
in the order they were added, and `label(account)`, how one is named in a list ("BPI · 4011 0258 68"). Billing's
**Pay into** lists them and writes the one picked into a statement's payment instructions; Check Vouchers' **Bank**
lists them for the account a check is drawn on.

## Needs
Nothing.

## Removing it
The screen, its log filter and the bank-accounts service disappear. Billing Statements then has no **Pay into**; its
payment instructions are typed as before, and every statement keeps the text it was saved with. Check Vouchers has no
**Bank** field, and every voucher keeps the bank it was saved with. Saved accounts stay
in `state.json` under `ext.banks`, and putting the module back finds them there.
