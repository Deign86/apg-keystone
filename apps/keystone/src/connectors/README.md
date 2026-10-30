# Connectors

One folder per connected system. `index.ts` is the list, and the only place connectors are named together.

| Connector | System (repo) | How Keystone reaches it | README |
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
- **Imports:** never import another connector or a module. A connector may ship its own screens in its folder, through
  `ConnectorPlugin.modules`.
- **Don't guard against failure yourself:** throwing, hanging or being unavailable are all fine. The runtime turns them
  into a status on this connector's card only. Return honest health:
  - `setup`: needs settings.
  - `offline`: no answer.
  - `error`: answered, but refused.
  - `unsupported`: this platform can't use it.
- **Keep it to what the system already exposes.** A change to the other system belongs in its own repo and is the
  owner's decision.
- **Removing a connector:** delete its line in `index.ts`. `src/test/removal.test.tsx` covers every connector listed
  there.

## Template

```ts
// connectors/payroll-sheet/index.ts
import type { Connector } from '@keystone/core';
import type { ConnectorPlugin } from '../../app/registry';

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

Then add `payrollSheetPlugin` to `index.ts`, write `connectors/payroll-sheet/README.md`, and add tests next to
`src/test/connectors.test.ts`. Use a fake `env`; never call a real system from a test.
