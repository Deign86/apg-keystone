# Connectors

One package per connected system, each in `packages/connectors/<id>` and named `@keystone/connector-<id>`. The list
of installed connectors is `apps/keystone/src/connectors.ts`, the only place connectors are named together.

| Package | System (repo) | How Keystone reaches it | README |
|---|---|---|---|
| `attendance/` | RFID attendance tracker (`alpha-premier-attendance`) | Its LAN viewer on port 4173, and its `.apbackup` files | [attendance/README.md](attendance/README.md) |
| `branding-studio/` | Alpha Branding Studio (`Alpha_Branding`) | Finds the installed app, launches it with files, checks GitHub releases | [branding-studio/README.md](branding-studio/README.md) |
| `website/` | alphapremiergroup.com admin (`apg-website`) | The admin API as an admin account (session cookie) | [website/README.md](website/README.md) |

## Rules

- **Implement the contract:** implement `Connector` from `@keystone/core` (`packages/core/src/kernel/connectors.ts`). Only
  `health` is required; Keystone finds out what else a connector can do from the fields it has.
- **Reach the outside world only through `env`:**
  - `env.http`: native HTTP with a cookie jar and any headers.
  - `env.system`: find and launch apps, read files, list folders, open URLs.
  - `env.secret`: the OS keychain.
  - `env.settings`.
  - Never import `@tauri-apps/*`.
- **Dependencies:** `@keystone/core`, `@keystone/ui` and `@keystone/kit` only, plus third-party libraries it declares
  (the attendance connector declares `fflate` and `sql.js`). Never another connector or a module. A connector may
  ship its own screens through `ConnectorPlugin.modules`; to use a module's behaviour, those screens ask for its
  service (`useModuleApp().service`) and work without it.
- **Don't guard against failure yourself:** throwing, hanging or being unavailable are all fine. The runtime turns them
  into a status on this connector's card only. Return honest health:
  - `setup`: needs settings.
  - `offline`: no answer.
  - `error`: answered, but refused.
  - `unsupported`: this platform can't use it.
- **Keep it to what the system already exposes.** A change to the other system belongs in its own repo and is the
  owner's decision.
- **Test against a fake of the system,** in the package's `test/`. Never call a real system from a test.
- **Removing a connector:** delete its line in `apps/keystone/src/connectors.ts` and its entry in
  `apps/keystone/package.json`. `apps/keystone/src/test/removal.test.tsx` covers every connector listed there.

## Template

The package layout, `package.json`, `tsconfig.json` and `vitest.config.ts` are as in `packages/modules/README.md`,
with the name `@keystone/connector-<id>` and the entry `src/index.ts`. Its end-to-end tests go in
`e2e/connectors/<id>.e2e.ts` at the repo root (`npm run check:e2e` fails without them).

```ts
// packages/connectors/payroll-sheet/src/index.ts
import type { Connector } from '@keystone/core';
import type { ConnectorPlugin } from '@keystone/kit';

export const payrollSheetConnector: Connector = {
  id: 'payroll-sheet',
  name: 'Payroll Sheet',
  about: 'The Google Sheet payroll is approved in.',
  platforms: ['macos', 'windows'],
  settings: [{ key: 'url', label: 'Sheet address', kind: 'url' }],
  async health(env) {
    if (!env.settings.url) return { state: 'setup', detail: 'Enter the sheet’s address.' };
    const r = await env.http.request(env.settings.url, { timeoutMs: 5000 });
    return r.ok ? { state: 'ready', detail: 'Sheet reachable.' } : { state: 'error', detail: `The sheet answered ${r.status}.` };
  },
  // figures(env), people: { label, fetch(env) }, actions: [{ id, label, run(env) }], tag, refreshSeconds
};

export const payrollSheetPlugin: ConnectorPlugin = { connector: payrollSheetConnector /*, modules: [...] */ };
```

Then import `payrollSheetPlugin` in `apps/keystone/src/connectors.ts`, add `"@keystone/connector-payroll-sheet": "*"`
to `apps/keystone/package.json`, run `npm install`, and write the package's `README.md` and its tests with a fake
`env` (see `packages/connectors/website/test/website.test.ts` for a fake site).
