# AGENTS.md: working on Keystone

For AI coding agents and human co-developers. Read this first, then the README.md in the package you are about to
change. Keystone is **modular-first**: every screen and every connected system is a part you can delete without
breaking anything else. Keep it that way. The rules below are enforced by CI.

**What we are building toward.** Read `docs/references/on-modular-architectures.md`. It starts from Param Rengaiah's
*On Modular Architectures* and updates it with current practice (modular monoliths, fitness functions, contribution
points, deep modules, team cognitive load). It ends in ten principles. A Keystone part:
- **Owns one business function or one external system.** Decompose by what changes together (Parnas).
- **Is removable and testable alone, and known only by what it declares.** Its contract is `ModuleDef` or `Connector`.
- **Uses only the context it is given** (`ModuleApp` or `ConnectorEnv`), and contains its own failures.
- **Is deep:** a small interface hiding a decision likely to change. The same decision spread across several parts is
  *information leakage*. Fix it.
- **Says what it is in its own README.**

Modularity comes from design, not from tools. The checks only stop it from slipping.

## What Keystone is

Alpha Premier Group's admin app: check vouchers, billing statements, employee IDs, a shared directory and an
activity log. It connects to the other APG systems: the attendance tracker (`Deign86/alpha-premier-attendance`),
Alpha Branding Studio (`Deign86/Alpha_Branding`) and the website (`Deign86/apg-website`). It is one Tauri 2 + React 18
+ TypeScript codebase for macOS and Windows.

## The map: a fixed kernel and removable packages

Every part is its own npm workspace package with its own `package.json`, `README.md`, `src/` and, where it has rules,
`test/`. A package can use only what its manifest declares, and CI checks what each layer may declare.

```
KERNEL (always present; anything may depend on it)
  packages/core     @keystone/core   money, dates, formats, the saved state, the log, numbering, the shared directory,
                                     the connector contract, insight types, published service contracts. No UI.
  packages/ui       @keystone/ui     the APG design system (tokens → Tailwind theme, Base UI controls). Knows no Keystone rule.
  packages/kit      @keystone/kit    the app runtime: shell, store, module and connector registries, service lookup,
                                     connector runtime, building blocks for screens, document kit, the Platform interface.

PARTS (removable; nothing may depend on them)
  packages/modules/<id>      @keystone/module-<id>      one screen, its rules, its tests, what it contributes and provides.
  packages/connectors/<id>   @keystone/connector-<id>   one connected system, its client, its tests, any screens it brings.

COMPOSITION (the only place that knows the full list)
  apps/keystone     @keystone/app    src/modules.ts lists the modules, src/connectors.ts the connectors, src/main.tsx
                                     starts the app; src/platform/ implements Platform for Tauri and the browser;
                                     src-tauri/ is the native side (files, keychain, finding and launching other apps).
```

## The rules (CI fails if you break one)

1. **A part never depends on another part.**
   - A module package may depend on `@keystone/core`, `@keystone/ui` and `@keystone/kit` only. Not on another
     module, not on a connector.
   - A connector package: the same three only. Not on another connector, not on a module.
   - Every import must be declared in the importing package's `package.json`, another package is imported by its
     name (never `@keystone/x/src/...`), and no relative import leaves the package folder.
   - Checked by `npm run check:boundaries`.
2. **The kernel never depends on a part.** `core` and `ui` depend on no Keystone package; `kit` only on `core` and `ui`.
   Only `apps/keystone/src/modules.ts` and `src/connectors.ts` import module and connector packages.
3. **Parts talk through contributions, not references.**
   - A module that wants to appear on Overview, Home or in the Activity filters declares it on its `ModuleDef` (`figure`,
     `finding`, `waiting`, `openWaiting`, `create`, `stat`, `logTags`, `onOpen`).
   - A screen that collects these (Overview, Home, Activity) reads them from the registry. It never names another
     module.
4. **When a part needs another part's behaviour, it asks for a service.**
   - The contract (types and the published name) lives in `packages/core/src/kernel/services.ts`: the name under
     `SERVICES`, and the name → contract pair in `ServiceContracts`.
   - The provider offers it on its `ModuleDef`: `provides: { [SERVICES.statementPayments]: statementPayments }`.
   - The consumer asks by name: `const desk = useModuleApp().service(SERVICES.statementPayments)`, typed from
     `ServiceContracts`, and **works without it** (`desk` is `undefined` when the provider is not installed). One
     provider per service; the registry refuses a second.
5. **Jumping to another screen is always guarded.** Use `useModuleApp()`: `app.has('connections') && app.go('connections')`.
   Never assume a module is installed.
6. **A hard dependency is declared, not assumed.** Prefer a service and degrade. If a module truly cannot work without
   another, set `requires: ['billing']`; the registry then leaves it out with a reason (shown under Connections).
7. **Rules live in the part that owns them, in plain functions, never in a screen.**
   - A module's rules are in its `src/rules.ts`; rules every part shares (money, numbering, the directory) are in core.
   - A screen calls `run((state, ctx) => someRule(state, …, ctx))`.
   - A rule returns `{ state, record, message }` or throws `KeystoneError` with the sentence to show.
   - Rules are pure: no I/O and no `Date.now()` (use `ctx.now()`).
8. **Connectors reach the world only through `env`:** `env.http`, `env.system`, `env.secret`, `env.settings`. Never import
   `@tauri-apps/*` outside `apps/keystone/src/platform/`. Every connector call is time-limited and caught by the
   runtime. A failing system shows on its own card and nowhere else.
9. **The saved state keeps the prototype's schema.**
   - `state.json` keeps the keys `dir`, `cv`, `bs`, `ids`, `log`.
   - Add only optional fields.
   - A new module keeps its own data under `state.ext[<module id>]`. Never rename or remove a key.
10. **Shared UI goes in the kernel.** If two parts need the same component, move it to `@keystone/kit`
    (Keystone-specific) or `@keystone/ui` (generic), never import it across parts.

## Removing a part

| To remove | Do this | What disappears | Nothing else changes because |
|---|---|---|---|
| A module | Delete its line in `apps/keystone/src/modules.ts`, its entry in `apps/keystone/package.json` and its `e2e/modules/<id>.e2e.ts` (then, if you like, its folder) and run `npm install` | Its rail entry, Home tile, Overview figure, finding, waiting items, "New …" button, log filter, the services it provides | Overview, Home and Activity read contributions from the registry; links are guarded by `app.has`; consumers of its services work without them |
| A connector | Delete its line in `apps/keystone/src/connectors.ts`, its entry in `apps/keystone/package.json` and its `e2e/connectors/<id>.e2e.ts`, then `npm install` | Its Home card, its settings, its import button, any screens it brought | The runtime only knows connectors through the registry |

`apps/keystone/src/test/removal.test.tsx` proves this. It removes each module and each connector in turn, installs
each one alone, and renders every screen that is left. **A module or connector you add joins that test
automatically.**

The end-to-end suite is different: it tests the app as shipped, so a test that follows one part's work onto another
screen (a saved voucher on Home, Overview or the Activity Log) names both. After removing a part, `npm run test:e2e`
names the tests that still expect it.

## Adding a part

- **A screen:** copy `packages/modules/README.md` › Template into `packages/modules/<id>/` (it includes the
  `package.json`, `tsconfig.json` and `vitest.config.ts`), then add one import and one list entry to
  `apps/keystone/src/modules.ts`, add `"@keystone/module-<id>": "*"` to `apps/keystone/package.json`, and run
  `npm install`.
- **A connected system:** the same with `packages/connectors/README.md` › Template, `apps/keystone/src/connectors.ts`
  and `@keystone/connector-<id>`.
- **Its end-to-end tests:** add `e2e/modules/<id>.e2e.ts` (or `e2e/connectors/<id>.e2e.ts`) that walks what a person
  does on it and checks the outcome on screen. `npm run check` fails until it exists.
- **Something another part needs from yours:** publish a service. Add its name to `SERVICES`, its types and its
  `ServiceContracts` line to `packages/core/src/kernel/services.ts`, provide it from your `ModuleDef`, and test both
  sides.
- Write the package's `README.md` with the same headings as the existing ones: Owns, Contributes, Needs,
  Removing it.
- For a significant change, add an Architecture Decision Record in `docs/adr/`. That means a change to the kernel, a
  new or removed part, a new service, a new saved-state format, or a new way of talking to another system.

## Tests

Each package tests itself in its own `test/` folder; `npm test` runs every package (`vitest.workspace.ts`). The
regression suites that guard the architecture live in the composition root:

| Suite | Where | Guards |
|---|---|---|
| Rules | `packages/modules/<id>/test/`, `packages/core/test/` | Numbering, tax math, amount in words, statuses, findings, the prototype's results kept exactly |
| Connectors | `packages/connectors/<id>/test/` | Each system's client against a fake of that system (never a real one): address and version parsing, sign-in, the website's Origin rule, backup reading |
| Kit | `packages/kit/test/` | Registry refusals, one provider per service, store saves and damaged files, connector isolation (throws, hangs), secrets never in the settings file |
| Removal | `apps/keystone/src/test/removal.test.tsx` | Every screen renders with any one part removed, with any one part alone, and with nothing but the kernel; a crashing screen stays contained |
| Contract | `apps/keystone/src/test/contract.test.ts` | Every installed module's contributions are well formed, never mutate the state, name only real parts and services; log tags are unique; the most urgent finding wins |
| Services | `apps/keystone/src/test/services.test.tsx` | The website settles a billing statement through the service, and still works without billing |
| End to end | `e2e/` (`npm run test:e2e`), in Chromium against the dev server | `screens.e2e.ts`: every screen the rail lists opens without the error panel, the shortcuts, saved work surviving a reload. `modules/<id>.e2e.ts` and `connectors/<id>.e2e.ts`, one per installed part (`npm run check:e2e`): what a person does on that screen or card and what it shows after, including what it contributes to Home, Overview and the Activity Log |

A new rule gets a test in its package. A new screen, button or flow gets an end-to-end test in its part's
`e2e/` file. A bug fix gets the test that would have caught it.

End-to-end tests use exact locators (roles and names from the screen, never CSS) and start from the sample data at
10:00 on Nov 2, 2026 in Manila (`e2e/support/fixed-clock.js`), so dates and overdue statuses never drift. Each test
gets a fresh browser, so nothing one saves reaches another. A failed run leaves a trace page per test in
`.e2e/results/`; CI keeps them as the `e2e-results` artifact.

## Before you commit

```bash
npm run check      # generated files in sync · boundaries · skills · e2e files · Oxlint · typecheck · every package's tests · Taste Skill lint
npm run test:e2e   # when you change a screen or a flow
cargo test --manifest-path apps/keystone/src-tauri/Cargo.toml   # when you touch src-tauri
```

`npm run lint` is Oxlint with the anti-slop rules (`.oxlintrc.json`). Fix a finding; don't silence it. A type
assertion needs a `SAFETY:` comment just above it, saying what makes it hold.

UI changes also go through the design checks in `docs/DESIGN.md`:
- **Skills to load:** the vendored `ui-skills` (`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`)
  in `.claude/skills/`, and the Taste Skill (`design-taste-frontend`) in `.agents/skills/`.
- **Inspector:** run `inspect.mjs --app` on the screens you changed and look at the screenshots.
- **Look:** follow the APG house style; it lives in `shared/design/tokens.json`.

## Pull requests

Every change reaches `main` through a pull request, and every pull request merges itself once CI is green.
- **When you open one,** turn on auto-merge with a merge commit, so it merges as soon as the Keystone workflow
  passes: checks, end-to-end tests, and both installer builds. CI runs on pull requests, `main` and `v…` tags, not on
  a bare branch push, so the checks are still pending when the pull request opens; GitHub only accepts auto-merge
  while they are.
- **Agents watch the pull request until it merges:** they fix CI failures, merge conflicts and review comments on
  it, and never skip or weaken a check to get green.
- **After the merge** the branch is deleted (the repository deletes merged branches).

This relies on two repository settings, **Allow auto-merge** and **Automatically delete head branches**
(Settings › General › Pull Requests), and on `main` requiring the three Keystone checks to pass.

## Conventions

- **Names:**
  - Module ids are lowercase with dashes (`id-maker`), and the id is also the route (`#id-maker`).
  - Log tags are short capitals (`CV`, `BS`, `ID`, `DIR`).
  - Draft keys are `<module id>.draft`.
- **Copy:** sentences a person reads come from rules (findings, messages, log lines), not from screens, so wording
  stays consistent. Use plain English, peso amounts as `₱1,234.56`, and dates as `Oct 30, 2026` (`shortDate`).
- **No secrets in files:** passwords and tokens go through `env.secret` and the OS keychain.
- **Don't edit generated files:** `packages/ui/src/theme.css`, `packages/ui/src/assets/` and
  `packages/core/src/seed.json` are regenerated from `shared/` by `npm run sync`.
- **The other APG repos:**
  - Treat them as external systems: integrate through what they already expose.
  - A change to them (for example `docs/ATTENDANCE-INTEGRATION.md`) is the owner's decision, made in that repo.

## Further reading

- `docs/references/on-modular-architectures.md`: the reference (Rengaiah 2014, updated with what came after), the ten
  principles, the trade-offs, and the sources.
- `docs/adr/`: why things are the way they are, one decision per file.
- `docs/MODULARITY.md`: the contracts in full, and why the kernel and parts are split this way.
- `docs/ARCHITECTURE.md`: how a change flows, where data lives, the three connectors.
- `docs/DESIGN.md`: the look and where it comes from.
- `README.md` in each package: what that part owns and what removing it does.
