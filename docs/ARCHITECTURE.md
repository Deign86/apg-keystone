# Keystone architecture

Keystone is one Tauri 2 + React + TypeScript app for macOS and Windows. It uses the same stack as the attendance
tracker, so one set of tools covers both. It is **modular-first**: a fixed kernel with removable parts (screens,
connected systems), each its own npm workspace package. The rules are in `AGENTS.md`, the reasoning in
`docs/MODULARITY.md`, and every package has a README describing what it owns and what removing it does.

```
packages/core              @keystone/core   schema, money, dates, formats, log, numbering, the directory,
                                            insight types, connector contract, service contracts       (kernel)
packages/ui                @keystone/ui     APG design system on Base UI; theme from shared/design/tokens.json (kernel)
packages/kit               @keystone/kit    registries, services, store, connector shortcuts, shell,
                                            screen and document building blocks, Platform interface    (kernel)
packages/modules/<id>      @keystone/module-<id>      home · overview · vouchers · funds · billing ·
                                                      id-maker · directory · activity · timekeeping ·
                                                      payroll · profile · accounts · data · banks ·
                                                      company; id-maker is kept but not installed
                                                      (docs/adr/0046)                                  (parts)
packages/connectors/<id>   @keystone/connector-<id>   attendance · id-maker-app · branding-studio ·
                                                      website                                          (parts)
apps/keystone              @keystone/app    the composition root
  src/modules.ts, src/connectors.ts           the only files that list the parts
  src/main.tsx                                builds the registry and starts the app
  src/platform/                               desktop (Tauri), browser and the cloud records behind one interface
  src-tauri/                                  native side: files, and finding, starting and installing other apps
shared/                    tokens, fonts, logo, the tests' sample records (generated into ui and core by `npm run sync`)
```

Dependencies point one way: parts → kit → core and ui. A part's `package.json` may list only `core`, `ui` and `kit`
from Keystone; `npm run check:boundaries` fails on anything else.

## How a change flows

1. A screen calls `run(rule)` with a rule from its own package, for example `saveVoucher` from the vouchers module's
   `src/rules.ts`.
2. The rule returns the new state, the record and the sentence to show, or throws a `KeystoneError` with the reason
   and the fields it is about. It never mutates anything.
3. The store saves `state.json` (or the changed records, in the cloud) about 250ms later and shows the sentence. A refusal is written next to the save
   button and also shown as a toast, and the fields it names are marked, the first one focused (docs/adr/0044).
4. No rule lives in a screen.

## How Overview and Home know what to show

They don't know any module. Each module declares contributions on its `ModuleDef` (a figure, a finding, waiting
items, a "New …" action, a Home stat, log tags, housekeeping on open). Overview, Home and Activity collect them from
the registry. Removing a module removes its contributions and changes nothing else (`docs/MODULARITY.md`).

## How one part uses another

Through a service, never an import. The contract is in core (`SERVICES` and its types in `kernel/services.ts`). The
billing module provides `billing.statement-payments` on its `ModuleDef`; a part that settles statements from outside
billing asks for it with `useModuleApp().service(SERVICES.statementPayments)` and gets `undefined`, and says so, when
billing is not installed. No part that ships asks for it today. Likewise timekeeping provides
`timekeeping.employee-attendance`, and payroll asks for it to price a cut-off; without it, payroll pays every weekday
in full and says so (docs/adr/0008). Bank Accounts provides `banks.bank-accounts`, the company's bank accounts, and
billing asks for it to show "Pay into" on a statement; without it, the payment instructions are typed as before
(docs/adr/0010). Check Vouchers provides `vouchers.drafts`, and Requests for Funds asks for it to draft the check
voucher when the owner approves a request paid by check; without it, the approval stands and no voucher is drafted
(docs/adr/0011). A request paid by transfer needs no service: approving it makes the fund transfer request (docs/adr/0021).
The registry allows one provider per service.

## How connected systems plug in

A connector implements `Connector` (`packages/core/src/kernel/connectors.ts`): an id, a name, its app's logo and
`open(env)`. Home shows each as a shortcut (`ConnectorShortcut` in the kit), the logo with the name under it.
Clicking it calls `open` with only the operating system (`env.system`), under a 15-second deadline; anything it says,
or any failure, is a message on screen (docs/adr/0007).

| System | How Keystone finds it | What its shortcut does |
|---|---|---|
| Attendance tracker | Bundle id `com.alphapremier.attendance` (macOS) or its Uninstall registry key (Windows) | Starts the app. Not installed: fetches its installer from its latest release and opens it, or opens the release page when it cannot (docs/adr/0029). Installed and older: offers the newer version under its shortcut (docs/adr/0035) |
| Alpha Premier ID Maker | Bundle id `com.alphapremiergroup.idmaker` (macOS) or its Uninstall registry key (Windows) | The same as the attendance tracker |
| Alpha Branding Studio | Bundle id `com.alphapremier.brandingstudio` (macOS) or its Uninstall registry key (Windows) | The same as the attendance tracker |
| Website | Nothing to find | Opens `alphapremiergroup.com/admin` in the browser |

Keystone reads nothing from these systems and keeps no password for any of them.

## Data

- **`state.json`:** the prototype's schema; new fields are optional. Modules keep their own data under
  `ext.<module id>`, which survives builds without that module.
- **In the cloud (docs/adr/0009):** a build with the `VITE_FIREBASE_*` variables keeps the same state in Firestore,
  one document per record (`toDocuments` in core), behind an email and password sign-in. `platform/cloud.ts` wraps the
  local platform: it moves a computer's records in once, writes only the documents a save changed, and keeps a copy
  in `state.json`. Firebase itself is only in `platform/firestore.ts`; setup is in `docs/FIREBASE.md`.
- **Live updates (docs/adr/0049):** every collection the records are read from is listened to, with the read's own
  filter, and what changes is put over what this computer knew (platform/cloud.ts, irestore.ts); the store shows it
  without saving it back, and keeps a change of its own not saved yet on top. A listener that stops listens again by
  itself; meanwhile the records are read again every 2 minutes and when Keystone comes back into focus or online, and the
  rail says live updates are paused. Each Activity Log line names who saved it, and the lines another computer adds are
  told as quiet toasts, with the screens they changed marked in the rail; a form holding a record someone else changed
  says so and keeps what is typed.
- **A save the cloud has not confirmed (docs/adr/0013):** noted in web storage (`keystone-pending-saves:<uid>`,
  `platform/pending.ts`) until the cloud confirms it, and written on the next start if the page closed first, unless
  another computer changed that record since.
- **Who is signed in (docs/adr/0011):** the member's document (`role` owner or staff, and `name`) is read before the
  records and reaches the rules as `ctx.who`. A module may keep one list as cloud documents of its own
  (`ModuleDef.documents`): Requests for Funds keeps each request in `keystone/apg/rf/{no}`, where `firestore.rules`
  lets only the owner decide and lets staff read only their own. Without a sign-in there is no `ctx.who`.
- **Accounts (docs/adr/0014, 0015, 0033):** the owner makes and removes staff accounts on the User Accounts screen, through
  the `accounts` service the cloud platform provides (`Platform.provides`). `platform/firestore.ts` makes the sign-in in a second Firebase app kept in memory, so the owner
  stays signed in, then writes the member document; removing deletes that document and leaves the sign-in, which then
  opens nothing. `firestore.rules` let only an owner write or delete a member.
- **Passwords (docs/adr/0016):** anyone signed in changes theirs on User Accounts (the `accounts` service's `changePassword`,
  which signs in again with the current one first). The sign-in screen's Forgot password? has Firebase email a link to
  choose a new one (`CloudSession.sendPasswordReset`), answering the same whether or not the email has an account.
- **On a phone:** the same web build, hosted on Firebase Hosting (`firebase.json › hosting`, `npm run build:web`),
  with a top bar and a menu instead of the rail below 768px.
- **Photos:** in `photos/`.
- **Folder:**
  - macOS: `~/Library/Application Support/com.alphapremier.keystone/`
  - Windows: `%APPDATA%\com.alphapremier.keystone\`

## Checks

```bash
npm run check            # generated files in sync · boundaries · typecheck · every package's tests · Taste Skill lint
cargo test --manifest-path apps/keystone/src-tauri/Cargo.toml
```

CI (`.github/workflows/keystone.yml`) runs all of these, then builds the macOS `.dmg` and the Windows setup `.exe`.
On a merge into `main` that brings a `feat` or a `fix`, and for a `v…` tag or Run workflow with a version, it also
publishes a GitHub release with both installers, plus the signed update files and `latest.json` that installed copies
update themselves from (README › Making a release, ADR 0006).
