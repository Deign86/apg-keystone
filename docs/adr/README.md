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
| [0009](0009-keystone-records-in-firebase.md) | Keystone's records live in Firebase | Accepted |
| [0010](0010-bank-accounts.md) | Bank accounts are their own part, and statements pick one through a service | Accepted |
| [0011](0011-requests-for-funds.md) | Requests for funds, decided by the owner | Accepted |
| [0012](0012-signing-out-and-the-idle-timeout.md) | Signing out, and signing out when Keystone sits unused | Accepted |
| [0013](0013-the-owner-makes-accounts.md) | The owner makes accounts in Keystone | Accepted |

Template:

```markdown
# NNNN. Title
Status: Proposed · Date: YYYY-MM-DD
## Context
## Decision
## Consequences
```
