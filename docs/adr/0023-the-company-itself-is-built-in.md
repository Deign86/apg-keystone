# 0023. The company itself is built in

Status: Accepted · Date: 2026-11-16 · Supersedes 0018 for the company's own details

## Context

- **Every document is headed by the company:** its name, address and contacts. They came from Company Details, so in
  records where nobody had typed them (a new computer, or the cloud records the CEO started), vouchers, statements,
  IDs and payslips printed without them, and Home asked for them (docs/adr/0018).
- **The owner wants them built in, not typed:** they are the company's, the same on every computer and in every set of
  records, and they rarely change.

## Decision

- **Core holds the company (`COMPANY` in `packages/core/src/kernel/state.ts`):**
  - Name: ALPHA PREMIER GROUP OF COMPANIES OPC
  - Address: Suites 3104, Philippine Stock Exchange Centre, Tektite East Tower, Exchange Road, Ortigas Center, Pasig City 1605 (docs/adr/0038; it was Unit 3104C, Tektite East Tower Ortigas Center, Pasig, 1116 Metro Manila)
  - Contact line: 0915 888 9482 / 02 8650 2540 / www.alphapremiergroup.com
  - Short address (the sidebar): Tektite East Tower, Ortigas Center, Pasig
  - Phone: 02 8650 2540 · Billing email: billing@alphapremiergroup.com
- **`companyOf` always returns them,** over anything saved before; every document, the sidebar and every new record
  read them there.
- **Company Details keeps only what documents start from:** the voucher signatories, payment instructions, the
  closing note, terms, days to pay, the ID signatory and how long an ID is valid. Its Letterhead fields are gone, and
  so is Home's "Fill in Company Details" finding: the company is never missing.
- **Everything else in 0018 stands:** no records, signatories, bank accounts or document defaults are built in.

## Consequences

- **Good:** every document carries the company's name and address from the first day, on any computer, in any records.
- **Cost and limits:**
  - Changing the company's name, address or contacts is a code change and a release, not an edit in Company Details.
  - Company details saved before keep their old name and address in the records; Keystone no longer shows them.
