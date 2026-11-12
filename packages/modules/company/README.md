# Company Details

The company's name, address and contacts as its documents print them, and what each new voucher, statement and ID
starts from. Last under Settings on the rail, after Bank Accounts (docs/adr/0018).

## Owns
- `src/rules.ts`: changing the details. Tested in `test/rules.test.ts`.
  - **Saving** needs the company's name. Each line is kept with single spaces; payment instructions and the closing
    note keep their lines. Days to pay (0–365) and years an ID is valid (0–10) are whole numbers, blank for not set.
  - **Signed in, only an owner saves them;** staff see them read-only. firestore.rules hold the same: in the cloud the
    details are one document, `keystone/apg/company/details`, that only an owner writes. Where nobody signs in (the
    records on one computer), whoever uses it may.
- `src/index.tsx`: the screen. One form in four parts: the letterhead (name, address, contact line, short address,
  phone, billing email), check vouchers (prepared, audited and approved by), billing statements (payment instructions,
  closing note, terms, days to pay) and employee IDs (signatory, years valid).
- The data itself is the kernel's: `state.company` (`CompanyDetails` in core), read everywhere with `companyOf`, which
  gives "" (or 0) for anything not filled in. Nothing of it is built into Keystone.

## Contributes
- **Finding:** "Fill in Company Details…" on Home and Overview until the name is saved, below anything more pressing.
- **Activity:** log tag `CO` (filter "Company Details"): each save.

## Needs
Nothing. Vouchers, Billing, ID Maker and Payroll read the details through core, not through this module.

## Removing it
The screen, its finding and its log filter disappear. The details stay in `state.company` (and the cloud's
`company/details`), and every document keeps printing them; they can no longer be changed in Keystone.
