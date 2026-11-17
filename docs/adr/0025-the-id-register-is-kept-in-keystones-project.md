# 0025. The register of issued employee IDs is kept in Keystone's Firebase project

Status: Accepted · Date: 2026-11-17

## Context

- **The Alpha Premier ID Maker** (Deign86/apg-id-creator, a native Windows program) issues employee ID cards. Every
  number it issues goes in a shared register, so two HR computers never give the same number twice.
- **That register was a Google Sheet behind an Apps Script web app** open to anyone who held its address. The address
  worked as a password, was in that repository's git history, and had to be handed to the release build as a secret.
- **Keystone already has what a safer register needs:** a Firebase project, accounts the CEO makes and removes
  (docs/adr/0014, 0015), and rules that open nothing to a sign-in that is not a member (docs/adr/0009).
- **The plan is for the ID Maker, the attendance tracker and Keystone to become one system.** A register in a project
  of its own would have to be moved here later, accounts and all.

## Decision

- **The register is a list in this project:** `keystone/apg/idreg/{number}`, one document per employee number
  (`APG-2026-124`), named by the number. It holds what the Sheet held: the number, the name and job title as printed,
  when it was issued and whether it was a replacement, plus who issued it (`by`, `byEmail`). No photograph. Since
  the ID Maker's v2.0.4 it also holds `kind`, `intern` or `employee`: the attendance tracker keeps interns only and is
  to take new ones from here.
- **The ID Maker writes it, not Keystone.** It signs in over Firebase Auth's REST API with a Keystone account, and reads
  and creates documents over Firestore's REST API. Keystone's own ID Maker screen (`packages/modules/id-maker`, list
  `ids`) is unchanged and still unreleased.
- **firestore.rules make an issued ID permanent.** A member reads the register and creates a document, named by its own
  number and signed as themselves. There is no update and no delete for anyone, the CEO included: creating a number
  that already has a document is refused, so the first card stands and two computers cannot both succeed.
- **A replacement card is the one exception, and is recorded as one:** a new document under the card it replaces
  (`idreg/{number}/replacements/{issue time}`), which stays as it was.
- **Any member may issue.** There is one kind of issuer; a member the CEO removes stops being one.

## Consequences

- **Good:** no address that works as a password; who issued each card is on the card's record; nothing to move when
  the systems are merged; the rules are tested with the rest (`e2e/cloud/id-register.e2e.ts`).
- **Cost and limits:**
  - `firestore.rules` now serves a second program. A change to `member()` or to the `idreg` block must be checked
    against the ID Maker (its `register/README.md` describes what it sends).
  - Every Keystone member can read the names in the register, not only HR.
  - A wrong entry cannot be corrected from an app. It is corrected in the Firebase console, by the project's owner.
  - Keystone's own ID Maker screen numbers cards from its own list (`ids`). Before that screen is released it must
    take its numbers from `idreg`, or the two could give the same number.
