# 0012. Signing out, and signing out when Keystone sits unused

Status: Accepted · Date: 2026-11-11

## Context

- **Since 0009 a cloud build opens the records behind a sign-in**, and Firebase keeps that sign-in on the computer
  until someone signs out. The only way to sign out was "Sign in as someone else", shown when Keystone cannot open.
- **Keystone holds APG's payments, payroll and requests for funds.** An office PC left unlocked with Keystone open,
  or reopened by someone else the next day, opens all of it as the last person who signed in.
- **A desktop app is often left open for hours,** and the computer goes to sleep with it open. A timer does not run
  while a computer sleeps.

## Decision

- **A "Sign out" button in the rail**, under who is signed in, whenever the platform has a session (a cloud build). It
  writes the last save, ends the sign-in on this computer, and reopens Keystone on the sign-in screen.
- **Keystone signs out by itself after 15 minutes unused**: no key press, click, scroll or mouse movement.
  - A minute before, it asks "Still there?" with a countdown, "Stay signed in" and "Sign out now". While it asks, only
    a key press or a click keeps Keystone open, so a mouse nudged by accident does not.
  - It reads the clock every second instead of counting time, so a computer that slept past the 15 minutes signs out
    as it wakes.
- **Opening Keystone after it sat unused for 15 minutes asks for the account again.** Each use is noted on the
  computer (`keystone-last-used` in web storage, at most every 30 seconds); a start that finds the last use 15 minutes
  ago or more signs out before reading the records. A computer with no note yet (the first start of this version)
  stays signed in.
- **The kit knows the session only through `Platform.session`** (`AppSession`: `idleMs`, `used`, `signOut`), as it
  knows updates through `Platform.updater`. The rule (15 minutes, the note on the computer) lives in the composition
  root, `apps/keystone/src/platform/session.ts`; the rail button and the timer live in `packages/kit/src/Session.tsx`.
  `@keystone/ui` gains `AlertSheet`, an alert dialog its owner opens and closes.
- **Builds without a sign-in are unchanged.** Records kept on the computer have no session, so no button and no timer.

## Consequences

- **Good:**
  - A PC left alone stops showing APG's records after 15 minutes, and a restart the next day asks who is there.
  - Switching accounts no longer needs Keystone to fail first.
- **Cost and limits:**
  - Reading a long document without touching anything for 15 minutes signs out; the warning gives a minute to stay.
  - A change waiting its 250 ms is written before signing out. A form half filled in and not saved is lost, as when
    Keystone is closed.
  - The 15 minutes is the same for everyone. Making it a setting, or longer for the owner, is a later decision.
  - The note on the computer can be cleared or edited by someone at the computer; the sign-in itself still needs the
    password, and Firestore still checks every read and write against `firestore.rules`.
