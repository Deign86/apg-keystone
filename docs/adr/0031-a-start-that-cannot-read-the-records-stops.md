# 0031. A start that cannot read the saved records stops and says why

Status: Accepted · Date: 2026-11-18 · Changes [0018](0018-the-records-are-the-only-source.md) and [0029](0029-keystone-installs-the-connected-apps.md)

## Context

- The desktop app read `state.json` through a helper that turned every failure into "no file". A file that was there
  and would not open (no permission, a failing disk, another program holding it) therefore opened Keystone with no
  records, and the first save replaced the file that could not be read. `Platform.loadState` already promised the
  opposite ("throws when it exists but cannot be read now"), and the cloud platform already kept that promise
  (docs/adr/0009, 0018).
- A saved state that was read but is not a Keystone state opened with no records and said nothing.
- When a connected app's installer could not be fetched (docs/adr/0029), the reason was dropped: offline and "the
  download did not match GitHub's digest" both read "its download page is open".
- The page gave a download 20 minutes and then said it had given up; the native download had no limit of its own and
  could still finish and open the installer afterwards. The page's 15 seconds and the native side's 20 for a question
  to GitHub were two numbers for one wait.
- The owner was away when this was decided and asked for the work to be finished; it is listed for him in
  `docs/untangle/decision-log.md` under "Calls made without the owner".

## Decision

- **No file and an unreadable file are different answers.** The native side has a `file_exists` command. No file:
  `loadState` answers null and Keystone starts with no records, as before. A file that is there and cannot be read, or
  a folder Keystone cannot look in: `loadState` throws a sentence, and the start stops on the "could not open" screen
  with it and a Try again button. Nothing is written.
- **A damaged saved state still opens with no records, and the rail says so** until the first change replaces it.
  The damaged file is not touched before that, as before.
- **A failed installer fetch says why**, in the sentence that says the download page is open instead. A computer or
  a release with no installer to fetch keeps the plain sentence.
- **A failed check for a connected app's update is written to the console**, not dropped. It still shows nothing on
  screen: an update is never a reason a shortcut fails.
- **The two deadlines are written once**, in `packages/core/src/kernel/deadlines.json` (core's `DEADLINES`): 15
  seconds to answer, 20 minutes to install. The page counts both; the native side reads the same file. Its question to
  GitHub now has 15 seconds, not 20, and its download stops 30 seconds before the page's 20 minutes are over and is
  not opened after that, so an installer never opens after Keystone has said it gave up.
- **The rail shows a failed save when it fails**, not at the next change.

## Consequences

- **Good:** a file that cannot be read is never replaced by an empty one; a person told "its download page is open"
  also learns the download was refused; one number per wait.
- **Cost and limits:**
  - A computer whose `state.json` cannot be read no longer opens Keystone at all until the file can be read, moved
    or removed by hand. That is the point, and it is a change from every earlier version.
  - `file_exists` is one more command the page and the native side must both name.
  - The page cannot cancel a native download; it relies on the native side giving up first. The 30 seconds cover the
    moment between the page starting its clock and the download starting.
  - A photo that cannot be read still shows as no photo.
