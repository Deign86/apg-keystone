# 0019. Screens coming soon show behind a notice

Status: Accepted · Date: 2026-11-12

## Context

- **A stable release hid what the screens not released yet look like** (docs/adr/0017). Each one said only "Coming
  soon", and Home kept only the released tiles. People opening a release saw Check Vouchers alone on Home and read it
  as the other features having been removed.
- **What those screens do for the open ones has to stay as it is:** the services they provide, their housekeeping,
  and where their records are kept, so a stable build never changes another build's records.

## Decision

- **A screen coming soon shows as it will look, faded, behind a notice.** The kit's `comingSoon` renders the module's
  own screen inside an `inert`, `aria-hidden` layer, dimmed and slightly blurred, under a card with its title and
  "Coming soon". Nothing on it can be clicked, typed into, reached by the keyboard or read aloud, so nothing it holds
  changes. A screen that fails behind the notice shows only the notice.
- **It keeps its tile on Home, marked "Coming soon",** with its live figure, and its place in the rail, marked "Soon"
  as before. The tile opens the screen behind its notice.
- **It keeps everything it contributes but its finding:** the figure, waiting items, "New …" action and log filter only
  show on screens that are themselves coming soon (Overview, Activity Log). The finding, the one sentence under Home,
  is left out, so it never points at a screen that does not open.
- **No screen coming soon writes anything when it opens.** None does today (they read the state and wait for a click);
  a module that starts writing on opening must not be shown behind the notice.

## Consequences

- **Good:** a release shows every feature and which ones are still coming. Releasing a screen is still one id in
  `RELEASED`. The records and services stay as docs/adr/0017 tested them (`apps/keystone/src/test/released.test.tsx`).
- **Cost and limits:**
  - A screen coming soon now renders its real content, so its figures (a tile's "Outstanding ₱…") show in a release.
  - A blur over a long screen costs some painting; the screens are short enough that it does not show.
