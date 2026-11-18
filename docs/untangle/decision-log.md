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

# Keystone untangle, round 2: decision log

Branch `refactor/untangle-2`, local commits on top of `main` (fcc9641). Nothing pushed. The owner was away and said to
finish without him, so every choice that was his is listed under "Calls made without the owner".
Baseline `npm run check`: 458 tests in 37 files. `cargo test`: 5 passed. The end-to-end suites could not run here; CI
runs them.

## Fixes

- **Root fix 7, the rest: a screen gets capabilities, not the store** (step 1)
  - `packages/kit/src/context.tsx:67-75`: `run` returned no state; `Outcome` now carries the state after the rule.
  - `packages/kit/src/context.tsx:62-78`: `useKeystone()` handed out `store` and `platform`; it now gives `files`, `photos`, `backup`, `kind` and (signed in) `accounts`. The kit's own shell reads the store through `useRuntime`, which the package index does not export.
  - `vouchers/src/index.tsx:72,163`, `billing/src/index.tsx:61`, `funds/src/index.tsx:114,127,133`, `id-maker/src/index.tsx:38`, `company/src/index.tsx:20`: the eight `store.getState()` call sites read the returned state.
  - `packages/kit/src/store.ts:63-65`: `renamed()` removed; the kit's `accounts.rename` moves `ctx.who` itself, so the caller no longer has to remember the second call.
  - `packages/kit/src/output.ts:17`: `savePdf` took the whole `Platform`; it takes `files`.
  - Tests added: `packages/kit/test/capabilities.test.tsx` (what a screen is given, `run`'s state, restore drops drafts, a refused rename leaves the name).
  - Test edited: `packages/kit/test/runtime.test.ts` "tells listeners about a change…" expects the state in the outcome.
- **Root fix 6: stop swallowing at the platform edge** (step 2; docs/adr/0031)
  - `apps/keystone/src/platform/desktop.ts:48-54`: `readText` turned every failure into null. It asks the new native `file_exists` first: no file is null, a file that cannot be read throws the sentence the start screen shows.
  - `packages/kit/src/store.ts:36-40`: a damaged saved state opened empty without a word; `store.loadError` now holds a sentence the rail shows until the first save replaces the file.
  - `packages/core/src/kernel/connectors.ts:152`: a failed installer fetch was dropped; its reason is now in the sentence that says the download page is open.
  - `packages/kit/src/context.tsx:169`: the update check's rejection was discarded with `() => {}`; it is written to the console.
  - `packages/kit/src/context.tsx:109` vs `apps/keystone/src-tauri/src/lib.rs:206`: 15 s on the page, 20 s natively. One definition, `packages/core/src/kernel/deadlines.json` (core's `DEADLINES`), read by both.
  - `packages/kit/src/context.tsx:126-134` vs `lib.rs:219-248`: the native download had no limit and could open an installer after the page gave up. It now stops 30 s before the page's 20 minutes and refuses to open past that.
  - `packages/kit/src/Shell.tsx:77`: the rail read `store.saveError` only when something else re-rendered it, so a failed save showed at the next change. It now subscribes to both notices.
  - Tests added: `apps/keystone/src/test/desktop.test.ts` (6), `packages/kit/test/rail-notices.test.tsx` (3), two store tests, two core tests, two cargo tests (`a_missing_file_is_told_from_one_that_is_there`, `the_native_limits_are_the_pages_and_a_download_gives_up_first`).
  - Tests edited: `packages/connectors/id-maker-app/test/id-maker-app.test.ts` "opens the download page when the installer cannot be fetched" now expects the reason; `packages/kit/test/shortcut.test.tsx` "a failed update check…" expects the console line.

## Not done this round

- **`KeystoneStore.replaceAll`** (`packages/kit/src/store.ts`): kept as a store method. It resets the drafts, which are private to the store; no screen reaches it any more (Data calls `backup.restore`).
- **Two overlapping contexts** (`useKeystone` and `useModuleApp` both return `state`, `ctx`, `go`): left. `ModuleApp` is also what contributions outside React receive (`create.run`, `openWaiting`), so it cannot simply lose them.
- **Other swallowed errors** (photos that cannot be read, a full `localStorage`, `deleteUser` after a refused member write, an unreadable pending note, `cpu_arch`): left as they were; root fix 6 named the state, the installer and the deadlines.

## Calls made without the owner

- **A start that cannot read `state.json` now stops** (step 2, docs/adr/0031). Before: it opened with no records and the first save replaced the unreadable file. Now: the "could not open" screen with the reason and Try again. This is the one intended change of behaviour this round. A computer in that state does not open Keystone until the file can be read, moved or removed by hand. To undo: revert the step 2 commit.
- **A damaged saved state says so in the rail** (step 2). It still opens with no records and still leaves the file alone until the first change; only the sentence is new: "Keystone could not open its saved records: they are damaged. It started with none, and keeps the damaged records as they are until you change something." The wording is mine.
- **A failed installer fetch says why** (step 2). New sentence: "<App> is not on this computer and its installer could not be fetched (<reason>), so its download page is open." The plain sentence stays when there was nothing to fetch.
- **The native question to GitHub has 15 seconds, not 20; a native download stops at 19 min 30 s** (step 2). The page already gave up at 15 s and 20 min; the native side now reads the same file and gives up first.
- **A new native command, `file_exists`** (step 2). The alternative was reading the operating system's error text in TypeScript.
- **The rail shows a failed save when it fails** (step 2). Strictly a bug fix riding in a `refactor:` commit so that no release is cut while the owner is away; the release notes will not mention it.
