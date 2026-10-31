# 0005. One package per module and connector, and named services between them

Status: Accepted · Date: 2026-10-31

## Context

- **Before:** modules and connectors were folders inside `apps/keystone/src`, and the rules for each area were files
  in `@keystone/core` (`domains/`). A script checked that no folder imported another. The reference
  (`docs/references/on-modular-architectures.md`, T3) recorded this as a deliberate departure from packages.
- **What it left open:**
  - A part's rules, screen and tests lived in three places, so taking a part out meant knowing all three.
  - Nothing said which libraries a part used: any part could import anything installed.
  - The website's screen matched payments by importing billing's rules from core, so it was refused whenever billing
    was missing (`requires: ['billing']`).

## Decision

1. **Every part is an npm workspace package.**
   - `packages/modules/<id>` is `@keystone/module-<id>`: its screen, its rules (`src/rules.ts`), its documents, and
     its tests.
   - `packages/connectors/<id>` is `@keystone/connector-<id>`: its connector, its client, any screens it brings, and
     its tests.
2. **The kernel is three packages.**
   - `@keystone/core`: shared rules and types (money, dates, the saved state, the directory, contracts).
   - `@keystone/ui`: the design system.
   - `@keystone/kit`: the app runtime, moved out of the app (registries, store, connector runtime, shell, building
     blocks).
3. **Dependencies are declared and checked.**
   - A part may list only `core`, `ui` and `kit` from Keystone; `kit` only `core` and `ui`; `core` and `ui` nothing.
   - Every import must be declared in the importing package's manifest, other packages are imported by name only,
     and no relative import leaves its package.
   - `scripts/check-boundaries.mjs` enforces this in CI.
4. **Parts that need each other's behaviour use a named service.**
   - The contract lives in core (`SERVICES`, `kernel/services.ts`).
   - The provider declares `provides` on its `ModuleDef`; the consumer calls `useModuleApp().service(name)` and must
     work when it gets `undefined`.
   - One provider per service; the registry refuses a second.
   - The first service is `billing.statement-payments`. The website no longer `requires` billing.
5. **The app is only the composition root.** `apps/keystone/src/modules.ts` and `src/connectors.ts` list the
   installed parts; `src/platform/` implements `Platform`; `src-tauri/` is the native side.
6. **Tests live with what they test.** Each package has its own `test/` and `vitest.config.ts`; the root
   `vitest.workspace.ts` runs them all. The architecture's regression suites (removal, contract, services) stay in the
   app, because they need every part.

## Consequences

- **Good:**
  - Removing a part is one line plus one manifest entry, and its rules and tests go with it.
  - A dependency has to be written down before it can be used, and CI rejects the ones that would couple parts.
  - The website screen now works without billing; it just cannot match payments.
  - A part can be read, tested and reviewed alone (`npm test -w @keystone/module-billing`).
- **Costs:**
  - More files per part (`package.json`, `tsconfig.json`, `vitest.config.ts`), and `npm install` after adding one.
    The templates in `packages/modules/README.md` and `packages/connectors/README.md` keep this mechanical.
  - Service contracts live in core, so a new service touches the kernel. That is the price of neither side importing
    the other, and it gets an ADR.
  - The sample data is copied into core by `npm run sync`, so core needs no file outside its folder; CI checks the
    copy is current.
- **Not changed:** parts are still compiled in (T2), and the saved state keeps the prototype's schema (ADR 0003).
