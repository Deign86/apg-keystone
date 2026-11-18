# Keystone untangle, round 1: decision log

Branch `refactor/untangle` in `/home/claude/apg-keystone`, seven commits on top of `main` (5ebdfdc), merged as pull request #65 (fcc9641).
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

Branch `refactor/untangle-2`, fourteen commits on top of `main` (fcc9641), merged as pull request #66 (76a1fd6). The owner was away
and said to finish without him, so every choice that was his is listed under "Calls made without the owner".
Baseline `npm run check`: 458 tests in 37 files. End: 519 tests in 45 files and 17 snapshots, exit 0. `cargo test`:
7 passed (was 5). `firestore.rules` and everything under `e2e/` are byte-identical to `main`; no dependency was added.
The end-to-end suites could not run here; CI runs them.

## Fixes

- **Root fix 7, the rest: a screen gets capabilities, not the store** (420f8ce)
  - `packages/kit/src/context.tsx:67-75`: `run` returned no state; `Outcome` now carries the state after the rule.
  - `packages/kit/src/context.tsx:62-78`: `useKeystone()` handed out `store` and `platform`; it now gives `files`, `photos`, `backup`, `kind` and (signed in) `accounts`. The kit's own shell reads the store through `useRuntime`, which the package index does not export.
  - `vouchers/src/index.tsx:72,163`, `billing/src/index.tsx:61`, `funds/src/index.tsx:114,127,133`, `id-maker/src/index.tsx:38`, `company/src/index.tsx:20`: the eight `store.getState()` call sites read the returned state.
  - `packages/kit/src/store.ts:63-65`: `renamed()` removed; the kit's `accounts.rename` moves `ctx.who` itself, so the caller no longer has to remember the second call.
  - `packages/kit/src/output.ts:17`: `savePdf` took the whole `Platform`; it takes `files`.
  - Tests added: `packages/kit/test/capabilities.test.tsx` (what a screen is given, `run`'s state, restore drops drafts, a refused rename leaves the name).
  - Test edited: `packages/kit/test/runtime.test.ts` "tells listeners about a change…" expects the state in the outcome.
- **Root fix 6: stop swallowing at the platform edge** (b2fc1d2; docs/adr/0031)
  - `apps/keystone/src/platform/desktop.ts:48-54`: `readText` turned every failure into null. It asks the new native `file_exists` first: no file is null, a file that cannot be read throws the sentence the start screen shows.
  - `packages/kit/src/store.ts:36-40`: a damaged saved state opened empty without a word; `store.loadError` now holds a sentence the rail shows until the first save replaces the file.
  - `packages/core/src/kernel/connectors.ts:152`: a failed installer fetch was dropped; its reason is now in the sentence that says the download page is open.
  - `packages/kit/src/context.tsx:169`: the update check's rejection was discarded with `() => {}`; it is written to the console.
  - `packages/kit/src/context.tsx:109` vs `apps/keystone/src-tauri/src/lib.rs:206`: 15 s on the page, 20 s natively. One definition, `packages/core/src/kernel/deadlines.json` (core's `DEADLINES`), read by both.
  - `packages/kit/src/context.tsx:126-134` vs `lib.rs:219-248`: the native download had no limit and could open an installer after the page gave up. It now stops 30 s before the page's 20 minutes and refuses to open past that.
  - `packages/kit/src/Shell.tsx:77`: the rail read `store.saveError` only when something else re-rendered it, so a failed save showed at the next change. It now subscribes to both notices.
  - Tests added: `apps/keystone/src/test/desktop.test.ts` (6), `packages/kit/test/rail-notices.test.tsx` (3), two store tests, two core tests, two cargo tests (`a_missing_file_is_told_from_one_that_is_there`, `the_native_limits_are_the_pages_and_a_download_gives_up_first`).
  - Tests edited: `packages/connectors/id-maker-app/test/id-maker-app.test.ts` "opens the download page when the installer cannot be fetched" now expects the reason; `packages/kit/test/shortcut.test.tsx` "a failed update check…" expects the console line.
- **Root fix 4: a module owns its identity and its references** (1d1756e, d1ad800, 2b1c7b8; docs/adr/0032)
  - `funds/src/rules.ts:14` vs `funds/src/index.tsx:256` (and `banks`, `timekeeping`, `payroll`): `MODULE` and `id` were two literals. One `ID` per module now feeds `ModuleDef.id`, the `ext` key, the draft key and its own `go` calls. Values unchanged.
  - `vouchers/src/index.tsx:12,272,284,286`, `billing/src/index.tsx:8,155,169,171`, `funds/src/index.tsx:256,271,273`, `id-maker/src/index.tsx:146,160,162`: draft key, id and `go` repeated one id.
  - `vouchers/src/rules.ts:151` (and `billing`, `id-maker`): the log tag as a literal in every `logged(...)` and again in `logTags`; one `TAG`. `funds/src/index.tsx:274` uses the `TAG` it already exported. Core exports `DIRECTORY_TAG`.
  - `packages/kit/src/registry.ts:33`: `ModuleDef.section`, required and read by nothing: dropped.
  - `packages/core/src/kernel/schema.ts:53-73`: the status lists and tone table of three modules: moved to vouchers, billing and id-maker (`voucherTone`, `statementTone`, `idTone`).
  - `packages/core/src/kernel/insight.ts:30`: `WaitingItem.status` typed as core's `Status`: now text.
  - `packages/core/src/kernel/schema.ts:14`, `directory.ts:99`: `USED_IN` held three screens' titles: replaced by `ModuleDef.selects`, collected by the Directory. Same sentences with the same modules installed.
  - `packages/core/src/kernel/directory.ts:19-29`: `usedBy` hardcoded `cv`, `bs`, `ids`: replaced by `ModuleDef.refersTo`, contributed by six modules.
  - Tests added: statuses and tones in three modules; the directory message and references in core; in `contract.test.ts`, references against data written as earlier builds saved it (which also pins the `ext` keys), the old answers for the sample, the `selects` words, and that a module's reference tag is one of its log tags.
  - Tests edited: `packages/core/test/kernel.test.ts` and `packages/modules/id-maker/test/rules.test.ts` pass the references `usedBy` and `removeDirectoryRecord` now take; four `ModuleDef` literals lost `section`.
- **Root fix 2: accounts leave `Platform`; attendance admin is a contribution** (c1b120f; docs/adr/0033)
  - `packages/kit/src/platform.ts:16,45-49,58-87`: `Platform` carried `AppAccounts`, `MemberAccount`, `NewAccount`. They are core's now (`kernel/accounts.ts`, `Accounts` in `services.ts`); the platform offers the service under `Platform.provides`.
  - `packages/kit/src/platform.ts:47-48,82-86`: `attendanceAdmin` and `setAttendanceAdmin` in the kernel contract: replaced by `MemberAccount.grants` and `Accounts.setGrant(uid, field, on)`.
  - `packages/modules/accounts/src/rules.ts:114-150`, `index.tsx:184-190`: the module held the attendance tracker's wording and menu. The attendance connector contributes them (`Connector.memberGrant`); removing the connector removes the menu item.
  - `accounts/src/rules.ts:20`, `funds/src/rules.ts:186`, `vouchers/src/rules.ts:101`, `company/src/rules.ts:25`, `platform/cloud.ts:61`, `platform/firestore.ts:343`: six copies of the owner test: core's `isOwner`.
  - `platform/firestore.ts:31-33,254`: `ONLY_OWNER`, `ONLY_OWNER_REMOVES`, `ONLY_OWNER_ATTENDANCE` and the own-account sentence were copies of the accounts module's: both read core's.
  - `platform/firestore.ts:115`: accounts depended on `member()` having set a flag: `cloud.accounts(who)` is built for the member it is given. (`read()` still uses the flag.)
  - `packages/kit/src/context.tsx`: step 1's interim `useKeystone().accounts` is gone; screens ask `useModuleApp().service(SERVICES.accounts)`.
  - The Firestore field `attendanceAdmin`, the member path and `firestore.rules` are unchanged (`git diff main -- firestore.rules` is empty).
  - Tests added: `apps/keystone/src/test/accounts.test.tsx` (the shipped module, connector and grant guard together, in the e2e's words), the attendance connector's grant, registry refusals for a grant field, the platform service lookup in the kit.
  - Tests edited: `packages/modules/accounts/test/rules.test.ts` and `screen.test.tsx` (same sentences, through a stand-in grant; `setGrant('hr-1', 'attendanceAdmin', true)` where it was `setAttendanceAdmin('hr-1', true)`; `grants: ['attendanceAdmin']` where it was `attendanceAdmin: true`), `packages/modules/profile/test/screen.test.tsx` and `packages/kit/test/capabilities.test.tsx` (the service instead of `Platform.accounts`), `apps/keystone/src/test/contract.test.ts` "every published service has a provider" (the platform's one is named).
- **Root fix 5: the kit's document blocks, one paper at a time** (6c032a3, d33bd77, cbb5d51, c2e2410; docs/adr/0034)
  - Baseline first: `packages/modules/{vouchers,billing,funds,payroll}/test/paper.test.tsx` snapshot each paper's markup (class names, inline styles, data attributes) and what printing does to it (the `@page` rule, the print root, the copies' sizes, a long sheet's zoom). Every later commit of this step leaves all 17 snapshots identical.
  - `packages/kit/src/documents.tsx:13,16` vs `output.ts:7,41` vs `packages/ui/src/styles.css:160`: 12, 186, 273, 210 and 148.5 mm typed three times. One constant (`packages/kit/src/paper.ts`), and a kit test that holds the stylesheet's `@page` rule to it.
  - `packages/kit/src/documents.tsx:99-100` vs `output.ts:10,18,62,84,89` vs `styles.css:136-155`: the data-attribute strings. Named once (`MARKS`); a kit test holds the stylesheet to the three it uses.
  - **Check voucher.** `documents.tsx:85-87,107` and `output.ts:68-75,98-102` (`fit === 'halves'`, `Copy`, `fitToHalves`): a `TwoUp` sheet and one `TWO_UP` layout definition. `documents.tsx:147-152,160` (`logo="companies"`, `beside`): a `Masthead` the voucher composes itself; the Group of Companies logo is imported by the vouchers module, not the kit.
  - **Payroll sheet.** `documents.tsx:86,100` and `output.ts:40-59,91-96` (`fit="page"`, landscape, `fitToPage`): a `LandscapePage` sheet and one `LANDSCAPE_PAGE` layout definition. `output.ts:79-81` no longer names "the payroll sheet" or "a check voucher".
  - **Billing statement, fund transfer request, payslip.** They use the plain `Sheet`, which lost its `fit` and `orientation` props; their files did not change and their snapshots are identical.
  - Tests edited: `packages/kit/test/documents.test.tsx` renders `TwoUp` and `LandscapePage` where it passed `fit` and `orientation` to `Sheet`; "keeps a two-up sheet upright" deleted (it passed an orientation a two-up sheet can no longer be given; its claim moved into the test above it); the plain sheet is now expected to carry no print mark.
- **Stale documents** (41c0812)
  - `AGENTS.md` cloud end-to-end row: "the first computer moving its records in" (removed by docs/adr/0018); and "the three connectors".
  - `README.md:18`, `docs/ARCHITECTURE.md:17,68-69`: three connectors listed, four installed; a missing app said to get only its download page; ARCHITECTURE's module list short by four and its native side credited with an OS keychain.
  - `packages/modules/README.md:23`: a `website` screen that settles statements; no such screen exists. Profile missing from its table.
  - `README.md:25`: `ATTENDANCE-INTEGRATION.md` called "one open decision"; its own first lines say withdrawn.
- **Comments** (ae344ab)
  - `packages/kit/src/platform.ts:3-7`: said modules and connectors talk only to the `Platform`. `packages/kit/src/store.ts`: the `Outcome` comment had been parted from `Outcome`, and the class comment said screens read the store. The other comments in files this round touched were read and kept.
- **Tests** (1282ed8)
  - `packages/core/test/kernel.test.ts`: deleted "gives an app 15 seconds to answer and a download 20 minutes", added in b2fc1d2; it compared `DEADLINES` with a copy of its own file.
  - `packages/kit/test/documents.test.tsx`: the page and pixel sizes typed again beside the stylesheet check, added in d33bd77; the sheet tests already expect them.

## Not done this round

- **`KeystoneStore.replaceAll`** (`packages/kit/src/store.ts`): kept as a store method. It resets the drafts, which are private to the store; no screen reaches it any more (Data calls `backup.restore`).
- **Two overlapping contexts** (`useKeystone` and `useModuleApp` both return `state`, `ctx`, `go`): left. `ModuleApp` is also what contributions outside React receive (`create.run`, `openWaiting`), so it cannot simply lose them.
- **Other swallowed errors** (photos that cannot be read, a full `localStorage`, `deleteUser` after a refused member write, an unreadable pending note, `cpu_arch`): left as they were; root fix 6 named the state, the installer and the deadlines.
- **Other modules' ids as literals** (`funds/src/index.tsx:157` vouchers, `billing/src/index.tsx:26` banks, `overview` activity, `payroll` and `timekeeping` directory, `profile` accounts): left. A module cannot import another's `ID`; each jump is guarded by `app.has`.
- **`Voucher`, `Statement`, `IDRecord` in core** (trade-off T1): still there, with `status` as text. Moving the types out is ADR 0003's format bump.
- **Priorities, ranks and rail order as bare numbers**: untouched.
- **The four fake `Platform` copies** (`packages/kit/test/fakes.ts`, and in `profile`, `accounts`, `billing` tests): still four. They no longer change with accounts, which was the churn; a part still cannot import the kit's test helper.
- **"Enter the email …" worded twice** (`platform/firestore.ts` for a reset link, `accounts/src/rules.ts` for a new account): left; they are two different sentences for two different forms.
- **`firestore.ts` `read()` and the `owner` flag** (`platform/firestore.ts:141`): unchanged; it has no unit test and the cloud suite cannot run here.
- **The voucher's own ruling** (`vouchers/src/VoucherPaper.tsx:13-21,56-100` draws its boxes, line table, total band and signature blocks instead of the kit's `Meta`, `Lines`, `Signatures`): left. Moving it onto the kit's blocks changes the voucher's markup, and this round's rule for papers was an identical snapshot.
- **`savePdf`** (`packages/kit/src/output.ts`): reads the layout like `printElement`, but no test draws a PDF here (it needs a real canvas); the cloud and module end-to-end suites export one.
- **The ID card sheet** (`id-maker/src/IDCard.tsx`): it does not use the kit's `Sheet`; untouched.
- **Kept, as round 1 left them, decided conservatively** (step 6): the `billing.statement-payments` service (docs/adr/0007 keeps it); reading and showing `DirectoryRecord.links` and `Connector.tag`; the mobile icons and `mobile_entry_point`; `docs/ATTENDANCE-INTEGRATION.md`; `scripts/brand/derive-companies-logo.py`.
- **Root fix 1, the rest; root fix 3, the rest** (the company id `apg`, the marker, member field names in `e2e/cloud`; command names, struct twins, `aarch64`/`arm64`, the user-agent guess): not in this round's list. One more command name (`file_exists`) now exists on both sides.

## Calls made without the owner

- **A start that cannot read `state.json` now stops** (step 2, docs/adr/0031). Before: it opened with no records and the first save replaced the unreadable file. Now: the "could not open" screen with the reason and Try again. This is the one intended change of behaviour this round. A computer in that state does not open Keystone until the file can be read, moved or removed by hand. To undo: revert the step 2 commit.
- **A damaged saved state says so in the rail** (step 2). It still opens with no records and still leaves the file alone until the first change; only the sentence is new: "Keystone could not open its saved records: they are damaged. It started with none, and keeps the damaged records as they are until you change something." The wording is mine.
- **A failed installer fetch says why** (step 2). New sentence: "<App> is not on this computer and its installer could not be fetched (<reason>), so its download page is open." The plain sentence stays when there was nothing to fetch.
- **The native question to GitHub has 15 seconds, not 20; a native download stops at 19 min 30 s** (step 2). The page already gave up at 15 s and 20 min; the native side now reads the same file. Only the download gives up first (30 s sooner). For the question to GitHub both sides have 15 s and the page's clock starts earlier, so the page's "did not answer within 15 seconds" still wins, as it did when the native side had 20 (review item m4; this line said "and gives up first" of both).
- **A new native command, `file_exists`** (step 2). The alternative was reading the operating system's error text in TypeScript.
- **The rail shows a failed save when it fails** (step 2). Strictly a bug fix riding in a `refactor:` commit so that no release is cut while the owner is away; the release notes will not mention it.
- **Directory records named by funds, payroll or timekeeping can no longer be removed** (step 3, docs/adr/0032). Before: only vouchers, statements and IDs protected a record. Now a request for funds paid by check protects its payee, and a pay setup, a closed cut-off or a recorded day protects its employee; the row shows `RF`, `PAY` or `DTR` under "Used by" and Remove is disabled. Tested in `apps/keystone/src/test/contract.test.ts`. To undo for one module: delete its `refersTo` line.
- **In the cloud, that protection differs with who is looking** (step 3; review item m1). A staff member reads only their own requests for funds (`firestore.rules`), so their Directory shows no `RF` on a vendor that only someone else's request names, and their Remove goes through, while the CEO's Keystone, which reads every request, keeps the same record. Nothing breaks when that happens: approving the request then says the payee is "no longer in the directory, so no voucher was drafted" (`funds/src/rules.ts`). Closing it means a rule in `firestore.rules` or a count kept outside the requests, both the owner's to decide.
- **A request for funds protects its payee whatever became of it** (step 3; review item m2). A declined or withdrawn check request still keeps its payee, and requests are never deleted, so there is no way to release one. That is the rule vouchers and statements already had: a void voucher and a void statement keep their payee and client too (`s.cv`, `s.bs` are read whatever the status), as core's own list did before round 2. Round 3 left funds the same so the three agree; releasing a record on Void or Declined would be one change to all three, and the owner's.
- **Protection follows the installed modules, not the saved data alone** (step 3). A build with a module taken out would no longer protect records only that module's data names. No shipped build takes one out; "Coming soon" screens stay installed.
- **`ModuleDef.section` dropped, not rendered** (step 3). Rendering the eyebrow from it would have moved fifteen screens' headers; dropping it leaves the eyebrow in one place, the screen. No pixel changes.
- **`Voucher.status`, `Statement.status`, `IDRecord.status` are plain text in core's types** (step 3). The words saved are the same; the lists and tones are in the vouchers, billing and ID maker modules.
- **"Attendance admin" belongs to the attendance connector** (step 4, docs/adr/0033). Same field (`attendanceAdmin`), same rules file, same words on screen. New: a Keystone built without the attendance connector offers no such menu item and does not show who has it.
- **`setGrant` refuses any field no connector contributed** (step 4). The alternative, a platform that writes whatever field it is handed, would let a part write `role`.
- **The accounts service is found after the modules' services** (step 4). The registry cannot check "one provider" against the platform; a contract test holds that no module offers `accounts`.
- **The service is named `platform.accounts`** (step 4). The name is only a key in memory; nothing saved holds it.
- **The Group of Companies logo is imported by the vouchers module** (step 5). It was the kit's import for a `Letterhead` variant only the voucher used. Same file, same `<img>`.
- **`Sheet fit="page"` upright is gone** (step 5). No paper used it without `orientation="landscape"`; the one-page fit now comes only with `LandscapePage`.
- **The five leftovers stay** (step 6): the unused `billing.statement-payments` service, `links` and `tag`, the mobile icons and entry point, the withdrawn attendance document and the brand script. Deleting any of them is still the owner's to say.
- **`KeystoneStore.replaceAll` stays a store method** (step 1). The instruction was to remove the one-caller store methods; `renamed` is gone, but `replaceAll` clears the drafts, which only the store holds. No screen can reach it now.
- **Three new ADRs and one more were written without review**: 0031 (the start stops), 0032 (ids, statuses, references), 0033 (accounts as a service), 0034 (sheet layouts). Each is marked Accepted because the code is as it says; the owner may want any of them reworded or reversed.
- **Every commit is `refactor:`, `test:`, `docs:` or `chore:`**, so merging this branch publishes no release, although b2fc1d2 and 2b1c7b8 change what a person sees. If the owner wants those in the release notes, the merge needs a `fix:` or `feat:` subject of his choosing.

# Keystone untangle, round 3: decision log

Branch `refactor/untangle-3`, local commits on top of `main` (76a1fd6). Not pushed when this was written. It answers
the independent review of round 2 (one MAJOR, seven MINOR, and its list of structural items safe without the owner).
Baseline `npm run check`: 519 tests in 45 files. End: 526 tests in 47 files and 20 snapshots, exit 0. `cargo test`:
10 passed (was 7), run once. `firestore.rules`, everything under `e2e/` and `package-lock.json` are byte-identical to
`main`; no dependency was added. The end-to-end suites could not run here; CI runs them.

## Fixes

- **The Directory asks each module once which records it names** (f286994; review M1, Part 2 item 1)
  - `packages/core/src/kernel/directory.ts`: `Reference.record(state, code)` was asked for every row, three times a render, and funds, payroll and timekeeping each decoded all they had saved to answer. A reference now answers `codes(state)`; `usedByCode` builds code to tags from one call per module, and `usedBy` and `removeDirectoryRecord` read it. Same tags, same order, same Remove rule.
  - `packages/modules/directory/src/index.tsx`: the map is kept for a state (`useMemo`); rows and the Remove action read it.
  - The six `refersTo` contributions (vouchers, billing, id-maker, funds, payroll, timekeeping) return the codes they compared before.
  - Test added: `packages/modules/directory/test/screen.test.tsx` counts the calls (at most StrictMode's two on the first render of 71 rows, none on a search keystroke or a filter; with rows asking again it fails at 428), and holds the tags and the Remove rule on screen.
  - Tests edited: `packages/core/test/kernel.test.ts`, `apps/keystone/src/test/contract.test.ts` build stand-in references with `codes`; expectations unchanged.
- **A timed-out native download says "took too long" and leaves no `.part` file** (2ab4d7d; review m3, Part 2 item 12)
  - `apps/keystone/src-tauri/src/lib.rs`: the download is `fetch`, apart from opening the file. A timeout from the request reads as the sentence the late check already used; every way out of the loop removes the partial file. A dropped line still says "stopped".
  - Cargo tests added: `a_download_that_runs_out_of_time_says_so_and_leaves_no_partial_file`, `a_download_in_time_is_saved_under_its_name`, against a local listener.
- **Five things said once** (d42c657; Part 2 items 2, 7, 8, 9, 10)
  - Item 2: `memberGrants(connectors)` in the kit; `main.tsx:33` and `accounts/src/index.tsx:108` call it.
  - Item 7: core's `sentenceOf`; fifteen copies of `e instanceof Error ? e.message : String(e)` call it (the commit message counts fourteen). The three with their own fallback sentence (`data/src/index.tsx:30`, `kit/src/context.tsx:238,275`) are left, and so is `id-maker/src/index.tsx:103` (`String(e)`).
  - Item 8: `deadlines.json` gains `connectSeconds` and `updateCheckSeconds`; `lib.rs` and `desktop.ts` read them. Same 15 s and 10 s. `GIVES_UP_EARLY` (30 s) stays in `lib.rs`: only the native side uses it.
  - Item 9: `apps/keystone/src-tauri/src/commands.json`; `desktop.ts` asks by its names; `desktop.test.ts` and the cargo test `the_commands_the_page_names_are_the_ones_registered` hold it to `generate_handler!`.
  - Item 10: core's `MEMBER_FIELD` in `platform/firestore.ts`. `e2e/cloud` still spells the three names, by instruction.
- **The ID card sheet has a snapshot** (ade7e58; Part 2 item 4, the first half)
  - `packages/modules/id-maker/test/paper.test.tsx`: its markup on screen, at the printer, and blank, recorded from what it does today. `IDCard.tsx` is untouched.
- **One fake `Platform` for the parts' tests** (235484e; Part 2 item 3)
  - `packages/kit/testing/index.ts`, exported as `@keystone/kit/testing`; billing, profile, accounts and directory tests use it. `check:boundaries` lets only a test import it. No new edge between parts.
- **This log** (review m1, m2, m4, m7): the two headers that said "Nothing pushed"; under "Calls made without the owner", the protection that differs per viewer, the request that protects for good, and the corrected sentence about who gives up first.

## Not done this round

- **m2, a declined or withdrawn request releasing its payee**: left on purpose. Vouchers and statements protect whatever the status, void included, so funds already follows the existing rule (see "Calls made without the owner").
- **Part 2 item 5, a test for `savePdf`**: not added. As asked it stubs `html-to-image` and `jspdf`, and the repo's lint refuses module mocking (`anti-slop/no-module-mocking`, an error; AGENTS.md: fix a finding, do not silence it). The lint's own answer is to hand `savePdf` its two drawing tools as an optional parameter, a change to `packages/kit/src/output.ts`; this item was to be tests only. A test written that way (margin, orientation and style for the three layouts) passed and is not committed. Owner decides: the parameter, or an exception to the rule for this one test.
- **Part 2 item 4, the second half** (the ID card reading its sizes from `paper.ts`): not done; the geometry was not to change.
- **Part 2 items 6 and 11** (rail order from the list; the two overlapping contexts): out of scope by instruction.
- **m5** (five tags in a 100 px column) and **m6** (an unknown status reads neutral): seen, not changed; neither was in this round's list.
- **`firestore.ts` `read()` and the `owner` flag**, the five leftovers, `firestore.rules`, `e2e/`: untouched.

## Calls made in round 3

- **`Reference.record` became `Reference.codes`** (f286994). A change to a kernel contract that six modules implement, made to fix M1 at its cause, not only memoised over. docs/adr/0032 and docs/MODULARITY.md say so. To undo: revert the commit.
- **Any error from the download loop now removes the partial file**, not only a timeout (2ab4d7d). Before, a dropped line left it too.
- **A timeout while waiting for GitHub's first answer** also reads "took too long", but only when the whole limit has passed; a connect timeout still reads "Could not reach GitHub" (2ab4d7d).
- **The kit's `package.json` has an `exports` field** (235484e): `.` and `./testing`. Nothing imported any other path into the kit. The app's production build was not run here.
- **`cargo test` ran once**, on `lib.rs` as d42c657 has it; 2ab4d7d on its own was not compiled.

