# Keystone untangle, round 1: decision log

Branch `refactor/untangle` in `/home/claude/apg-keystone`, seven local commits on top of `main` (5ebdfdc). Nothing pushed.
Baseline `npm run check`: 441 tests in 36 files. End: 458 tests in 37 files, exit 0. `cargo test`: 5 passed (was 4).
The end-to-end suites could not run here; CI runs them.

## Fixes

- **Root fix 8a: remove the extension points nothing uses** (92c2588)
  - `packages/kit/src/registry.ts:42-43,131-145`: `ModuleDef.requires` and its fixed-point loop, set by no module. AGENTS.md rule 6 reworded.
  - `packages/kit/src/registry.ts:75-78,108`: `ConnectorPlugin` and `.modules`; `buildRegistry` takes `Connector[]`, `apps/keystone/src/connectors.ts` exports `connectors`.
  - `packages/connectors/*/package.json`: the `@keystone/kit` dependency no connector uses any more (and `package-lock.json`).
  - Tests deleted (asserted a deleted thing): registry "leaves out a module whose requirement is missing, and anything that needed it"; registry "a refused connector takes its screens with it".
  - Tests rewritten: registry ordering and refusal tests; "does not offer the services of a module that was left out".
- **Root fix 8b: delete dead exports, unused parameters, aliases, stale comments** (3525455)
  - `packages/core/src/kernel/money.ts:37`: `editText`, called only by its test (test deleted with it).
  - `packages/core/src/kernel/documents.ts:15`: type `Collection`, used nowhere.
  - `packages/core/src/kernel/connectors.ts:115`, `dates.ts:40`, `insight.ts:36`: `installerFor`, `monthKey`, `IDLE_FINDING` no longer exported.
  - `packages/kit/src/context.tsx:67`: `quiet` on `run`, passed by no caller.
  - `packages/kit/src/documents.tsx:210,217,256`: `header` of `amountColumn`, `rows` of `Lines`, `className` of `Signatures`, passed by no caller.
  - `packages/kit/src/index.ts:6,15`: `Shell`, `KeystoneProvider`, `useOpenConnector`, `useConnectorUpdate` leave the public index.
  - `packages/modules/*/src/rules.ts`, `payroll/src/pay.ts`, `kit/src/Session.tsx`, `ui/src/overlays.tsx`, `connectors/website`, `platform/firestore.ts`: 21 values used only in their own file no longer exported.
  - `apps/keystone/src/platform/session.ts:14`: alias `UseLog` (now `StoredText`); `platform/index.ts:4`: re-export of `Platform`.
  - `packages/kit/src/registry.ts:25,83,91`: comments about Settings, Connections, health checks.
  - `firestore.rules:133`: "moving the records in" removed from the comment (the only change to the file).
- **Root fix 3: one description of a connected desktop app** (7128ce3)
  - `packages/connectors/{attendance,branding-studio,id-maker-app}/src/index.ts:21`: `downloads` typed beside `repo`; now derived in core.
  - `packages/core/src/kernel/connectors.ts:95,97`: `repo` and `installers` optional though always set; now required, the dead guards at `:127,167` removed.
  - `packages/core/src/kernel/connectors.ts:99`: `updatesItself` deciding what the presence of `Connector.update` decides; removed.
  - `apps/keystone/src-tauri/src/lib.rs:123`: owner `Deign86` against each connector's `repo`: `connected-apps.json` + `connected-apps.test.ts` (npm run check) + `every_connected_app_is_allowed` (cargo test).
  - `apps/keystone/src-tauri/src/lib.rs:124`: `INSTALLER_TYPES` against each connector's installer patterns: the same check.
- **Root fix 1, as a check only: one declared cloud layout** (e95f45e)
  - `firestore.rules:158-160` vs `core/src/kernel/documents.ts:10`: the list of collections; declared in `cloud-layout.json`, compared by `scripts/check-cloud-layout.mjs`.
  - `documents.ts:10` vs `firestore.rules:126-131`: `company` apart from the generic list, now declared apart.
  - `documents.ts:13` vs `firestore.rules:128`: document id `details`.
  - `funds/src/rules.ts:98` vs `firestore.rules:66-71`: `rf` and its checked fields (contract test + funds test + script).
  - `funds/src/rules.ts:17` vs `firestore.rules:69`: the request statuses.
  - `kit/src/registry.ts:165`: reserved names `members`, `devices`, `idreg` now refused for a module's own collection.
  - `firestore.rules:58,69`: the 900000 body limit now has a TypeScript counterpart (`CLOUD_LAYOUT.maxBody`), checked.
  - `profile/src/rules.ts:10` vs `firestore.rules:104,112`: `MAX_NAME` now reads `CLOUD_LAYOUT.maxName`, checked.
- **Root fix 7, the part with unit-test cover** (be8eaf1)
  - `packages/kit/src/context.tsx:134`: `env.system` was the whole `Platform`; a connector now gets a `SystemBridge` built from it.
- **Comments** (6c75d4b)
  - `packages/core/src/kernel/documents.ts:14`, `packages/kit/src/Shell.tsx:173`: two comments that restated the next line. The rest were read and kept.
- **Tests** (f16c616)
  - `packages/modules/banks/test/rules.test.ts:125`: deleted; compared `banksModule` with a copy of its own literal.
  - `packages/modules/company/test/rules.test.ts:79`: deleted; the same for `companyModule`.
  - `packages/kit/test/runtime.test.ts:29`: real 300 ms sleep replaced by fake timers; no longer knows the 250 ms save delay.

## Not done this round

- **Root fixes 2, 4, 5, 6**: out of scope by instruction (owner decisions or print risk).
- **`billing.statement-payments` service** (`core/src/kernel/services.ts:14`): kept. docs/adr/0007 keeps it "for any future part", and removing it leaves billing's `recordPayment` rule and the `Payment` type with no caller but tests. Owner decides: keep, or delete the service, the rule and its tests together.
- **`DirectoryRecord.links` and `Connector.tag`** (`schema.ts:30`, `connectors.ts:77`, `directory/src/index.tsx:93-98`): kept, display included. Builds up to v0.2.x wrote `links` (removed in e7e340b, first released in v0.3.0), so saved records may hold them.
- **`ModuleDef.section`**: kept; it belongs to root fix 4 (drop it or render the eyebrow from it).
- **Browser `launchApp`** (`platform/browser.ts:73`): kept. `SystemBridge` requires the method; a stub that throws is the safe form of unreachable code.
- **Mobile icons, `mobile_entry_point`, `docs/ATTENDANCE-INTEGRATION.md`, `scripts/brand/derive-companies-logo.py`**: not deleted, by instruction or because the script is the only record of how an asset was made. Owner decides.
- **Types exported but imported nowhere** (`Outcome`, `Registry`, `LineColumn`, `AppUpdate`, `PlatformName`, `VoucherRequest`, module draft and data types): kept; each appears in an exported signature. `CODE_PREFIX`, `USED_IN` kept exported (used across two core files). `RowMenu` kept (documented in `packages/ui/README.md`). `REQUEST_STATUSES` kept exported (the layout test reads it).
- **`previewNote`**: the audit was wrong; `funds/src/index.tsx:249` also passes it.
- **Root fix 3, the rest**: command names, struct twins, `aarch64`/`arm64`, the user-agent guess, the 15 s/20 s deadlines are untouched.
- **Root fix 1, the rest**: the company id `apg`, the root `keystone`, the marker, member field names, and the ID Maker's and kiosk's shapes are not in the layout; `e2e/cloud` still spells them.
- **Root fix 7, the rest**: `run` returning the new state, `store`/`platform` leaving `useKeystone`, `renamed()`/`replaceAll()`: the screens they touch are covered only by the end-to-end suites, which cannot run here.
- **Stale docs seen, not fixed**: AGENTS.md's cloud e2e row still says "the first computer moving its records in"; `README.md:18` and `docs/ARCHITECTURE.md:17` list three connectors; `packages/modules/README.md:23` still describes a website screen.
