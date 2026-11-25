# 0038. One letterhead on every paper, dated invoice numbers, a penalty line, and signatures that print themselves

Status: Accepted · Date: 2026-11-24

## Context

Sir Mark marked up a printed billing statement (Nov 24, 2026) for e-billing:

- **The title on top,** above the logo, and the company's **Philippine Stock Exchange Centre address**. The owner wants
  the header changed on every paper, so they all look alike. The check voucher and statement had one header (the Group
  of Companies logo and the address beside it, the title on the right); the payroll sheet, payslip and fund transfer
  request had another (the APG logo, the title on the right, then the company's name, address and contact).
- **Invoice numbers** should be 888- and the date as month, day and year. They were a six-digit running number and
  the year, `010100-2026`.
- **A penalty line** beside the payment instructions. The late-payment terms printed small inside the invoice box.
- **Signatures**, since the statement is sent electronically: each signatory's signature should print by itself.

## Decision

- **One header, kit's `Letterhead`, on every paper:** the title across the top, centred; then the Group of Companies
  logo with the built-in address beside it, and the number and date on the right. `Masthead` is gone. The built-in
  address (core's `COMPANY`, docs/adr/0023) is now "Suites 3104, Philippine Stock Exchange Centre, Tektite East Tower,
  Exchange Road, Ortigas Center, Pasig City 1605".
- **An invoice number is `888-MMDDYY`** from the statement's date (`888-112426`); a second that day is `888-112426-2`,
  then `-3`. A new statement's number follows its date; one typed over it is kept. Saved numbers never change.
  *Amended 2026-11-25:* new numbers are written with no dash after 888, `888112426` (a second that day
  `8881124262`, the count straight after the date), and check vouchers run `888001`, `888002`, on from the highest saved as `888-001`. Saved numbers keep
  their dash.
- **A statement keeps its penalty** (`penalty`, optional), printed as **Penalty** under the payment instructions. A new
  one starts from Company Details' penalty (the field that was "Terms", `billingTerms`); an older statement without one
  prints Company Details'.
- **Company Details keeps each signatory's signature** (`company.signatures`, optional, by the name in capitals with
  single spaces). The CEO uploads a scan or photo, scaled to fit 480 × 160 with its paper made see-through, or draws it.
  Every paper prints the signature above the name of whoever signs it: the statement, the check voucher and the fund
  transfer request. A signature is at most 200,000 characters and all details at most 800,000, inside the cloud's
  limit for the one `company/details` record. No new collection; `firestore.rules` already let only the CEO write it.

## Consequences

- Every paper's header changes; the payroll sheet, payslip and request no longer print the company's name and
  contact at the top (the logo names the company, as on the voucher).
- Anyone who prepares a document prints the signature of whoever they pick to sign it. The signatures are the CEO's to
  add and remove, and each change is in the Activity Log.
