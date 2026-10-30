# Keystone architecture

Keystone is one Tauri 2 + React + TypeScript app for macOS and Windows. It uses the same stack as the attendance
tracker, so one set of tools covers both. It is built so that new screens and new connected systems can be added
without touching what already works.

```
packages/core     @keystone/core   every rule, as plain functions: numbering, VAT/EWT, amount in words,
                                   saving, the activity log, imports. No UI, no platform code. Tested.
packages/ui       @keystone/ui     the APG design system: Tailwind theme generated from shared/design/tokens.json,
                                   Orbitron + Poppins, and the controls (Base UI primitives underneath).
apps/keystone     the app
  src/modules/    one file per screen (a ModuleDef)
  src/connectors/ one folder per connected system (a ConnectorPlugin)
  src/platform/   the only code that knows whether it runs in the desktop app or a browser
  src/app/        the store, the registry, the connector runtime, the shell
  src-tauri/      the native side: files, OS keychain, finding and launching other apps
shared/           tokens, fonts, logo, sample data: the single source for the look and the seed
```

## How a change flows

A screen calls `run(rule)` with a function from `@keystone/core`, for example `saveVoucher`. The rule returns the new
state, the record it touched, and the sentence to show. It never mutates anything. If it refuses, it throws a
`KeystoneError` with the reason. The store saves the new state (as `state.json` in the app's data folder, about 250ms
later) and shows the sentence. A refusal is written next to the save button and shown as a toast. No rule lives in a
screen.

## Adding a screen (module)

1. Create `apps/keystone/src/modules/payroll.tsx` exporting a `ModuleDef`:

   ```ts
   export const payrollModule: ModuleDef = {
     id: 'payroll',                 // route (#payroll) and identity; lowercase, unique
     title: 'Payroll',
     section: 'People',             // the eyebrow over the title
     blurb: 'Cut-offs, payslips and the intern DTR.',
     order: 7,                      // position in the rail; ⌘/Ctrl+number follows it
     onHome: true,                  // a tile on Home
     stat: (state) => ['Next cut-off', 'Nov 15'],
     Screen: Payroll,
   };
   ```

2. Add it to `builtInModules` in `src/modules/index.ts`.

Each screen renders inside its own error boundary, so a bug in one shows an error on that screen only. Data a new module
keeps goes under `state.ext[<module id>]`. Older Keystones keep that key untouched.

## Adding a connected system (connector)

A connector is a plain object that implements `Connector` from `packages/core/src/connectors.ts`. Keystone works
out what a system can do from the fields it has:

| Field | Keystone uses it for |
|---|---|
| `settings` | The settings form under Connections, drawn automatically. A `secret` field goes to the OS keychain, never to a file. |
| `health(env)` (required) | The status capsule and the one-line status on its card. It is checked on open and every `refreshSeconds`. |
| `figures(env)` | Live figures on its Home card. |
| `people` | An "Import …" button that brings people (and photos) into the Directory. Existing people are matched by link or name and never duplicated. |
| `actions` | Buttons on its card, for example "Open live dashboard" or "Brand listing photos…". |

A connector reaches the outside world only through `env`:
- `env.http`: native HTTP with a cookie jar and any headers, no CORS.
- `env.system`: find, launch and hand files to installed apps; read files; list folders.
- `env.secret()`: values from the OS keychain.

That is what makes connectors testable and keeps them away from Tauri directly.

To add one: create `src/connectors/<id>/index.ts` exporting a `ConnectorPlugin`, then list it in
`src/connectors/index.ts`. A plugin may also bring its own screens (`modules`), the way the website connector brings
the Website inbox.

**What can't break:**
- Every call has a deadline and is caught (`Connections.safely`).
- A system that is offline, slow, missing or throwing shows that on its own card. Nothing else changes.
- A plugin with a bad or duplicate id is refused at start with its reason, listed under Connections. Everything
  else still loads.
- Tests in `apps/keystone/src/test/connectors.test.ts` cover a crashing connector, a hanging one and a broken registry.

## The three connectors today

| System | How Keystone reaches it | What it gives Keystone |
|---|---|---|
| Attendance tracker (`alpha-premier-attendance`) | Its read-only LAN viewer on port 4173 (`/api/health`, `/api/attendance/today`), with the optional `X-Viewer-Token`. Its `.apbackup` files (database and photos). | Who is in now, late arrivals (the app's own 08:01 rule) and time-outs. Opens the live dashboard. Imports employees and photos for the ID Maker. |
| Alpha Branding Studio (`Alpha_Branding`) | macOS: bundle id `com.alphapremier.brandingstudio`. Windows: the Uninstall registry key. GitHub releases. | Installed version and update check. Opens the studio. Hands it listing photos to brand (staged, ready for Apply Branding). |
| Website (`apg-website`) | The admin API as a normal admin account: session cookie, `Origin` header, Keystone's own user agent. | Hired applicants (with their 2x2 photos) as employees. Payments reported on the Pay page, matched to billing statements. Inquiries, which can become clients. |

None of the three needed a change to work. The one thing the attendance tracker cannot give over the network is its
employee list, because its LAN viewer deliberately never serves the roster. See `docs/ATTENDANCE-INTEGRATION.md`
for the option and its trade-off.

## Data

- `state.json` uses the web prototype's own `localStorage` schema. Fields added since are all optional, so a backup
  opens in any Keystone.
- Card photos sit in `photos/` beside it. Connection settings are in `connections.json`, and passwords are in the
  OS keychain.
- Locations:
  - macOS: `~/Library/Application Support/com.alphapremier.keystone/`
  - Windows: `%APPDATA%\com.alphapremier.keystone\`

## Checks

```bash
npm test            # core rules (incl. parity with the prototype) + connectors and modularity
npm run typecheck
npm run lint:taste  # Taste Skill app-screen lint
cargo test --manifest-path apps/keystone/src-tauri/Cargo.toml
```

CI (`.github/workflows/keystone.yml`) runs all of these, then builds the macOS `.dmg` and the Windows setup `.exe`.
