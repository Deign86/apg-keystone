# 0013. A save the cloud never confirmed is written on the next start

Status: Accepted · Date: 2026-11-11

## Context

- **The store writes a change 250 ms after it is made**, and hiding or leaving the page (a reload, closing the window)
  writes it at once, so a save made just before is not lost. In a build that keeps its records on the computer that
  holds: the browser's web storage is written before the page goes.
- **In a cloud build (0009) it did not hold.** The save is handed to Firestore (`writeBatch(...).commit()`), which
  queues it and writes it to its own copy on the computer and to the cloud a moment later. A page that reloads or
  closes in that moment takes the write with it. The copy on the computer had the change (in the browser, where it is
  written at once), but the next start reads the cloud, and the cloud wins. A bank account added just before a
  reload, and the Activity Log entry for it, were gone.
- **Writing at once, with no 250 ms wait, would only narrow that moment.** Firestore still writes asynchronously, so a
  reload straight after a change could still lose it, and the wait lives in the store, which knows nothing of the
  cloud.
- **The local copy alone cannot be written back on the next start.** It is the whole state as this computer last saw
  it, so it also holds records another computer has changed since, and writing it would put old records over newer
  ones. On the desktop it is also written asynchronously, so it may not have the last change either.

## Decision

- **Each save is noted on the computer before it is handed to the cloud**, and the cloud's answer clears the note
  (`apps/keystone/src/platform/pending.ts`, used by `platform/cloud.ts`). The note is in web storage
  (`keystone-pending-saves:<uid>`), which is written at once, even as the page goes. For each document the save
  touched, it keeps the document as saved and a fingerprint of what the cloud held before this computer changed it.
- **On the next start, what is still noted goes back on top of what the cloud holds, and is written**, one document at
  a time:
  - The cloud still holds the version this computer changed: the saved document goes back, and is written.
  - The cloud already has the saved document (it got there, but the page closed before the cloud said so): nothing
    to write.
  - Anything else means another computer changed that record since: the cloud's record stands, and this computer's
    change to it is dropped. The rest of the same save is still written.
- **A later save waiting when an earlier one is confirmed builds on the earlier one**, since Firestore applies one
  computer's writes in order. **A save the cloud refused is not noted any more**: the next save writes it again, as it
  always has, and the next start does not.
- **The note is per member.** A save waits for the member who made it, and is written as them when they next open
  Keystone on that computer; another member signing in there neither sees nor writes it.
- **The 250 ms wait and the store are unchanged.** Firebase stays in `platform/firestore.ts`; the note and its rules
  are the cloud platform's.

## Consequences

- **Good:**
  - A change made just before a reload or closing the window reaches the cloud, as `main.tsx` promises, at the latest
    when Keystone next opens on that computer. `e2e/cloud/records.e2e.ts` reloads straight after adding a bank account
    and finds it, and its Activity Log entry, on screen and in Firestore.
  - A change is never written over a record another computer changed after it, so the note cannot put old records
    over newer ones.
- **Cost and limits:**
  - Until Keystone opens again on that computer (as the same member), the change is only on that computer. Another
    computer does not see it until then.
  - A change dropped because another computer changed the same record since is dropped without a word on screen.
    Each module's data under `ext` is one document, so two computers changing the same module (two bank accounts, say)
    is such a clash; the Activity Log entry for the dropped change is still written, as with two saves at the same
    moment (0009).
  - A change still waiting its 250 ms when Keystone is killed, rather than closed, or when the computer loses power,
    is lost, as in a build without the cloud.
  - Clearing the browser's or the webview's site data on that computer clears the note too.
