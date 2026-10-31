# Modularity in Keystone

**The promise:** any screen, any connected system and any area of rules can be taken out of Keystone, and
everything else keeps working. This document explains the design that makes that true and the contracts a new part
has to follow. `AGENTS.md` has the short rules; this is the reasoning behind them.

**The reference this is measured against:** Param Rengaiah, *On Modular Architectures* (2014). It is summarised, with
each principle mapped to Keystone and the honest gaps, in
[`docs/references/on-modular-architectures.md`](references/on-modular-architectures.md). Its core ideas, as Keystone
uses them:

- **Modules are physical units.** Each has a clear business context, works within the context it is given, and has a
  concise public interface. In Keystone that interface is `ModuleDef` or `Connector`, and the context is `ModuleApp` or
  `ConnectorEnv`.
- **Modularity has to hold at design time and at run time.** At design time, the boundary check and folder layout
  enforce it. At run time, the registry, per-screen error boundaries, isolated connector calls and the removal test do.
- **Design creates modularity; tools don't.** The stack was chosen for one codebase. What keeps Keystone modular is
  this design and the checks that hold it.
- **A modularity release comes before the next big exercise.** Keystone shipped this restructure before adding more
  features.

## Kernel and parts

Keystone is a small, fixed **kernel** with **parts** plugged into it.

| | Kernel | Parts |
|---|---|---|
| What | The data schema, money and dates, the activity log, numbering, the registries, the shell, the design system, the platform layer | Domains (rules for one area), modules (screens), connectors (other systems) |
| Where | `packages/core/src/kernel`, `packages/ui`, `apps/keystone/src/app`, `apps/keystone/src/platform`, `src-tauri` | `packages/core/src/domains/*`, `apps/keystone/src/modules/*`, `apps/keystone/src/connectors/*` |
| Can be removed? | No: everything depends on it | Yes, one at a time or all together |
| Depends on | Nothing outside the kernel | The kernel; a domain may also read `domains/directory` |

The kernel stays small on purpose. It holds only what is either needed by everything (the schema, the log) or what
connects parts without them knowing each other (the registries).

## Why parts don't import each other

If Overview imported the vouchers module to count vouchers, removing vouchers would break Overview. So Overview
imports nothing. Instead, each module declares what it **contributes**, and Overview collects whatever is
registered:

```
modules/vouchers  ──contributes──▶  figure · finding · waiting · openWaiting · create · stat · logTags
modules/billing   ──contributes──▶  figure · finding · waiting · openWaiting · create · stat · logTags · onOpen
modules/id-maker  ──contributes──▶  figure · finding · waiting · openWaiting · create · stat · logTags · onOpen
modules/directory ──contributes──▶  figure · stat · logTags
                                         │
                              app/registry (buildRegistry)
                                         │
        ┌────────────────┬───────────────┴───────────┬──────────────────┐
     Overview          Home                      Activity          Rail (⌘0–⌘9)
  figures, waiting,  tiles, finding           log filters        one entry each
  finding, "New …"
```

Take a module out and its arrow disappears. Overview shows one fewer figure, Home one fewer tile; neither screen
changes.

## The contracts

### `ModuleDef` (`apps/keystone/src/app/registry.ts`)

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

A module reaches the rest of the app only through `useModuleApp()`: `go`, `has`, `setDraft`, `state`, `ctx`.
Everything else it needs comes from `@keystone/core`, `@keystone/ui` and `app/kit`.

### `Connector` (`packages/core/src/kernel/connectors.ts`)

| Field | Required | What it is for |
|---|---|---|
| `id`, `name`, `about`, `platforms`, `settings` | yes | Identity, where it works, and its settings form, drawn automatically |
| `health(env)` | yes | Is it there? `ready`, `setup`, `offline`, `error` or `unsupported`, with one sentence |
| `figures(env)` | | Live figures on its Home card |
| `people` | | An import into the Directory. People are matched by link or name and never duplicated. |
| `actions` | | Buttons on its card |
| `tag`, `refreshSeconds` | | Short label for linked records; how often to check it |

`buildRegistry` validates every connector; a broken one is refused, not loaded. The runtime (`app/connections.ts`)
runs every call through `safely()`: an 8-second deadline (longer for imports), with any failure turned into a health
state. So a connector that hangs, throws or isn't installed can only affect its own card.

A connector may bring its own screens (`ConnectorPlugin.modules`), the way the website brings the Website inbox. Those
screens follow the module rules.

### Domains (`packages/core/src/domains`)

A domain is the rules for one area, as pure functions: `(state, …, ctx) → { state, record, message }`, or a thrown
`KeystoneError`. It also exports its contributions as plain data (`voucherFigure`, `billingFinding`, …), which its
module passes to the registry. Domains import the kernel and, when they need to look up a payee or client,
`domains/directory`. Nothing else.

**Why the directory may be shared:** it is master data that other areas refer to by code. It imports no other domain,
so it can never form a cycle.

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
| Boundaries | `npm run check:boundaries` (`scripts/check-boundaries.mjs`) | A part imports another part, the kernel imports a part, or `packages/ui` imports Keystone's rules |
| Removal | `npm test` → `apps/keystone/src/test/removal.test.tsx` | Removing any one module or connector makes any remaining screen throw, log an error, or lose its title |
| Isolation | same file, and `src/test/connectors.test.ts` | A crashing screen takes down the rail; a crashing or hanging connector affects another; a broken plugin stops the app loading |
| Domain independence | `packages/core/test/core.test.ts` | The finding stops working with a domain left out |

All of these run in CI on every push. The boundary check was verified by planting violations (a module importing a
module, the kernel importing a module, a domain importing a domain), and it reported each one. The removal test was
verified by planting a hidden dependency (Home reading the vouchers module directly). It failed exactly the
"without the vouchers module" case.

## When modularity costs something

- **A screen with nothing to show:** a module that is installed while its source is missing shows that honestly. The
  Website screen without a website account says so and offers setup (if Connections is installed).
- **Shared code:** anything two modules need moves into the kernel (`app/kit.tsx`, `app/documents.tsx`,
  `packages/ui`). The kernel grows a little; the parts stay independent.
- **The trade-off on the Overview finding:** each domain sets its own priority. The order (overdue money, then
  approvals, then printing) lives in the domain files, not in one place.
