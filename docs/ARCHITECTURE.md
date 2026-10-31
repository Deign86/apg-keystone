# Keystone architecture

Keystone is one Tauri 2 + React + TypeScript app for macOS and Windows. It uses the same stack as the attendance
tracker, so one set of tools covers both. It is **modular-first**: a fixed kernel with removable parts (screens,
connected systems), each its own npm workspace package. The rules are in `AGENTS.md`, the reasoning in
`docs/MODULARITY.md`, and every package has a README describing what it owns and what removing it does.

```
packages/core              @keystone/core   schema, money, dates, formats, log, numbering, the directory,
                                            insight types, connector contract, service contracts       (kernel)
packages/ui                @keystone/ui     APG design system on Base UI; theme from shared/design/tokens.json (kernel)
packages/kit               @keystone/kit    registries, services, store, connector runtime, shell,
                                            screen and document building blocks, Platform interface    (kernel)
packages/modules/<id>      @keystone/module-<id>      home · overview · vouchers · billing · id-maker ·
                                                      directory · activity · connections               (parts)
packages/connectors/<id>   @keystone/connector-<id>   attendance · branding-studio · website           (parts)
apps/keystone              @keystone/app    the composition root
  src/modules.ts, src/connectors.ts           the only files that list the parts
  src/main.tsx                                builds the registry and starts the app
  src/platform/                               desktop (Tauri) and browser behind one interface
  src-tauri/                                  native side: files, OS keychain, finding and launching other apps
shared/                    tokens, fonts, logo, sample data (generated into ui and core by `npm run sync`)
```

Dependencies point one way: parts → kit → core and ui. A part's `package.json` may list only `core`, `ui` and `kit`
from Keystone; `npm run check:boundaries` fails on anything else.

## How a change flows

1. A screen calls `run(rule)` with a rule from its own package, for example `saveVoucher` from the vouchers module's
   `src/rules.ts`.
2. The rule returns the new state, the record and the sentence to show, or throws a `KeystoneError` with the reason.
   It never mutates anything.
3. The store saves `state.json` about 250ms later and shows the sentence. A refusal is written next to the save
   button and also shown as a toast.
4. No rule lives in a screen.

## How Overview and Home know what to show

They don't know any module. Each module declares contributions on its `ModuleDef` (a figure, a finding, waiting
items, a "New …" action, a Home stat, log tags, housekeeping on open). Overview, Home and Activity collect them from
the registry. Removing a module removes its contributions and changes nothing else (`docs/MODULARITY.md`).

## How one part uses another

Through a service, never an import. The contract is in core (`SERVICES` and its types in `kernel/services.ts`). The
billing module provides `billing.statement-payments` on its `ModuleDef`; the website's screen asks for it with
`useModuleApp().service(SERVICES.statementPayments)`. With billing installed, a payment reported online settles its
statement; without it, the screen still lists payments and says matching needs Billing. The registry allows one
provider per service.

## How connected systems plug in

A connector implements `Connector` (`packages/core/src/kernel/connectors.ts`). Its settings, health, live figures,
people import and actions are discovered from its fields. Every call goes through `Connections.safely`, which adds a
deadline and catches any failure, so a system that is down only marks its own card.

| System | How Keystone reaches it | What it gives Keystone |
|---|---|---|
| Attendance tracker | Its LAN viewer on port 4173; its `.apbackup` files | Who's in, late arrivals, time-outs; the live dashboard; employees and photos |
| Alpha Branding Studio | Bundle id or registry key; launch with files; GitHub releases | Version and update check; hands it listing photos |
| Website | Admin API as an admin account (cookie, `Origin`, user agent) | New hires with photos; payments matched to statements; inquiries |

None of the three needed a change to work. The one gap, the attendance roster on the network, is a decision for that
repo (`docs/ATTENDANCE-INTEGRATION.md`).

## Data

- **`state.json`:** the prototype's schema; new fields are optional. Modules keep their own data under
  `ext.<module id>`, which survives builds without that module.
- **Photos:** in `photos/`.
- **Connection settings:** in `connections.json`.
- **Secrets:** in the OS keychain (service `com.alphapremier.keystone`).
- **Folder:**
  - macOS: `~/Library/Application Support/com.alphapremier.keystone/`
  - Windows: `%APPDATA%\com.alphapremier.keystone\`

## Checks

```bash
npm run check            # generated files in sync · boundaries · typecheck · every package's tests · Taste Skill lint
cargo test --manifest-path apps/keystone/src-tauri/Cargo.toml
```

CI (`.github/workflows/keystone.yml`) runs all of these, then builds the macOS `.dmg` and the Windows setup `.exe`.
