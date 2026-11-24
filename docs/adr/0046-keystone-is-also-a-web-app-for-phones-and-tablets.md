# 0046. Keystone is also a web app, installable on phones and tablets, served from Vercel

Status: Accepted · Date: 2026-11-24

## Context

- Keystone already built for the browser (`npm run build:web`): the platform layer has a browser `Platform` beside
  the Tauri one, and the cloud build keeps the records in Firebase (docs/adr/0009). It was used as a preview, on a
  computer, and was not hosted anywhere.
- APG staff want Keystone on their phones and tablets, with every screen and flow working as on the desktop. A phone
  layout already existed (under 768px the rail goes behind a Menu button), but nobody had worked it by a finger: forms
  cramped to a sliver at 320px, registers cut every value to a letter, the figure strip crushed seven figures into one
  row, tabs ran off the screen, the signature handle only showed on a hover, and most controls were 28 to 36px tall.
- Opening another APG app from Home threw "Open Keystone's desktop app" in the browser.

## Decision

- **The web build is a Progressive Web App** (`apps/keystone/src/platform/pwa.ts`):
  - A manifest, `public/manifest.webmanifest`, written by `npm run sync` from `shared/design/tokens.json` (APG's black
    as the theme and splash colour), with the icons at 192 and 512px, and maskable ones (`icon-maskable.png`, the mark
    inside Android's safe zone on the full-bleed black square, made by `scripts/brand/derive-icons.py` and
    `npm run icons`). `index.html` has the iPhone's own tags; the shell keeps clear of the notch and status bar
    (`env(safe-area-inset-*)`).
  - **A service worker** (`platform/service-worker.ts`, built by a plugin in `vite.config.ts` as `/sw.js` with the
    build's files written in) keeps the app shell, so Keystone opens fast and offline: it opens from the page and files
    its build kept, never a mix of two builds. It **never** keeps the records, Firebase's sign-in, or anything from
    another site, and leaves every request that is not a plain GET alone (`platform/sw-routes.ts`). Only a built web
    app registers it: never the desktop app or the dev server.
  - **A newer build is an update,** as the desktop app's are (`Platform.updater`): the worker fetches it and waits; the
    rail offers "Keystone <build> is ready", and installing lets the new worker take over and reloads. A page open on
    the old build keeps the files it loads until then. A build is named by its commit (Vercel's
    `VERCEL_GIT_COMMIT_SHA`).
  - **Installing** is a new optional `Platform.installer` (kit): the rail offers the browser's own dialog where it has
    one (Chrome, Edge), and on an iPhone or iPad says to use Share › Add to Home Screen. The desktop has none.
- **The web app is served from Vercel** (`vercel.json`): `npm run build:web` into `apps/keystone/dist`, every address
  opens `index.html`, the page and the worker are `no-cache`, the hashed files under `/assets/` are immutable for a year.
  The Firebase project and the channel come from Vercel's environment variables, as from the Actions variables for the
  desktop app. Setting it up needs the owner's accounts: `docs/WEB.md`.
- **A finger gets what a mouse gets** (`@keystone/ui`): `watchTouch` marks the page `data-touch` while its main
  pointer is coarse, and under that mark every control is at least 44 × 44px (WCAG 2.5.5), text fields use 16px text
  (below that iOS zooms in on a tap), and a box to tick takes a tap across 44px around it. The desktop with a mouse is
  unchanged. Narrow screens get layouts that fit, in the shared parts: a register keeps its columns whole and scrolls
  sideways in its own box, tabs scroll sideways, the figure strip wraps (one row from 1280px), the activity feed puts the
  time on its own line, a line of particulars puts its description on a row of its own, and Overview's waiting list puts
  the status under the record. A signature's resize handle always shows on a touch screen, and never in an exported PDF.
- **A connected desktop app opens its download page in the web app** (`openDesktopApp` in core), saying it runs on a
  computer, instead of refusing.
- **Tested on phones and tablets:** `e2e.mobile.config.ts` (`npm run test:e2e:mobile`, part of `npm run test:e2e`)
  runs `e2e/mobile/` as an iPhone (390 × 844) and an Android tablet (768 × 1024), the touch screen told to the page
  (`e2e/support/touch.ts`), and walks every screen and tab at 320, 360, 375, 390, 414, 768, 1024 and 1366px wide, upright
  and on its side: nothing scrolls sideways and every control takes a finger. The cloud suite signs in, resets a
  password and signs out on a 320px phone (`e2e/cloud/phone.e2e.ts`).

## Consequences

- The kit's `Platform` gains `installer`; `updater` now also comes from the web app. Parts see neither: the rail shows
  them. No part, saved state or Firestore rule changes.
- A touch tablet or a touchscreen laptop whose main pointer is coarse gets the larger controls too.
- The first open of a new build fetches about 3 MB once (its shell); after that it opens from the device.
- Every Vercel address that signs in must be an authorized domain of the Firebase project (docs/WEB.md). Preview
  deployments of pull requests are built as browser previews, without the Firebase project, so they never touch the
  records.
- Lighthouse on the built app: Best Practices 100, Accessibility 100; Chrome finds it installable. Its Performance
  score (78 on a throttled phone) is held back by the 1 MB first script; splitting it is left for later.
