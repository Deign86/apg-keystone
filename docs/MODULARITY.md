# Modularity in Keystone

**The promise:** any screen and any connected system can be taken out of Keystone, or installed on its own, and
everything else keeps working. Each one is its own package, with its rules, its screen and its tests inside it. This document explains the design that makes that true and the contracts a new part
has to follow. `AGENTS.md` has the short rules; this is the reasoning behind them.

**The reference this is measured against:** `docs/references/on-modular-architectures.md`. It starts from Param
Rengaiah's *On Modular Architectures* (2014) and updates it with what the field has learned since:
- the modular monolith (Fowler, Grzybek, Shopify's Packwerk, Spring Modulith);
- architecture checked by tests (*Building Evolutionary Architectures*);
- plugin platforms that compose parts by what they declare (VS Code);
- the theory underneath (Parnas's information hiding, Ousterhout's deep modules, Martin's component principles);
- people (Team Topologies, Conway's law), and documentation for agents (`AGENTS.md`, ADRs).

It distils ten principles (P1–P10), a module definition for 2026, and Keystone's deliberate trade-offs (T1–T3).
Significant decisions are recorded in `docs/adr/`.

## Kernel and parts

Keystone is a small, fixed **kernel** with **parts** plugged into it.

| | Kernel | Parts |
|---|---|---|
| What | The data schema, money and dates, the activity log, numbering, the shared directory, contracts, the registries, the shell, the design system | Modules (a screen and the rules for its area), connectors (other systems) |
| Packages | `@keystone/core`, `@keystone/ui`, `@keystone/kit`; plus the app's platform layer and `src-tauri` | `@keystone/module-<id>` in `packages/modules/`, `@keystone/connector-<id>` in `packages/connectors/` |
| Can be removed? | No: everything depends on it | Yes, one at a time or all together |
| Depends on | `kit` on `core` and `ui`; `core` and `ui` on nothing | `core`, `ui` and `kit`, declared in its `package.json`. Nothing else from Keystone |

The composition root, `apps/keystone`, is the only package that depends on parts. In it, `src/modules.ts` and
`src/connectors.ts` are the only files that import them.

The kernel stays small on purpose. It holds only what is either needed by everything (the schema, the log) or what
connects parts without them knowing each other (the registries).

## Why parts don't import each other

If Overview imported the vouchers module to count vouchers, removing vouchers would break Overview. So Overview
imports nothing. Instead, each module declares what it **contributes**, and Overview collects whatever is
registered:

```
module-vouchers   ──contributes──▶  figure · finding · waiting · openWaiting · create · stat · logTags
module-billing    ──contributes──▶  figure · finding · waiting · openWaiting · create · stat · logTags · onOpen
module-id-maker   ──contributes──▶  figure · finding · waiting · openWaiting · create · stat · logTags · onOpen
module-directory  ──contributes──▶  figure · stat · logTags
                                         │
                              @keystone/kit registry (buildRegistry)
                                         │
        ┌────────────────┬───────────────┴───────────┬──────────────────┐
     Overview          Home                      Activity          Rail (⌘0–⌘9)
  figures, waiting,  tiles, finding           log filters        one entry each
  finding, "New …"
```

Take a module out and its arrow disappears. Overview shows one fewer figure, Home one fewer tile; neither screen
changes.

## The contracts

### `ModuleDef` (`packages/kit/src/registry.ts`)

| Field | Required | What it is for |
|---|---|---|
| `id`, `title`, `section`, `blurb`, `order`, `Screen` | yes | Identity, rail position (`order`) and the screen itself |
| `requires` | | Module ids it cannot work without. If one is missing, the module is left out with its reason. |
| `onHome`, `stat` | | A tile on Home with one live figure |
| `figure` | | A cell in Overview's figure strip. Mark the one that answers the screen's question `lead: true`. |
| `finding` | | A candidate for the one sentence under Home and Overview. Highest `priority` wins: billing 30, vouchers 20, IDs 10. |
| `waiting`, `openWaiting` | | Records waiting on someone, listed on Overview, and how to open one |
| `create` | | A "New …" button on Overview |
| `logTags` | | The activity-log tags it writes, with their filter label |
| `onOpen` | | Housekeeping when Keystone opens (marking overdue or expired records) |
| `provides` | | Services it offers other parts, by published name (see below) |

A module reaches the rest of the app only through `useModuleApp()`: `go`, `has`, `setDraft`, `service`, `state`, `ctx`.
Everything else it needs comes from `@keystone/core`, `@keystone/ui` and `@keystone/kit`.

### Services (`packages/core/src/kernel/services.ts`)

Contributions flow one way, from a part to the kernel's collecting screens. Sometimes a part needs another part's
*behaviour*: the website's screen has to settle a billing statement. Importing the billing package would weld the two
together, so instead:

```
core: SERVICES.statementPayments = 'billing.statement-payments', interface StatementPayments
        ▲                                                      ▲
        │ implements                                           │ asks for, by name
module-billing: provides: { [SERVICES.statementPayments]: … }  connector-website: app.service(SERVICES.statementPayments)
```

This is the OSGi service-registry pattern, and the "published interface" of Fowler and of Spring Modulith's named
interfaces. The rules:
- the contract (name and types) lives in core, owned by neither side;
- one provider per service: the registry refuses a second, with a reason;
- a module that was left out (a missing `requires`) offers nothing;
- the consumer gets `undefined` when the provider is not installed and must still work. The Website screen lists
  payments and inquiries and says matching needs Billing.

Prefer a service to `requires`: it keeps the consumer installable without the provider.

### `Connector` (`packages/core/src/kernel/connectors.ts`)

| Field | Required | What it is for |
|---|---|---|
| `id`, `name`, `about`, `platforms`, `settings` | yes | Identity, where it works, and its settings form, drawn automatically |
| `health(env)` | yes | Is it there? `ready`, `setup`, `offline`, `error` or `unsupported`, with one sentence |
| `figures(env)` | | Live figures on its Home card |
| `people` | | An import into the Directory. People are matched by link or name and never duplicated. |
| `actions` | | Buttons on its card |
| `tag`, `refreshSeconds` | | Short label for linked records; how often to check it |

`buildRegistry` validates every connector; a broken one is refused, not loaded. The runtime (`@keystone/kit`'s `connections.ts`)
runs every call through `safely()`: an 8-second deadline (longer for imports), with any failure turned into a health
state. So a connector that hangs, throws or isn't installed can only affect its own card.

A connector may bring its own screens (`ConnectorPlugin.modules`), the way the website brings the Website inbox. Those
screens follow the module rules.

### Rules (`packages/modules/<id>/src/rules.ts`)

The rules for an area live with its screen, in the module's package, as pure functions:
`(state, …, ctx) → { state, record, message }`, or a thrown `KeystoneError`. The module also computes its
contributions there (`voucherFigure`, `billingFinding`, …) and tests them in its own `test/`. Removing the module
removes its rules with it; nothing else could have been using them.

**Why the directory is in the kernel:** it is master data every area refers to by code (payees, clients, card
holders), and connectors import people into it. So its records and rules are shared kernel (`core/kernel/directory.ts`);
only its screen is a module.

**Integrity is data-level.** `usedBy` reads the saved records, not the installed modules. A vendor that a voucher
points to stays protected from deletion even in a build without the vouchers screen.

## The saved state

`state.json` is one document in the web prototype's schema (`dir`, `cv`, `bs`, `ids`, `log`), so backups move between
every version. The rules for it:

- **Additions:** fields added later are optional.
- **New modules:** a new module stores its data under `state.ext[<module id>]`. `parseState` keeps any `ext` keys a build
  doesn't recognise, so removing a module never deletes its data. Putting the module back finds the data where it was.
- **Log entries:** an entry written by a module this build doesn't have is still shown, under "Other".

## How it is enforced

| Check | Command | Fails when |
|---|---|---|
| Boundaries | `npm run check:boundaries` (`scripts/check-boundaries.mjs`) | A package's manifest lists a Keystone package its layer may not use; an import isn't declared in the manifest; an import reaches into another package's files; a relative import leaves its package; an app file other than `modules.ts`/`connectors.ts` imports a part; a package is misnamed |
| Removal | `npm test` → `apps/keystone/src/test/removal.test.tsx` | Removing any one module or connector, or installing any one alone, makes a screen throw, log an error, or lose its title; a crashing screen takes down the rail |
| Contract | `apps/keystone/src/test/contract.test.ts` | A module's contributions are malformed or mutate the state; it names a part or service that doesn't exist; two modules claim a log tag; a published service has no provider; the most urgent finding stops winning |
| Services | `apps/keystone/src/test/services.test.tsx` | The website stops settling statements through the service, or stops working without billing |
| Isolation | `packages/kit/test/` | A crashing or hanging connector affects another; secrets reach the settings file; a broken plugin stops the app loading; a second provider of a service is accepted |

All of these run in CI on every push, and each was verified by breaking what it guards:
- **Boundaries:** twelve planted violations (a connector importing a module, declared and undeclared; a module's
  manifest listing another module; a relative import into another package; a deep import into the kit; the kit
  depending on a module; core importing ui; ui depending on core; an undeclared library; `main.tsx` importing a
  module; a misnamed package; a dynamic import of a connector). It reported each one.
- **Tests:** fourteen planted defects (service lookup ignoring the name, two providers accepted, `requires` ignored, a
  damaged file overwritten, a secret saved in settings, no deadline on connectors, the website screen crashing,
  ignoring or refusing without billing, no `Origin` header, no re-sign-in, billing not providing its service, a
  module mutating state, a duplicate log tag). Each made at least one test fail.

## When modularity costs something

- **A screen with nothing to show:** a module that is installed while its source is missing shows that honestly. The
  Website screen without a website account says so and offers setup (if Connections is installed).
- **Shared code:** anything two modules need moves into the kernel (`@keystone/kit`, `@keystone/ui`, or core for
  rules). The kernel grows a little; the parts stay independent.
- **Contracts in core:** a new service adds a name and types to core, which every part then sees. It is the price of
  neither side importing the other.
- **The trade-off on the Overview finding:** each module sets its own priority. The order (overdue money, then
  approvals, then printing) lives in each module's rules, not in one place. The contract test pins the result.
