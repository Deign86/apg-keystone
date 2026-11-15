# Overview

## Owns
The CEO summary: what waits for approval, what is owed, what is due.

## Contributes
Its Home tile's figure, `stat`: Waiting on you, the number of items its own card lists, counted from the installed
modules Home hands it (docs/adr/0021). It collects every module's `figure` (the one marked `lead` is drawn larger),
`waiting` items (opened with their module's `openWaiting`), `finding`, and `create` buttons.

## Needs
Nothing. The "View all" link appears only if `activity` is installed.

## Removing it
Nothing else changes.
