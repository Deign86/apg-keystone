# Keystone architecture

Keystone is one Tauri 2 + React + TypeScript app for macOS and Windows. It uses the same stack as the attendance
tracker, so one set of tools covers both. It is **modular-first**: a fixed kernel with removable parts (screens,
connected systems, areas of rules). The rules are in `AGENTS.md`, the reasoning in `docs/MODULARITY.md`, and every
folder has a README describing what it owns and what removing it does.

```
packages/core     @keystone/core
  src/kernel/       schema, money, dates, formats, log, numbering, insight types, connector contract   (kernel)
  src/domains/      directory · vouchers · billing · ids · verification                                (parts)
packages/ui       @keystone/ui: APG design system on Base UI; Tailwind theme from shared/design/tokens.json  (kernel)
apps/keystone
  src/app/          registry, store, connector runtime, shell, module kit, document kit                 (kernel)
  src/platform/     desktop (Tauri) and browser behind one interface                                    (kernel)
  src/modules/      home · overview · vouchers · billing · id-maker · directory · activity · connections (parts)
  src/connectors/   attendance · branding-studio · website                                              (parts)
  src/main.tsx      the composition root: the only file that lists every part
  src-tauri/        native side: files, OS keychain, finding and launching other apps                   (kernel)
shared/           tokens, fonts, logo, sample data
```

## How a change flows

1. A screen calls `run(rule)` with a function from `@keystone/core`, for example `saveVoucher`.
2. The rule returns the new state, the record and the sentence to show, or throws a `KeystoneError` with the reason.
   It never mutates anything.
3. The store saves `state.json` about 250ms later and shows the sentence. A refusal is written next to the save
   button and also shown as a toast.
4. No rule lives in a screen.

## How Overview and Home know what to show

They don't know any module. Each module declares contributions on its `ModuleDef` (a figure, a finding, waiting
items, a "New …" action, a Home stat, log tags, housekeeping on open). Overview, Home and Activity collect them from
the registry. Removing a module removes its contributions and changes nothing else (`docs/MODULARITY.md`).

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
npm run check            # theme in sync · boundaries · typecheck · tests (incl. removing each part) · Taste Skill lint
cargo test --manifest-path apps/keystone/src-tauri/Cargo.toml
```

CI (`.github/workflows/keystone.yml`) runs all of these, then builds the macOS `.dmg` and the Windows setup `.exe`.
