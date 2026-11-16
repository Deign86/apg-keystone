# Company Details

What each new voucher, statement and ID starts from. The company itself, its name, address and contacts, is built in
(core's `COMPANY`, docs/adr/0023) and isn't typed here. Last under Settings on the rail, after Bank Accounts
(docs/adr/0018).

## Owns
- `src/rules.ts`: changing what documents start from. Tested in `test/rules.test.ts`.
  - **Saving** keeps each line with single spaces; payment instructions and the closing note keep their lines. Days
    to pay (0–365) and years an ID is valid (0–10) are whole numbers, blank for not set.
  - **Signed in, only a CEO saves them;** staff see them read-only. firestore.rules hold the same: in the cloud the
    details are one document, `keystone/apg/company/details`, that only a CEO writes. Where nobody signs in (the
    records on one computer), whoever uses it may.
- `src/index.tsx`: the screen. One form in three parts: check vouchers (prepared, audited and approved by), billing
  statements (payment instructions, closing note, terms, days to pay) and employee IDs (signatory, years valid).
- The data itself is the kernel's: `state.company` (`CompanyDetails` in core), read everywhere with `companyOf`, which
  gives the built-in company and "" (or 0) for anything not filled in.

## Contributes
- **Activity:** log tag `CO` (filter "Company Details"): each save.

## Needs
Nothing. Vouchers, Billing, ID Maker and Payroll read the details through core, not through this module.

## Removing it
The screen and its log filter disappear. What was saved stays in `state.company` (and the cloud's
`company/details`), and every document keeps printing it and the built-in company; it can no longer be changed in
Keystone.
