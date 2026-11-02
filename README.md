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
apps/keystone/        the app: lists the installed modules and connectors, the platform, the native side (src-tauri)
packages/modules/     one package per screen, with its rules and tests: vouchers, billing, id-maker, directory, …
packages/connectors/  one package per connected system, with its client and tests: attendance, branding-studio, website
packages/kit/         the app runtime: registries, services, store, connector runtime, shell, shared components
packages/core/        the shared kernel: money, dates, the saved state, the directory, contracts
packages/ui/          the APG design system: Tailwind theme from shared/design/tokens.json, Base UI controls
shared/          tokens, fonts, logo, sample data
prototype/       the original single-page web prototype (2026-10-27), kept for reference
docs/            MODULARITY.md (the contracts), ARCHITECTURE.md (how it fits), DESIGN.md (the look),
                 ATTENDANCE-INTEGRATION.md (one open decision),
                 references/on-modular-architectures.md (our modularity reference and principles),
                 adr/ (architecture decision records)
AGENTS.md        the rules for anyone changing Keystone (CLAUDE.md points here)
```

## Get the app

Download the installers from the repository's **Releases** page:

- **macOS** (`Keystone_<version>_universal.dmg`, Apple silicon and Intel, macOS 11 or later): open the `.dmg` and drag
  Keystone to Applications. It is ad-hoc signed, not notarized, so the first time you open it macOS refuses: choose
  *Done*, then *System Settings › Privacy & Security › Open Anyway*. If macOS says the app "is damaged", run
  `xattr -dr com.apple.quarantine /Applications/Keystone.app` in Terminal and open it again.
- **Windows** (`Keystone_<version>_x64-setup.exe`): run it. It installs for the current user. SmartScreen may ask
  once; choose *More info › Run anyway*.

Every push also builds both installers: open the workflow **Keystone**, pick a run, and download them from
**Artifacts** (kept 90 days).

**Making a release.** Any one of these:

- **Actions › Keystone › Run workflow** on `main`, with the version (`0.2.0`) in *Version to release*.
- **Releases › Draft a new release** with a new `v…` tag on `main`.
- Tag a commit on `main` and push the tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The workflow runs every check, builds the macOS `.dmg` and the Windows setup `.exe` with that version (it overrides
`tauri.conf.json`), and attaches both to the release, with install notes.

## Develop

Needs Node 22 and Rust (stable). On Linux it also needs the WebKitGTK libraries listed in the workflow.

```bash
npm install
npm run desktop     # the desktop app, with hot reload
npm run dev         # the same UI in a browser at http://127.0.0.1:5174 (connectors that need the desktop say so)
npm run check       # everything CI checks: theme in sync, boundaries, skills, Oxlint, typecheck, tests, Taste Skill lint
npm test            # every package's tests, plus the removal, contract and service regression suites
npm run test:e2e    # every screen in Chromium against the dev server (e2e; starts `npm run dev` itself)
npm run build       # installers for this OS into apps/keystone/src-tauri/target/release/bundle
```

Every screen and every connected system is its own package (`packages/modules/<id>`, `packages/connectors/<id>`).
Adding or removing one is one package plus one line in `apps/keystone/src/modules.ts` or `src/connectors.ts`; see
`AGENTS.md` and the README in `packages/modules/` or `packages/connectors/`.

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

The skills live in the repo, so every clone has them. `.claude/skills` vendors
[ui-skills](https://github.com/ibelick/ui-skills). `.agents/skills` holds the rest, each linked from `.claude/skills`
(where Claude Code looks). `npm run check:skills` fails if a link is missing or broken.

| Skill | What it is wired to |
|---|---|
| Taste Skill (`design-taste-frontend`) | `npm run lint:taste` in CI, and the screenshot inspector in `docs/DESIGN.md` |
| ui-skills (`baseline-ui`, `fixing-*`, `improve-ui`, …) | The design checks in `docs/DESIGN.md`; the ui-skills registry MCP in `.mcp.json` |
| anti-slop (`install-anti-slop`) | Oxlint with its rules: `.oxlintrc.json`, the plugin in `tools/oxlint/anti-slop`, `npm run lint` in CI |
| e2e | `e2e.config.ts`, tests in `e2e/`, `npm run test:e2e` in CI, and its MCP server in `.mcp.json` |
| unlazy | Works as is. Its optional Claude Code Stop hook is per machine: `node .agents/skills/unlazy/scripts/install-hooks.mjs` |
| ponytail (and `-review`, `-audit`, `-debt`, `-gain`, `-help`), grilling, grill-me | Instructions only; nothing to set up. `grill-me` starts only when you type `/grill-me` |

On Windows, Git checks the links out as plain files unless symlinks are on. Turn on Developer Mode, then clone with
`git clone -c core.symlinks=true …`, or in an existing clone run `git config core.symlinks true` and
`git checkout -- .claude/skills`.
