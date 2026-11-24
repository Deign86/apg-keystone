# 0047. Live updates that recover by themselves, and say what arrived

Status: Accepted · Date: 2026-11-25

## Context

- **A user report:** "I find myself having to restart the app to see whether a new voucher is there or not. It should
  inform the user in the UI, or do it in the background every so often."
- **Keystone already listened to the cloud** (since v0.31, `platform/firestore.ts › watch`): an `onSnapshot` on every
  collection the records are read from, merged into the store (`KeystoneStore.receive`), with the same
  `where('uid', '==', uid)` filter on `rf` and `mydrafts` that the reads have. In the Firebase emulators, a voucher one
  member saves does reach another member's open Keystone; that path works.
- **But nothing brought it back once it stopped, and nothing showed that it had.**
  - Firestore ends a listener for good on an error (a refusal such as `permission-denied`, or the client failing); the
    error callback only wrote a console warning. From then on that Keystone saw nobody's saves until it was reopened. The
    cloud suite now shows it: removing a member, even for a moment, refuses all their listeners at once.
  - The listeners were joined: nothing was handed over until every collection had answered once, so one collection
    refused before its first answer stopped every update, for every list.
  - There was no fallback: no read again when Keystone came back into focus or the network returned, and none on a timer.
  - A save that did arrive changed the screen silently. A new voucher lands at the foot of the register, or folded
    under its payee, so the person could not tell whether what they saw was current, and reopened Keystone to be sure.
- **A form keeps its own draft** (`useDraft`, docs/adr/0041), so others' saves never changed what someone was typing; but
  saving a record someone else changed meanwhile replaced their change without a word.

## Decision

- **Each collection is listened to on its own** (`firestore.ts › watch`), with the read's filter, and hands over only the
  collections that changed (`RemoteListener.change`); `cloud.ts` puts them over what it knew of the others. No collection
  waits for another.
- **A listener that stops is listened to again by itself:** after 5 s, then three times longer each time, up to 2
  minutes (`relistenAfter`), and at once when the person comes back (`RemoteWatch.retry`).
- **While any listener is stopped, the records are read again instead** (`cloud.ts`): at once, every `LIVE_REREAD_MS`
  (2 minutes, core), and when Keystone's window regains focus, its page shows again or the network comes back (`Wake`,
  at most every 15 s). While every listener runs, nothing is read again: Firestore's listeners already catch up after the
  network returns, and reading every record on each focus would cost a read of each one every time.
- **The platform says whether live updates run** (`Platform.watchState(onChange, onLive)`); the store keeps it as
  `live`, and the rail says so while they are paused (`LIVE_PAUSED`, core), its dot turning from green to gold.
- **What arrived is told, in core's words.** The Activity Log line of each change now names who saved it (`LogEntry.by`,
  optional, from `ctx.who` in `logged`). The store tells the lines another computer added (`newEntries`, `onArrival`);
  the shell shows each one as a quiet toast, "From Ana Cruz: 888-001 for MANILA WATER COMPANY saved and routed for
  approval (₱980.00).", or one sentence for more than three (`arrivalNotices`), and marks the screens they changed in the
  rail, by their `logTags`, until they are opened.
- **A form holding a saved record says when someone else changed it** (`FormCard holds`, `useChangedElsewhere`): what is
  typed stays, and the sentence (`changedElsewhere`, core) says that saving replaces their change and how to see theirs.
  Check Vouchers, Billing, Requests for Funds, Statements of Account and the ID Maker pass the record they hold.
- **Nothing that arrives is ever written back.** `receive` sets the state without a save; only a change made here and not
  saved yet is saved, measured from what arrived. A re-read that a save here overtook is not taken.

## Consequences

- Others' saves show within a second while the listeners run, and within 2 minutes (at once, on coming back to
  Keystone) while they do not; reopening Keystone is never needed to see them.
- `firestore.rules` are unchanged: the listeners ask for exactly what the reads ask for.
- Lines logged before this change, and on a computer with no sign-in, name nobody; their arrivals are told as from
  "another computer".
- The cloud suite opens a second browser beside the test's (`e2e/cloud/another-computer.ts`, Playwright itself, at the
  version `@e2e-dev/web` pins, now a dev dependency): two members, each seeing the other's voucher appear, a form told
  of a change under it, a computer catching up after the network returns, and one refused and listening again.
- Still open: a listener that hangs without an error (a network that buffers the stream) is not detected; the rail
  shows live updates as running. If that is seen, a re-read after the computer wakes from sleep is the next step.
