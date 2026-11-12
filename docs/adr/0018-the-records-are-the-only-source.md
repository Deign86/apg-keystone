# 0018. What was saved is the only source: no records, company details or accounts built in

Status: Accepted · Date: 2026-11-12 · Replaces moving a computer's records in (0009) and the reference bank account (0010)

## Context

- **Keystone shipped made-up records.** `shared/data/seed.json` was built into core: 11 directory records, vouchers,
  statements, IDs and log entries. A computer with nothing saved opened on them, as if they were APG's, and Data's
  "Reset to sample data" wrote them back over whatever was there, in the cloud too.
- **They could become the company's records.** Since 0009 the first owner to sign in moved that computer's records into
  the cloud. On a computer that had opened on the sample records and saved once (housekeeping saves on opening),
  those were the records moved in. The cloud is still empty (only `members`), and v0.14.0, the first release with a
  sign-in, would have done exactly that on the first PC to update. v0.14.0 was marked a pre-release so no copy updates
  to it.
- **Company details and defaults were in the code too:** the letterhead, "Prepared by: D. Lazaro", signatories, the
  payment instructions with the BPI account number, billing terms, days to pay, ID validity, and a fallback bank
  account shown until one was saved. Changing any of them meant a new release.
- The owner asked for the backend to be the only source of truth.

## Decision

- **Nothing is built in.** Core has no seed. `emptyState()` is what a new computer, a new browser and an empty cloud
  start from; a damaged file opens empty too, and is not overwritten until something changes.
- **The cloud is the only source of a signed-in build.** The cloud platform never reads, copies in or writes beside
  what the computer holds.
  - An empty cloud is started, empty, by the owner's first sign-in (`RemoteDocs.start`: the `keystone/apg` marker,
    `status: 'ready'`). Staff who sign in first are told the owner signs in first. firestore.rules let only an owner
    write the marker.
  - Records from a computer come in only on purpose: an owner restores a backup (Settings › Data).
- **Company details are records,** kept by the kernel like the directory: `state.company` (`CompanyDetails`: the
  letterhead and contacts, and what a new voucher, statement and ID start from), read everywhere with `companyOf`,
  which gives "" (or 0) for anything not filled in.
  - In the cloud they are one document, `keystone/apg/company/details`, that every member reads and only an owner
    writes (firestore.rules), since payment instructions say where clients pay.
  - A new module, **Company Details** (`company`, last under Settings), is the one place they change: owners edit,
    staff read. Until the name is saved, Home and Overview say "Fill in Company Details…".
  - Documents leave a field blank until it is filled in. With no days to pay, a new statement has no due date until
    typed, and saving one without it says so; with no years an ID is valid, likewise its end date.
  - A new voucher is prepared by whoever is signed in (their member name), falling back to the last voucher's
    preparer and then Company Details'.
- **No bank account is built in.** Bank Accounts lists what was saved, none at first; the bank-accounts service is
  `accounts(state)`. Bank Accounts and Company Details join `RELEASED` (0017), since vouchers print from them.
- **The rules' context is the clock and who is signed in.** `Ctx.seed` is gone; blood types are ID Maker's constant.
- **Data has no reset.** Back up and restore remain.
- **The sample records are the tests'.** `shared/data/sample.json` is a saved state (records, APG's company details,
  the BPI account under Bank Accounts), generated into `packages/core/sample/` and exported as
  `@keystone/core/sample` (`sampleState`, `sampleText`). `npm run check:boundaries` refuses that import outside a
  test. The end-to-end suites put it in each test's browser before Keystone loads (`e2e/support/sample-records.ts`),
  and `startEmpty` shows the empty start; the cloud suite writes it into the emulator as an owner had saved it
  (`recordsInCloud`).

## Consequences

- **Good:**
  - What anyone sees is what someone saved. A new install, a new PC and an empty cloud show no records, and no
    computer's leftovers, sample or not, can become APG's.
  - The letterhead, signatories, payment instructions and terms change without a release, and only an owner changes
    them.
- **Cost and limits:**
  - The owner's first sign-in shows an empty Keystone: Company Details and Bank Accounts come first, then the records.
    Records kept on a computer by an older build need a backup there and a restore here.
  - `firestore.rules` must be deployed for the owner-only marker and company details to hold (docs/FIREBASE.md › 5).
    Until then the old rules let any member write them.
  - A saved state from before keeps working: `company` is optional, and statements saved without notes take Company
    Details' payment instructions when opened again.
  - The main end-to-end suite still starts from the sample records, so it shows a filled-in Keystone, not the empty
    start a new install has; `startEmpty` and the cloud suite cover that.
