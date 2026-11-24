# Architecture Decision Records

One short file per significant decision, in Michael Nygard's format: **Title, Status, Context, Decision,
Consequences**.

- **Status** is Proposed, Accepted, Deprecated, or Superseded by NNNN.
- **Never delete a record.** When a decision changes, write a new record and mark the old one Superseded.
- **Write one when a change** touches the kernel, adds or removes a part, changes the saved state's format, or
  changes how Keystone talks to another system.

| # | Decision | Status |
|---|---|---|
| [0001](0001-one-codebase-tauri-react-typescript.md) | One codebase: Tauri 2 + React + TypeScript | Accepted |
| [0002](0002-modular-first-kernel-and-parts.md) | Modular-first: a fixed kernel and removable parts | Accepted |
| [0003](0003-keep-the-prototype-state-schema.md) | Keep the prototype's saved-state schema | Accepted |
| [0004](0004-integrate-through-what-systems-expose.md) | Integrate other APG systems only through what they already expose | Superseded by 0007 |
| [0005](0005-one-package-per-module-and-connector.md) | One package per module and connector, and named services between them | Accepted |
| [0006](0006-keystone-updates-itself.md) | Keystone updates itself from its signed GitHub releases | Accepted |
| [0007](0007-connected-systems-are-shortcuts.md) | Connected systems are shortcuts to their apps | Accepted |
| [0008](0008-employee-timekeeping-and-payroll.md) | Employee timekeeping and payroll live in Keystone | Accepted |
| [0009](0009-keystone-records-in-firebase.md) | Keystone's records live in Firebase | Accepted; moving records in superseded by 0018 |
| [0010](0010-bank-accounts.md) | Bank accounts are their own part, and statements pick one through a service | Accepted; the reference account superseded by 0018 |
| [0011](0011-requests-for-funds.md) | Requests for funds, decided by the owner | Accepted |
| [0012](0012-signing-out-and-the-idle-timeout.md) | Signing out, and signing out when Keystone sits unused | Accepted |
| [0013](0013-a-save-the-cloud-never-confirmed.md) | A save the cloud never confirmed is written on the next start | Accepted |
| [0014](0014-the-owner-makes-accounts.md) | The owner makes accounts in Keystone | Accepted |
| [0015](0015-the-owner-removes-staff-accounts.md) | The owner removes staff accounts in Keystone | Accepted |
| [0016](0016-changing-and-resetting-a-password.md) | Changing your password, and resetting a forgotten one | Accepted |
| [0017](0017-releases-sign-in-and-screens-coming-soon.md) | Releases always sign in, and screens not released yet say "Coming soon" | Accepted; what a screen coming soon shows superseded by 0019 |
| [0018](0018-the-records-are-the-only-source.md) | What was saved is the only source: no records, company details or accounts built in | Accepted; the company's own details superseded by 0023 |
| [0019](0019-coming-soon-screens-show-behind-a-notice.md) | Screens coming soon show behind a notice | Accepted |
| [0020](0020-changing-your-own-name.md) | Changing your own name, on Profile | Accepted |
| [0021](0021-a-home-figure-can-count-the-others-contributions.md) | A Home figure can count what the other modules contribute | Accepted |
| [0021](0021-expenses-and-fund-transfer-requests.md) | A request lists its expenses, and an approved transfer makes a fund transfer request | Accepted |
| [0022](0022-the-ceo-approves-their-own-vouchers.md) | The owner is the CEO, and the CEO's own vouchers need no approval | Accepted |
| [0023](0023-the-company-itself-is-built-in.md) | The company itself is built in | Accepted |
| [0024](0024-a-voucher-payee-is-typed.md) | A voucher's payee is typed | Accepted |
| [0025](0025-the-id-register-is-kept-in-keystones-project.md) | The register of issued employee IDs is kept in Keystone's Firebase project | Accepted |
| [0026](0026-a-kiosk-reads-the-id-register-as-a-device.md) | A kiosk reads the ID register as a device, not a member | Accepted |
| [0027](0027-the-attendance-kiosk-keeps-a-copy-of-its-records-here.md) | The attendance kiosk keeps a copy of its records here | Accepted, changed by 0028 |
| [0028](0028-the-attendance-records-live-here.md) | The attendance records live here; the kiosk keeps a working copy | Accepted |
| [0029](0029-keystone-installs-the-connected-apps.md) | Keystone installs the connected apps, and updates the one that cannot update itself | Accepted, changed by 0031 and 0035 |
| [0030](0030-the-ceo-names-attendance-admins.md) | The CEO names who opens the attendance tracker's admin screens | Accepted |
| [0031](0031-a-start-that-cannot-read-the-records-stops.md) | A start that cannot read the saved records stops and says why | Accepted |
| [0032](0032-a-module-owns-its-id-statuses-and-references.md) | A module owns its id, its statuses and what it refers to | Accepted |
| [0033](0033-accounts-are-a-service-the-platform-provides.md) | Accounts are a service the platform provides, and a connector says what the CEO may give a member | Accepted |
| [0034](0034-a-sheets-layout-is-defined-once.md) | A sheet's layout is defined once, and a paper composes its own letterhead | Accepted |
| [0035](0035-home-shows-every-connected-apps-update.md) | Home shows every connected app's newer version | Accepted |
| [0036](0036-a-billing-statement-follows-the-company-form.md) | A billing statement follows the company's form, its client is typed, and it withholds 2% or 5% | Accepted |
| [0037](0037-signatories-are-picked-payees-fold-and-any-record-can-go.md) | Signatories are picked from a list, the voucher register folds by payee, and a record in use can be removed | Accepted, the list changed 2026-11-24 |
| [0038](0038-one-letterhead-dated-invoice-numbers-penalty-and-signatures.md) | One letterhead on every paper, dated invoice numbers, a penalty line, and signatures that print themselves | Accepted |
| [0039](0039-lines-on-a-paper-are-banded.md) | The lines on a paper are banded, white and gold | Accepted |
| [0040](0040-statements-of-account-for-leases.md) | Statements of account for leases are a module of their own, upright on one A4 page | Accepted |
| [0041](0041-forms-save-drafts-kept-with-the-records.md) | Forms save drafts, kept with the records; a request's drafts are kept to their author | Accepted |

Template:

```markdown
# NNNN. Title
Status: Proposed · Date: YYYY-MM-DD
## Context
## Decision
## Consequences
```
