# Keystone

The all-in-one admin app for Alpha Premier Group: Check Vouchers, Billing Statements and the ID Maker built around one
shared Directory, with an Activity Log. It also opens the other APG apps (the attendance tracker and Alpha Branding
Studio).

Keystone runs as a native app: SwiftUI on the Mac first, then WinUI 3 on Windows. Both apps are built from the
same core rules, design tokens and sample data.

```
apple/        Mac app: KeystoneCore (rules, tested) + KeystoneApp (SwiftUI)
windows/      Windows app (WinUI 3) — generated theme and assets only, port not started
shared/       design tokens, fonts, logo, sample data — the single source for both apps
scripts/      sync-shared.mjs regenerates platform files from shared/
prototype/    the original single-page web prototype (2026-10-27), kept for reference
docs/         DESIGN.md (the look and where it comes from), PORTING.md (Swift → C# map)
```

## Run the Mac app

On macOS 14 or later with Xcode 15.3+:

```bash
cd apple
open Package.swift        # Xcode: pick the "Keystone" scheme, then Run
# or
swift run Keystone
```

To make a double-clickable `Keystone.app` and a zip: `./apple/build.sh`. Every push also builds one on GitHub
Actions (workflow **Mac app** → artifact **Keystone-macos**). It is ad-hoc signed, so the first launch needs a
right-click › Open.

Data is saved to `~/Library/Application Support/Keystone/state.json`, with card photos in `photos/` beside it.
**Activity Log › Reset sample data** starts over.

## Tests

```bash
cd apple && swift test
```

The core tests check amounts in words, tax totals, numbering and the ID verification pattern against values taken
from the web prototype's own code.

## Status

- Sample data only. Records are made up; company details are APG's real ones.
- New compared with the prototype: real PDF export, status changes from each register's `⋯` menu, ID photos kept on
  disk, a directory filter, and launching Alpha Branding Studio and the attendance dashboard.
- Not yet: user accounts, a shared office database, printing straight to the ID card printer.

## Agent skills

`.claude/skills` vendors [ui-skills](https://github.com/ibelick/ui-skills) and
[Taste Skill](https://github.com/Leonxlnx/taste-skill). `.mcp.json` connects the ui-skills registry MCP. See
`.claude/skills/SOURCES.md`.
