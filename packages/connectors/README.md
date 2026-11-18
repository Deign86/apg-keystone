# Connectors

One package per connected system, each in `packages/connectors/<id>` and named `@keystone/connector-<id>`. The list
of installed connectors is `apps/keystone/src/connectors.ts`, the only place connectors are named together.

| Package | System (repo) | Its shortcut on Home | README |
|---|---|---|---|
| `attendance/` | RFID attendance tracker (`alpha-premier-attendance`) | Starts the app, or installs it. It updates itself. | [attendance/README.md](attendance/README.md) |
| `id-maker-app/` | Alpha Premier ID Maker (`apg-id-creator`) | Starts the app, or installs it, and offers its updates | [id-maker-app/README.md](id-maker-app/README.md) |
| `branding-studio/` | Alpha Branding Studio (`Alpha_Branding`) | Starts the studio, or installs it. It updates itself. | [branding-studio/README.md](branding-studio/README.md) |
| `website/` | alphapremiergroup.com (`apg-website`) | Opens the admin portal in the browser | [website/README.md](website/README.md) |

## Rules

- **A connector is a shortcut** (docs/adr/0007). It implements `Connector` from `@keystone/core`
  (`packages/core/src/kernel/connectors.ts`): `id`, `name`, `logo`, `open(env)`, and optionally `tag`. Home shows it as
  its logo with its name under it; clicking it calls `open`.
- **The logo is the app's own,** kept in the package as `src/logo.png` (about 288 px, transparent edges trimmed) and
  imported: `import logo from './logo.png'`.
- **Reach the outside world only through `env.system`:** find an installed app, start it, open a URL. Never import
  `@tauri-apps/*`. A desktop app opens with `openDesktopApp(env, app)` from core, where `app` is a `DesktopApp`: its
  name, how to find it, its repository, which release file is the installer on each computer, and whether it updates
  itself.
- **Installing and updating** (docs/adr/0029): not installed, `openDesktopApp` fetches the installer and opens it.
  An app with its own updater sets `updatesItself: true` and gets nothing more. One without sets it `false` and adds
  `update: (env) => desktopAppUpdate(env, app)`; "Update to …" then shows under its shortcut. Put the real file names
  of a release in the package's test.
- **Dependencies:** `@keystone/core` (for `Connector`). Never another connector or a module.
- **Don't guard against failure yourself:** throwing, hanging or being unavailable are all fine. The shortcut gives
  `open` 15 seconds, or 20 minutes once it calls `env.slow('Downloading …')`, and shows any error as a message. Return a sentence from `open` when it did something other than
  open the app (the download page, say).
- **Keep it to opening the app.** A change to the other system belongs in its own repo and is the owner's decision.
- **Test against a fake computer,** in the package's `test/`: which app it looks for, that it starts it, what happens
  when it is missing. Never start a real app from a test.
- **Removing a connector:** delete its line in `apps/keystone/src/connectors.ts`, its entry in
  `apps/keystone/package.json` and its `e2e/connectors/<id>.e2e.ts`. `apps/keystone/src/test/removal.test.tsx` covers
  every connector listed there.

## Template

The package layout, `package.json`, `tsconfig.json` and `vitest.config.ts` are as in `packages/modules/README.md`,
with the name `@keystone/connector-<id>` and the entry `src/index.ts`. Its end-to-end tests go in
`e2e/connectors/<id>.e2e.ts` at the repo root (`npm run check:e2e` fails without them).

```ts
// packages/connectors/payroll-sheet/src/index.ts
import type { Connector } from '@keystone/core';
import logo from './logo.png';

export const payrollSheetConnector: Connector = {
  id: 'payroll-sheet',
  name: 'Payroll Sheet',
  logo,
  open: ({ system }) => system.openUrl('https://docs.google.com/spreadsheets/d/…'),
};
```

Then import `payrollSheetConnector` in `apps/keystone/src/connectors.ts`, add `"@keystone/connector-payroll-sheet": "*"`
to `apps/keystone/package.json`, run `npm install`, and write the package's `README.md` and its tests with a fake
computer (see `packages/connectors/attendance/test/attendance.test.ts`).
