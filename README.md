# Keystone

Alpha Premier Group's admin app. It covers Check Vouchers, Billing Statements, the ID Maker, a shared Directory, an
Activity Log, and employee Timekeeping and Payroll (each employee's own pay setup, the cut-off and payslips). Home also has a shortcut to each of the other APG apps, its logo, which opens it:

- **The attendance tracker:** starts the app, or opens its download page when it is not installed.
- **Alpha Branding Studio:** the same.
- **The website:** opens its admin portal in the browser.

It is one Tauri 2 + React + TypeScript codebase for macOS and Windows: the same stack as the attendance tracker.
It is **modular-first**: every screen and every connected system can be taken out without breaking the rest, and CI
proves it on every push. Agents and co-developers start with [`AGENTS.md`](AGENTS.md).

```
apps/keystone/        the app: lists the installed modules and connectors, the platform, the native side (src-tauri)
packages/modules/     one package per screen, with its rules and tests: vouchers, billing, id-maker, directory, timekeeping, payroll, …
packages/connectors/  one package per connected system, its logo and how to open it: attendance, branding-studio, website
packages/kit/         the app runtime: registries, services, store, connector shortcuts, shell, shared components
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

**Updates.** Keystone updates itself, the way the attendance app does.
- **When it checks:** a few seconds after it starts, and every 8 hours.
- **When a new version is out:** the foot of the sidebar shows "Keystone 0.x is ready" with **Update and restart**.
  That saves your work, installs the update and opens Keystone again. On a Mac there is no Open Anyway step for an
  update.
- **Your version:** the version you are running is shown there too.
- **First install:** a copy older than the first version with updates needs one manual install.

Every push also builds both installers: open the workflow **Keystone**, pick a run, and download them from
**Artifacts** (kept 90 days).

**Making a release.** Releases are automatic. When a merge into `main` brings a feature or a fix, the workflow
publishes the next version once every check and both installer builds pass. The commit subjects since the last
release decide it:

| Commit subject starts with | Release |
|---|---|
| `feat` | The next minor version: 0.1.2 → 0.2.0 |
| `fix` or `perf` | The next patch version: 0.1.2 → 0.1.3 |
| `docs`, `test`, `ci`, `chore`, `refactor`, `style`, `build` | None |

Merges that land together go out as one release. To release a version you choose instead, use any one of these:

- **Actions › Keystone › Run workflow** on `main`, with the version (`0.2.0`) in *Version to release*.
- **Releases › Draft a new release** with a new `v…` tag on `main`.
- Tag a commit on `main` and push the tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

Either way the workflow runs every check, builds the macOS `.dmg` and the Windows setup `.exe` with that version (it
overrides `tauri.conf.json`), and publishes the release with both attached and install notes. A release stays a draft
until both installers are on it.

**Signing updates.** Installed copies only accept updates signed with Keystone's updater key.
- **Public half:** in `apps/keystone/src-tauri/tauri.conf.json` (`plugins.updater`).
- **Private half:** goes in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, under Settings › Secrets and variables
  › Actions. With it set, a release also publishes the signed update files and `latest.json`, after checking every
  signature (`scripts/updater-manifest.mjs`).
- **Without it:** the release still has its installers, but installed copies cannot update to it, and the run says
  so.
- **Keep a copy of the private key somewhere safe.** Copies that trust this key cannot update from releases signed
  with another one.


## Develop

Needs Node 22 and Rust (stable). On Linux it also needs the WebKitGTK libraries listed in the workflow.

```bash
npm install
npm run desktop     # the desktop app, with hot reload
npm run dev         # the same UI in a browser at http://127.0.0.1:5174 (shortcuts to desktop apps say they need it)
npm run check       # everything CI checks: theme in sync, boundaries, skills, Oxlint, typecheck, tests, Taste Skill lint
npm test            # every package's tests, plus the removal, contract and service regression suites
npm run test:e2e    # every screen and its flows in Chromium against a dev server it starts, then the cloud build against the Firebase emulators (needs Java 21)
npm run build       # installers for this OS into apps/keystone/src-tauri/target/release/bundle
npm run icons       # every platform's icons from shared/brand (after the logo changes; see shared/brand/README.md)
```

Every screen and every connected system is its own package (`packages/modules/<id>`, `packages/connectors/<id>`).
Adding or removing one is one package plus one line in `apps/keystone/src/modules.ts` or `src/connectors.ts`; see
`AGENTS.md` and the README in `packages/modules/` or `packages/connectors/`.

## Data

- Saved on each computer:
  - macOS: `~/Library/Application Support/com.alphapremier.keystone/`
  - Windows: `%APPDATA%\com.alphapremier.keystone\`
- **Data** (⌘7 / Ctrl+7) has back up, restore and reset to the sample set. A backup is one JSON file in the
  prototype's own format.
- **Bank Accounts**, under Settings after Data, keeps the company's bank accounts. A billing statement's **Pay into**
  picks the one its client pays into.
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
| e2e | `e2e.config.ts`; tests in `e2e/`, one file per module and connector (`npm run check:e2e` fails without it); `e2e.cloud.config.ts` and `e2e/cloud/` for the cloud build against the Firebase emulators (`e2e.firebase.json`); `npm run test:e2e` in CI; its MCP server in `.mcp.json` |
| unlazy | Its Claude Code Stop hook is on for everyone in `.claude/settings.json`: while an unlazy task has unmet gates, Claude can't end its turn. With no task open it does nothing. `npm run check:skills` fails if the hook's script goes missing |
| ponytail (and `-review`, `-audit`, `-debt`, `-gain`, `-help`), grilling, grill-me | Instructions only; nothing to set up. `grill-me` starts only when you type `/grill-me` |

On Windows, Git checks the links out as plain files unless symlinks are on. Turn on Developer Mode, then clone with
`git clone -c core.symlinks=true …`, or in an existing clone run `git config core.symlinks true` and
`git checkout -- .claude/skills`.
