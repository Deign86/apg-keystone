# 0026. A kiosk reads the ID register as a device, not a member

Status: Accepted · Date: 2026-11-17

## Context

- **The attendance tracker** (Deign86/alpha-premier-attendance, a kiosk PC by the door) keeps interns only. A new
  intern used to be typed into it by hand after HR made their ID card.
- **The ID register already says who is new** (docs/adr/0025): each issued ID has `kind`, `intern` or `employee`. The
  kiosk can take new interns from it, so they are added once, by making the card.
- **The kiosk runs unattended** and keeps a sign-in. Signed in as a Keystone member it could read every record a
  member can: clients, vouchers, billing, the directory. A kiosk needs none of that.
- The apps stay separate programs. They share this project, and Keystone is to become the place they are opened from.

## Decision

- **A kiosk has its own account, listed as a device:** `keystone/apg/devices/{uid}`, `{ name }`. Only an owner lists,
  renames or removes one. For now that is done in the Firebase console (docs/FIREBASE.md); Keystone has no screen for
  it yet.
- **A device is not a member.** `firestore.rules` let it read issued IDs (`idreg/{no}`: one, the list, a count) and its
  own device document. It writes nothing and reads nothing else, replacements included.
- **The kiosk asks two things:** how many interns the register holds, and, when that number has changed, which. The
  register only grows, so an unchanged count means nothing new.

## Consequences

- **Good:** a kiosk's stored sign-in opens only names and job titles already printed on cards; removing its device
  document, or disabling the account, stops it at once; the rules are tested with the rest
  (`e2e/cloud/id-register.e2e.ts`).
- **Cost and limits:**
  - `firestore.rules` now serves a third program. A change to `device()` or to the `idreg` block must be checked
    against the kiosk (its `docs/id-register.md` describes what it asks).
  - Each read of an issued ID by a device costs one more document read, for the `devices` lookup.
  - Listing a device is by hand in the console until Keystone has a screen for it.
