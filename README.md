# Keystone

Alpha Premier Group's admin app. It covers Check Vouchers, Billing Statements, the ID Maker, a shared Directory and
an Activity Log, and it connects to the other APG systems:

- **The attendance tracker:** live attendance from the front-desk kiosk, plus its employees and photos.
- **Alpha Branding Studio:** hands it listing photos, checks its version.
- **The website:** new hires, payments reported online, inquiries.

It is one Tauri 2 + React + TypeScript codebase for macOS and Windows: the same stack as the attendance tracker.
It is **modular-first**: every screen and every connected system can be taken out without breaking the rest, and CI
proves it on every push. Agents and co-developers start with [`AGENTS.md`](AGENTS.md).

```
apps/keystone/   the app: screens (src/modules), connected systems (src/connectors), native side (src-tauri)
packages/core/   every rule, tested: numbering, VAT/EWT, amount in words, saving, imports
packages/ui/     the APG design system: Tailwind theme from shared/design/tokens.json, Base UI controls
shared/          tokens, fonts, logo, sample data
prototype/       the original single-page web prototype (2026-10-27), kept for reference
docs/            MODULARITY.md (the contracts), ARCHITECTURE.md (how it fits), DESIGN.md (the look),
                 ATTENDANCE-INTEGRATION.md (one open decision)
AGENTS.md        the rules for anyone changing Keystone (CLAUDE.md points here)
```

## Get the app

Every push builds installers on GitHub Actions: open the workflow **Keystone**, pick the latest run, and download
from **Artifacts**.

- **macOS** (`Keystone-macOS`): open the `.dmg` and drag Keystone to Applications. It is ad-hoc signed, so on first
  launch use right-click › Open, or *System Settings › Privacy & Security › Open Anyway*.
- **Windows** (`Keystone-Windows`): run the setup `.exe`. It installs for the current user. SmartScreen may ask once;
  choose *More info › Run anyway*.

## Develop

Needs Node 22 and Rust (stable). On Linux it also needs the WebKitGTK libraries listed in the workflow.

```bash
npm install
npm run desktop     # the desktop app, with hot reload
npm run dev         # the same UI in a browser at http://127.0.0.1:5174 (connectors that need the desktop say so)
npm run check       # everything CI checks: theme in sync, boundaries, typecheck, tests, Taste Skill lint
npm test            # core rules, connectors, and the removal test (each part taken out in turn)
npm run build       # installers for this OS into apps/keystone/src-tauri/target/release/bundle
```

Adding or removing a screen or a connected system is one folder plus one line; see `AGENTS.md` and the README in
`apps/keystone/src/modules/` or `apps/keystone/src/connectors/`.

## Setting up the connections

In Keystone, open **Connections** (⌘8 / Ctrl+8):

- **Attendance tracker:**
  - **Kiosk address:** enter the address the attendance app shows under Live attendance › Share on the LAN.
  - **Viewer token:** only needed if the kiosk asks for one.
  - **Employees and photos:** these come from the attendance app's backups. On the kiosk PC that needs nothing. On
    another PC, set **Backup folder** to where the backups are shared.
- **Alpha Branding Studio:** nothing to set; Keystone finds it if it's installed.
- **Website:** a website admin account (ideally a dedicated one for Keystone). The password is kept in the computer's
  keychain.

## Data

- Saved on each computer:
  - macOS: `~/Library/Application Support/com.alphapremier.keystone/`
  - Windows: `%APPDATA%\com.alphapremier.keystone\`
- **Connections › Data** has back up, restore and reset to the sample set. A backup is one JSON file in the
  prototype's own format.
- Sample records are made up; company details are APG's real ones.

## Agent skills

`.claude/skills` vendors [ui-skills](https://github.com/ibelick/ui-skills) and
[Taste Skill](https://github.com/Leonxlnx/taste-skill). `.mcp.json` connects the ui-skills registry MCP. Keystone's
screens are checked with both (see `docs/DESIGN.md`).
