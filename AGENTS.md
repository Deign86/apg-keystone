# AGENTS.md: working on Keystone

For AI coding agents and human co-developers. Read this first, then the README.md in the folder you are about to
change. Keystone is **modular-first**: every screen and every connected system is a part you can delete without
breaking anything else. Keep it that way. The rules below are enforced by CI.

**What we are building toward.** Our reference is Param Rengaiah's *On Modular Architectures*, summarised and mapped to
Keystone in `docs/references/on-modular-architectures.md`. It defines a module (after Kirk Knoernschild) as a
*"deployable, manageable, natively reusable, composable, stateless unit of software that provides a concise interface
to consumers."* Before you add or change a part, ask:

- Does it have one clear business purpose?
- Does it only use the context it is given?
- Does it expose only its `ModuleDef` or `Connector`?
- Can it be removed alone?

Modularity comes from design, not from tools, so don't expect a framework to fix a dependency you have tangled.

## What Keystone is

Alpha Premier Group's admin app: check vouchers, billing statements, employee IDs, a shared directory and an
activity log. It connects to the other APG systems: the attendance tracker (`Deign86/alpha-premier-attendance`),
Alpha Branding Studio (`Deign86/Alpha_Branding`) and the website (`Deign86/apg-website`). It is one Tauri 2 + React 18
+ TypeScript codebase for macOS and Windows.

## The map: a fixed kernel and removable parts

```
KERNEL (always present; other code may depend on it)
  packages/core/src/kernel/   data schema, money, dates, formats, the log, numbering, the connector contract, insight types
  packages/ui/                the APG design system (tokens → Tailwind theme, Base UI controls). Knows nothing of Keystone's rules.
  apps/keystone/src/app/      shell, store, module and connector registries, connector runtime, the module kit, document kit
  apps/keystone/src/platform/ desktop (Tauri) and browser implementations of one Platform interface
  apps/keystone/src-tauri/    the native side: files, keychain, finding and launching other apps

PARTS (removable; nothing may depend on them)
  packages/core/src/domains/<domain>.ts      rules for one area. May import the kernel and domains/directory only.
  apps/keystone/src/modules/<module>/        one screen and what it contributes. Listed in modules/index.ts.
  apps/keystone/src/connectors/<system>/     one connected system, and any screens it brings. Listed in connectors/index.ts.

COMPOSITION (the only place that knows the full list)
  apps/keystone/src/main.tsx  +  modules/index.ts  +  connectors/index.ts
```

## The rules (CI fails if you break one)

1. **A part never imports another part.**
   - A module does not import another module or a connector.
   - A connector does not import another connector or a module.
   - A core domain imports only the kernel and `domains/directory`.
   - Checked by `npm run check:boundaries`.
2. **The kernel never imports a part.** `app/`, `platform/` and `core/kernel/` know no module, connector or domain.
3. **Parts talk through contributions, not references.**
   - A module that wants to appear on Overview, Home or in the Activity filters declares it on its `ModuleDef` (`figure`,
     `finding`, `waiting`, `openWaiting`, `create`, `stat`, `logTags`, `onOpen`).
   - A screen that collects these (Overview, Home, Activity) reads them from the registry. It never names another
     module.
4. **Jumping to another screen is always guarded.** Use `useModuleApp()`: `app.has('connections') && app.go('connections')`.
   Never assume a module is installed.
5. **A hard dependency is declared, not assumed.** If a module cannot work without another, set `requires: ['billing']`.
   Without it, the registry leaves the module out with a reason (shown under Connections) instead of breaking.
6. **Rules live in `@keystone/core`, never in a screen.**
   - A screen calls `run((state, ctx) => someRule(state, …, ctx))`.
   - A rule returns `{ state, record, message }` or throws `KeystoneError` with the sentence to show.
   - Rules are pure: no I/O and no `Date.now()` (use `ctx.now()`).
7. **Connectors reach the world only through `env`:** `env.http`, `env.system`, `env.secret`, `env.settings`. Never import
   `@tauri-apps/*` outside `platform/`. Every connector call is time-limited and caught by the runtime. A failing
   system shows on its own card and nowhere else.
8. **The saved state keeps the prototype's schema.**
   - `state.json` keeps the keys `dir`, `cv`, `bs`, `ids`, `log`.
   - Add only optional fields.
   - A new module keeps its own data under `state.ext[<module id>]`. Never rename or remove a key.
9. **Shared UI goes in the kernel.** If two modules need the same component, move it to `app/kit.tsx` (Keystone-specific)
   or `packages/ui` (generic), never import it across modules.

## Removing a part

| To remove | Do this | What disappears | Nothing else changes because |
|---|---|---|---|
| A module | Delete its line in `apps/keystone/src/modules/index.ts` (and its folder) | Its rail entry, Home tile, Overview figure, finding, waiting items, "New …" button, log filter | Overview, Home and Activity read contributions from the registry; links to it are guarded by `app.has` |
| A connector | Delete its line in `apps/keystone/src/connectors/index.ts` (and its folder) | Its Home card, its settings, its import button, any screens it brought | The runtime only knows connectors through the registry |
| A domain | Delete `packages/core/src/domains/<x>.ts` and its export, plus the module that uses it | Its rules | No other domain imports it (directory is the only shared domain) |

`apps/keystone/src/test/removal.test.tsx` proves this. It removes each module and each connector in turn and renders
every screen that is left. **When you add a module or a connector, it joins that test automatically.**

## Adding a part

- **A screen:** copy `apps/keystone/src/modules/README.md` › Template into `modules/<id>/index.tsx`, then add one line to
  `modules/index.ts`.
- **A connected system:** copy `apps/keystone/src/connectors/README.md` › Template into `connectors/<id>/index.ts`, then
  add one line to `connectors/index.ts`.
- **Rules for a new area:** a new `packages/core/src/domains/<area>.ts` with tests in `packages/core/test/`. Export it
  from `packages/core/src/index.ts`.
- Write a `README.md` in the new folder using the same headings as the existing ones: Owns, Contributes, Needs,
  Removing it.

## Before you commit

```bash
npm run check   # generated theme in sync · boundaries · typecheck · all tests (incl. removal) · Taste Skill lint
cargo test --manifest-path apps/keystone/src-tauri/Cargo.toml   # when you touch src-tauri
```

UI changes also go through the design checks in `docs/DESIGN.md`:
- **Skills to load:** the vendored `ui-skills` (`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`)
  and `taste-skill`, all in `.claude/skills/`.
- **Inspector:** run `inspect.mjs --app` on the screens you changed and look at the screenshots.
- **Look:** follow the APG house style; it lives in `shared/design/tokens.json`.

## Conventions

- **Names:**
  - Module ids are lowercase with dashes (`id-maker`), and the id is also the route (`#id-maker`).
  - Log tags are short capitals (`CV`, `BS`, `ID`, `DIR`).
  - Draft keys are `<module id>.draft`.
- **Copy:** sentences a person reads come from `@keystone/core` (findings, messages, log lines), so wording stays
  consistent. Use plain English, peso amounts as `₱1,234.56`, and dates as `Oct 30, 2026` (`shortDate`).
- **No secrets in files:** passwords and tokens go through `env.secret` and the OS keychain.
- **Don't edit generated files:** `packages/ui/src/theme.css` is regenerated by `npm run sync`.
- **The other APG repos:**
  - Treat them as external systems: integrate through what they already expose.
  - A change to them (for example `docs/ATTENDANCE-INTEGRATION.md`) is the owner's decision, made in that repo.

## Further reading

- `docs/references/on-modular-architectures.md`: the reference article, how Keystone applies each idea, where it falls
  short, and what "going all the way" would mean.
- `docs/MODULARITY.md`: the contracts in full, and why the kernel and parts are split this way.
- `docs/ARCHITECTURE.md`: how a change flows, where data lives, the three connectors.
- `docs/DESIGN.md`: the look and where it comes from.
- `README.md` in each folder: what that part owns and what removing it does.
