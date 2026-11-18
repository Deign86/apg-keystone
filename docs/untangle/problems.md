# Keystone: where the code answers "should these change together?" wrongly

Read-only structural audit of `/home/claude/apg-keystone` (136 commits on the branch as checked out). Nothing in the
repo was changed, installed, built or run. Every bullet was checked in the code; paths are relative to the repo root.

**What is clean.** The package import graph has no forbidden edge: no module imports a module or connector, no
connector imports a connector or module, `core` and `ui` import no Keystone package, `kit` imports only `core` and
`ui`, and no relative import leaves a package except the shared `vitest.shared` config. No skipped test
(`.skip`, `xit`, `test.fixme`, `.only`, `.todo`) and no `TODO`/`FIXME`/`@ts-ignore` exists. The problems below are
links the import graph cannot see.

**Co-change evidence (`git log --name-only`, source files only).** The pairs that changed together most often across
packages: `platform/firestore.ts` + `kit/src/platform.ts` (8 commits), `kit/src/platform.ts` + `accounts/src/index.tsx`
(6), `firestore.ts` + `accounts/src/index.tsx` (6), `kit/src/documents.tsx` + `vouchers/src/VoucherPaper.tsx` (6),
`documents.tsx` + `payroll/src/PayrollPapers.tsx` (5), `firestore.rules` + `kit/src/platform.ts` (5),
`firestore.ts` + `firestore.rules` (5). The most-changed kernel files are `kit/src/documents.tsx` (12) and
`kit/src/platform.ts` (10): the "fixed kernel" moves with two features (accounts, papers).

---

## 1. Hidden links (must change together, the code does not show it)

### Firestore: rules, path builders and module declarations

- `firestore.rules:158-160` — the list `['dir','cv','bs','ids','log','ext']` is written three times here and again as `COLLECTIONS` in `packages/core/src/kernel/documents.ts:10`, as literals in `documents.ts:155-158,211`, in `state.ts:75,95,108`, in `backup.ts:21-32` and in the comment at `apps/keystone/src/platform/firestore.ts:21`; a new record list must be added in all of them.
- `packages/core/src/kernel/documents.ts:10` — `COLLECTIONS` includes `company`, but the rules' generic list (`firestore.rules:158`) leaves it out and gives it its own match (`firestore.rules:126-131`), so the two lists differ on purpose with nothing saying so.
- `packages/core/src/kernel/documents.ts:13` — the document id `details` is repeated as a literal in `firestore.rules:128`.
- `packages/modules/funds/src/rules.ts:98` — the collection `rf`, the checked fields `status`, `uid`, `decision` and `readBy: 'uid'` are restated by hand in `firestore.rules:66-71,89-91,135-142`; the registry accepts the declaration (`packages/kit/src/registry.ts:171`) without knowing whether the rules name it.
- `packages/modules/funds/src/rules.ts:17` — `REQUEST_STATUSES` is copied as a string list in `firestore.rules:69` and partly in `firestore.rules:90`.
- `packages/kit/src/registry.ts:165` — a module's own collection is refused only if it collides with `COLLECTIONS`; the names the rules also reserve (`members`, `devices`, `idreg`, `rf` in `firestore.rules:97,108,135,147`) are not in that set.
- `firestore.rules:58` and `:69` — the 900000-character limit on `body` has no counterpart in TypeScript, yet a module's whole `ext` data is one document (`documents.ts:146`), so the limit is something each module has to know.
- `packages/modules/profile/src/rules.ts:10` — `MAX_NAME = 80` is repeated in `firestore.rules:104` (and the same 80 for a device name at `:112`).
- `apps/keystone/src/platform/firestore.ts:25` — the company id `apg` and the root `keystone` (`:111`) are hardcoded again about fifteen times in `e2e/cloud/emulators.ts:72-287` and in the messages at `firestore.ts:30,82`.
- `apps/keystone/src/platform/firestore.ts:169,178` — the marker `{ status: 'ready', by, at }` is repeated in `firestore.rules:63` and `e2e/cloud/emulators.ts:294`.
- `apps/keystone/src/platform/firestore.ts:217-218,236,291,303` — the member document's field names (`role`, `name`, `email`, `attendanceAdmin`) are string literals here, in `firestore.rules:48,102`, and in the `MemberAccount` type (`packages/kit/src/platform.ts:45-49`); the rules' own comment (`firestore.rules:6`) still lists the document without `attendanceAdmin`.
- `firestore.rules:75-86` — the shape of an issued ID is the schema of another repository (the ID Maker), and `firestore.rules:116-124` the attendance kiosk's tables; Keystone has no code for either, only `e2e/cloud/id-register.e2e.ts` and `e2e/cloud/kiosk-backup.e2e.ts` imitate those apps, so three codebases share one file with no shared definition.
- `apps/keystone/src/platform/firestore.ts:115` — the `owner` flag is set only when `member()` runs (`:343`), and `read()` (`:141`) and every `accounts` method (`:228,252,300`) silently depend on `main.tsx:52` having called `member()` first.

### "Is this the CEO?" and the sentences that refuse

- `packages/modules/accounts/src/rules.ts:20` — the test `ctx.who?.role === 'owner'` is written separately in `funds/src/rules.ts:186`, `vouchers/src/rules.ts:101`, `company/src/rules.ts:25` and `apps/keystone/src/platform/cloud.ts:61`, again as a flag in `firestore.ts:343`, and again in `firestore.rules:46-49`.
- `apps/keystone/src/platform/firestore.ts:31-33` — `ONLY_OWNER`, `ONLY_OWNER_REMOVES` and `ONLY_OWNER_ATTENDANCE` are word-for-word copies of `packages/modules/accounts/src/rules.ts:16,17,116`.
- `apps/keystone/src/platform/firestore.ts:254` — "You cannot remove your own account." is a copy of `packages/modules/accounts/src/rules.ts:86`, and the same own-account check runs in both places.
- `apps/keystone/src/platform/firestore.ts:35` — the "Enter the email … like ana.cruz@alphapremiergroup.com" sentence exists a second time, worded slightly differently, at `packages/modules/accounts/src/rules.ts:58`.
- `packages/kit/src/Shell.tsx:75` — the "where the records are kept" sentence is decided a second time in `packages/modules/data/src/index.tsx:38`, which has no cloud branch and so says "Saved on this computer" in a signed-in build.
- `packages/core/src/kernel/insight.ts:36` — `IDLE_FINDING` ("Nothing is waiting on you.") is typed again as a literal at `packages/modules/overview/src/index.tsx:40`.

### TypeScript and Rust copies

- `apps/keystone/src-tauri/src/lib.rs:45-56,126-137` — `AppLocator`, `InstalledApp`, `ReleaseAsset` and `AppRelease` are hand-written twins of the interfaces in `packages/core/src/kernel/connectors.ts:12-44`, matched only by serde's camelCase.
- `apps/keystone/src-tauri/src/lib.rs:323` — the seven command names are strings repeated in `apps/keystone/src/platform/desktop.ts:44,45,66,78,114,115,119`, and the `path` header of `write_file` (`lib.rs:19`) in `desktop.ts:45`.
- `apps/keystone/src-tauri/src/lib.rs:123` — the allowed owner `Deign86` is the same decision as each connector's `repo` and `downloads` (`packages/connectors/attendance/src/index.ts:21-22`, `branding-studio/src/index.ts:21-22`, `id-maker-app/src/index.ts:21-22`); a connector for a repository of another owner passes every TypeScript check and is refused only at run time.
- `apps/keystone/src-tauri/src/lib.rs:124` — `INSTALLER_TYPES` (`exe`, `dmg`, `zip`, `pkg`) must agree with each connector's `installers` patterns (`attendance/src/index.ts:23`, `branding-studio/src/index.ts:23`, `id-maker-app/src/index.ts:24`), and nothing compares them.
- `packages/connectors/attendance/src/index.ts:21` — `downloads` is the `repo` on the next line with a prefix and suffix, typed twice in each of the three desktop connectors.
- `apps/keystone/src-tauri/src/lib.rs:196` — `cpu_arch` returns Rust's `aarch64`, which `apps/keystone/src/platform/desktop.ts:78` maps to `arm64` by string comparison.
- `apps/keystone/src/platform/index.ts:13` — the operating system is guessed from the user agent in TypeScript while the Rust side already knows it (`lib.rs:58,79,109`) and already has a command for the processor.
- `apps/keystone/src-tauri/src/lib.rs:206` — the native release lookup may take 20 seconds, but the kit gives a connector call 15 (`packages/kit/src/context.tsx:109`), so for the update check (`core/src/kernel/connectors.ts:173`, which never calls `env.slow`) the kit's deadline always fires first.
- `apps/keystone/src-tauri/src/lib.rs:189` — the user agent uses `CARGO_PKG_VERSION`, but a release stamps its version only into `tauri.conf.json` (`.github/workflows/keystone.yml:185-197`), so `Cargo.toml:3` and every `package.json` stay at 0.1.0.
- `apps/keystone/src/platform/desktop.ts:26` — the repository `Deign86/apg-keystone` is repeated in `apps/keystone/src-tauri/tauri.conf.json:67`.

### A module's id, written many times

- `packages/modules/funds/src/rules.ts:14` — `MODULE = 'funds'` (the key under `state.ext`) must equal `id: 'funds'` at `funds/src/index.tsx:256`, because `documentLayout` keys the cloud layout by module id (`packages/kit/src/registry.ts:195`) and `toDocuments` looks it up by `ext` key (`documents.ts:145`); the same unlinked pair exists in `banks`, `timekeeping` and `payroll` (`rules.ts:9`, `:11`, `:14` against `index.tsx:100`, `:230`, `:268`).
- `apps/keystone/src/modules.ts:23-26` — the installed modules are listed here, again in `apps/keystone/package.json` dependencies, again as `e2e/modules/<id>.e2e.ts` file names, and by id in `RELEASED` (`modules.ts:35`); `scripts/check-e2e.mjs` compares only the second and third.
- `packages/modules/vouchers/src/index.tsx:12` — the draft key `vouchers.draft`, the `go('vouchers')` calls (`:284,286`) and `id: 'vouchers'` (`:272`) repeat one id; `billing`, `funds` and `id-maker` do the same (`billing/src/index.tsx:8,155,169,171`, `funds/src/index.tsx:256,271,273`, `id-maker/src/index.tsx:146,160,162`).
- `packages/modules/funds/src/index.tsx:157` — other modules' ids are literals in six places (`funds:157` vouchers, `billing/src/index.tsx:26` banks, `overview/src/index.tsx:65` activity, `payroll/src/index.tsx:180` and `timekeeping/src/index.tsx:121` directory, `profile/src/index.tsx:53` accounts); the guard is correct, but renaming a module needs a text search.
- `packages/modules/vouchers/src/rules.ts:151` — the log tag is the literal `'CV'` in every `logged(...)` call and again in `logTags` (`vouchers/src/index.tsx:287`); `billing` (`'BS'`), `id-maker` (`'ID'`) and core's directory (`'DIR'`, `core/src/kernel/directory.ts:92` against `directory/src/index.tsx:181`) do the same, and `funds/src/index.tsx:274` writes `RF` although `TAG` is exported at `funds/src/rules.ts:15`.
- `docs/ARCHITECTURE.md:17` and `README.md:18` — the connectors are listed as three (attendance, branding-studio, website) while `apps/keystone/src/connectors.ts:12` installs four, and `docs/ARCHITECTURE.md:68-69` copies two connectors' bundle ids.

### Conventions a caller has to know

- `packages/modules/vouchers/src/rules.ts:257` — a finding's `priority` (5, 7, 8, 10, 15, 20, 25, 30, 35, 40 across `funds/src/rules.ts:463,468,482`, `payroll/src/rules.ts:281`, `timekeeping/src/rules.ts:348`, `id-maker/src/rules.ts:124`, `billing/src/rules.ts:235`) only means something relative to the numbers the other modules picked.
- `packages/modules/vouchers/src/rules.ts:262` — a waiting item's `rank` (0, 10+i, 20, −1, 5 in `billing/src/rules.ts:240`, `id-maker/src/rules.ts:128`, `funds/src/rules.ts:497`) is the same cross-module convention.
- `packages/modules/funds/src/index.tsx:261` — rail `order` is a number chosen against the others (2.5 to sit between 2 and 3), and `accounts/src/index.tsx:247` and `profile/src/index.tsx:84` name their neighbours in comments.
- `apps/keystone/src/connectors.ts:9-12` — connectors are ordered by their place in the array, modules by a numeric `order` that ignores the array in `modules.ts:23` (`registry.ts:113`): two mechanisms for one question.
- `packages/modules/vouchers/src/index.tsx:25-26` — the sentinel `'others'` is safe only because the banks module's label always contains " · " (`packages/modules/banks/src/rules.ts:15`), and `:49` identifies an account by comparing that printed label.
- `packages/modules/directory/src/index.tsx:50-51` — "12% VAT" and "5% EWT" are literals for the rates billing owns (`packages/modules/billing/src/rules.ts:15-16`), and `billing/src/index.tsx:134-135` and `core/src/kernel/schema.ts:24` repeat them too.
- `packages/core/src/kernel/schema.ts:14` — `USED_IN` holds other modules' screen titles ("Requests for Funds", "Billing Statements", "the ID Maker") inside core, copies of `funds/src/index.tsx:257`, `billing/src/index.tsx:156` and `id-maker/src/index.tsx:147`.
- `packages/core/src/kernel/directory.ts:19-29` — `usedBy` knows only `cv`, `bs` and `ids`, so a directory record named by a request for funds (`funds/src/rules.ts:72`), a pay setup (`payroll/src/rules.ts:31`) or a time record (`timekeeping/src/rules.ts:28`) can be removed (`directory.ts:109`); a module has no way to declare that it refers to a record.
- `packages/kit/src/context.tsx:118-139` — a connector gets 15 seconds unless it calls `env.slow` before the long step, which only `fetchInstaller` (`core/src/kernel/connectors.ts:128,133`) does; the rule is nowhere in the `Connector` type.
- `packages/kit/src/store.ts:63-65` — `renamed()` changes `ctx` without telling listeners, so its caller must commit a change straight after (`packages/modules/profile/src/index.tsx:27-28`).
- `packages/kit/src/context.tsx:67-75` — `run` returns no state, so eight call sites read `store.getState()` right after it to rebuild a draft (`vouchers/src/index.tsx:163`, `billing/src/index.tsx:61`, `funds/src/index.tsx:114,127,133`, `id-maker/src/index.tsx:38`, `company/src/index.tsx:20`, `vouchers/src/index.tsx:72`).
- `apps/keystone/src/main.tsx:61` — the caller must collect every module's `onOpen` and pass it to `KeystoneStore.open`; `apps/keystone/src/test/released.test.tsx:55` and `removal.test.tsx` repeat the same expression, and tests that forget it (`payroll.test.tsx:40`, `funds.test.tsx:44`) open without housekeeping.
- `packages/kit/src/documents.tsx:99-100` — `Sheet` and `output.ts` talk through `data-print-fit`, `data-print-orientation`, `data-sheet-copy` and `data-print-root` strings (`packages/kit/src/output.ts:10,18,62,84,89`), which `packages/ui/src/styles.css:136-155` must also name.
- `packages/kit/src/documents.tsx:13,16` — the 12 mm margin and the 186 × 273 mm printable area are restated in `packages/kit/src/output.ts:7,41` and `packages/ui/src/styles.css:160`.
- `shared/design/tokens.json:4` — the background `#0b0a08` is generated only into `packages/ui/src/theme.css`; it is typed again in `apps/keystone/index.html:7`, `apps/keystone/public/site.webmanifest:9-10`, `apps/keystone/src-tauri/tauri.conf.json:24`, `scripts/build-icons.mjs:26`, `scripts/brand/derive-icons.py:25` and `shared/brand/icons.json:3`.
- `apps/keystone/vite.config.ts:10` — the dev port 5174 is repeated in `apps/keystone/src-tauri/tauri.conf.json:8`.
- `apps/keystone/src/platform/config.ts:11-13,46-47` — the `VITE_FIREBASE_*` names are repeated in `.env.example`, `.github/workflows/keystone.yml:74-79,208-211`, `e2e.cloud.config.ts:46-51`, and the "blank them all" lists in `e2e.config.ts:44` and `e2e.stable.config.ts:34` must grow with every new variable.
- `apps/keystone/src/platform/browser.ts:5` — the storage key `keystone-state` is retyped in `e2e/support/sample-records.ts:19-22`, `e2e/screens.e2e.ts:101` and `e2e/cloud/emulators.ts:305`; `keystone-last-used` (`session.ts:11`) in `e2e/cloud/sign-in.e2e.ts:99,104`; `keystone-pending-saves` (`cloud.ts:34`) in `apps/keystone/src/test/cloud.test.tsx:373,385`.
- `packages/kit/src/store.ts:79` — the 250 ms save delay is known by number in `packages/kit/test/runtime.test.ts:29` (a 300 ms sleep) and in the comment and timing of `e2e/screens.e2e.ts:192-197`.
- `docs/adr/README.md` — two records are numbered 0021, so the reference "docs/adr/0021" in `apps/keystone/src/modules.ts:30` and `packages/modules/funds/src/rules.ts:9` names two files.

### The same logic in two places

- `apps/keystone/src/platform/browser.ts:8-15` — a second copy of the guarded `localStorage` get/set that `apps/keystone/src/platform/web-storage.ts:12-20` already exports.
- `apps/keystone/src/platform/pending.ts:41` — `refKey` is a copy of the private `refKey` in `packages/core/src/kernel/documents.ts:223`.
- `packages/modules/accounts/src/rules.ts:45` — the "one line, single spaces" cleaner is written again in `banks/src/rules.ts:45`, `company/src/rules.ts:28` and inline in `profile/src/rules.ts:17`.
- `packages/modules/banks/src/rules.ts:69` — repeats `nextAccountId` from `:42` instead of calling it.
- `packages/modules/timekeeping/src/rules.ts:65-70` — `clock12` repeats the 12-hour arithmetic of `packages/core/src/kernel/format.ts:53-58`.
- `packages/modules/funds/src/rules.ts:21` — a second tone table gives `'For Approval'` and `Approved` the tones core already gives them at `packages/core/src/kernel/schema.ts:67-71`.
- `packages/kit/test/fakes.ts:5-24` — the in-memory `Platform` is re-implemented in `packages/modules/profile/test/screen.test.tsx`, `packages/modules/accounts/test/screen.test.tsx` and `packages/modules/billing/test/pay-into.test.tsx`, because a part cannot import the kit's test helper; every change to `Platform` (10 commits) touches all four.
- `packages/modules/vouchers/src/VoucherPaper.tsx:13-21,56-100` — the voucher draws its own boxed facts, line table, total band and signature blocks instead of the kit's `Meta`, `Lines` and `Signatures` (`packages/kit/src/documents.tsx:183,217,256`), so the paper's ruling exists twice.

---

## 2. Needless links

- `packages/kit/src/platform.ts:16,45-49,58-87` — the kit's `Platform` carries the whole accounts feature (`AppAccounts`, `MemberAccount`, `NewAccount`), so each account capability is a change to the kernel, the Firebase platform, the rules and the accounts module together (see the co-change counts above).
- `packages/kit/src/platform.ts:47-48,82-86` — `attendanceAdmin` and `setAttendanceAdmin` put one connected system's concept into the kernel contract every platform implements.
- `packages/modules/accounts/src/rules.ts:114-150` and `packages/modules/accounts/src/index.tsx:184-190` — a module holds the wording and menu for the attendance tracker, a connector, so removing `@keystone/connector-attendance` leaves "Make attendance admin…" in place; the link bypasses both `ModuleDef` and `Connector`.
- `packages/kit/src/context.tsx:62-78` — `useKeystone()` hands every screen the `store`, the `registry` and the whole `platform`, so modules call `store.getState()`, `store.renamed()`, `store.replaceAll()` and `store.ctx` directly (`profile/src/index.tsx:23,27`, `data/src/index.tsx:27`), which is more than the `ModuleApp` the rules say a part may use.
- `packages/kit/src/context.tsx:81-93` — `useModuleApp()` returns `state`, `ctx` and `go` that `useKeystone()` also returns, so a screen holds two overlapping contexts (`billing/src/index.tsx:15-16`, `vouchers/src/index.tsx:37-38`).
- `packages/kit/src/context.tsx:134` — a connector's `env.system` is the full `Platform` object (`system: platform`), so at run time a connector can reach `loadState`, `saveState`, `accounts` and `session`; only the type narrows it.
- `packages/kit/src/platform.ts:8` — `Platform extends SystemBridge` ties the connectors' contract in core to the app's storage and sign-in contract in kit, which is why the previous bullet is possible.
- `packages/core/src/kernel/schema.ts:53-73` — core owns the status lists and the tone table of three modules (vouchers, billing, ID maker), so the stable layer changes when one of those screens adds a status.
- `packages/core/src/kernel/insight.ts:30` — `WaitingItem.status` is typed as core's `Status`, so `funds` can contribute a waiting item only because `'For Approval'` happens to be a voucher status (`funds/src/rules.ts:497`).
- `packages/core/src/kernel/schema.ts:14` and `packages/core/src/kernel/directory.ts:99` — the directory's success message depends on which screens exist, so core imports knowledge of modules by title.
- `packages/core/src/kernel/schema.ts:75-148` — `Voucher`, `Statement` and `IDRecord` live in core although each has one owning module; this is the documented trade-off T1, and it is why `backup.ts:21-32` and `usedBy` must know every field list.
- `packages/core/src/kernel/services.ts:39-62,112-127` — a service's types sit in core, so the owning module's contract is edited in the kernel (`BankAccount` at `schema.ts:213` likewise).
- `packages/kit/src/documents.tsx:84-107,140-169` — `Sheet` and `Letterhead` branch on one document's needs (`fit="halves"`, `logo="companies"`, `beside` for the voucher; `fit="page"` and `orientation="landscape"` for the payroll sheet), which is why this kernel file is the most-changed in the repo.
- `packages/kit/src/output.ts:79-81` — the kit's comments and branches name "the payroll sheet" and "a check voucher", two parts the kit is meant not to know.
- `packages/kit/src/registry.ts:164-186` — the registry validates a Firestore naming rule, so the app runtime knows the cloud database although `firebase/*` is confined to `apps/keystone/src/platform/`.
- `packages/core/src/kernel/documents.ts:22-36` — `RecordDocuments` in core is shaped by `firestore.rules` (its comments say so at `:23,30`), so the kernel's contract follows one storage product.
- `packages/modules/home/src/index.tsx:20-23,39,45,88` — Home, Overview (`overview/src/index.tsx:15-22`), Activity (`activity/src/index.tsx:10`) and Data (`data/src/index.tsx:51,62`) read the raw `registry`; that is the designed contribution path, but it exposes every `ModuleDef` field and `Screen` to four modules.
- `packages/kit/src/registry.ts:50` — `stat` receives the full `ModuleDef[]`, so a module's Home figure can read any other module's fields, not only its contributions.

---

## 3. Surplus

### Extension points nothing uses

- `packages/core/src/kernel/services.ts:14,28,49-62` — the `billing.statement-payments` service has no consumer; only `apps/keystone/src/test/services.test.tsx:14,25` and `packages/modules/billing/test/rules.test.ts:91-92` call it.
- `packages/kit/src/registry.ts:42-43,131-145` — `requires` and its fixed-point loop are used by no module.
- `packages/kit/src/registry.ts:75-78,108` — `ConnectorPlugin.modules` is used by no connector; every plugin is `{ connector }`, so the wrapper type adds nothing over `Connector`.
- `packages/kit/src/registry.ts:33` — `ModuleDef.section` is required and set by all fifteen modules but read by no code; each screen types the same word again as its `ScreenHeader` eyebrow (for example `accounts/src/index.tsx:162,245`).
- `packages/core/src/kernel/connectors.ts:95,97,99` — `DesktopApp.repo`, `installers` and `updatesItself` are optional, yet all three desktop connectors set all three, and the guards for their absence (`connectors.ts:127,167`) never run outside tests.
- `packages/core/src/kernel/connectors.ts:99` — `updatesItself` and the presence of `Connector.update` decide the same thing twice (`id-maker-app/src/index.ts:25,33`; `connectors.ts:167`).
- `packages/kit/src/context.tsx:67` — the `quiet` parameter of `run` is passed by no caller.
- `packages/kit/src/documents.tsx:217-218,237-241` — the `rows` parameter of `Lines` (blank padding rows) is passed by no caller.
- `packages/kit/src/documents.tsx:210` — the `header` parameter of `amountColumn` is passed by no caller (`funds/src/TransferPaper.tsx:46` is the only use).
- `packages/kit/src/documents.tsx:256` — the `className` parameter of `Signatures` is passed by no caller.
- `packages/kit/src/components.tsx:45` — `previewNote` on `Workspace` has one caller (`id-maker/src/index.tsx:93`).
- `apps/keystone/src-tauri/icons/android/` and `icons/ios/` (35 files), `scripts/build-icons.mjs:26-28`, `scripts/brand/derive-icons.py:120` and `apps/keystone/src-tauri/src/lib.rs:316` (`mobile_entry_point`) — a mobile build is prepared for, but the bundle targets are `app`, `dmg`, `nsis` (`tauri.conf.json:37-41`).

### Dead or left over

- `packages/core/src/kernel/schema.ts:30` — `DirectoryRecord.links` is written by no code and present in no sample record; only `directory.ts:86` copies it forward and `packages/modules/directory/src/index.tsx:93-98` displays it, a leftover of the integration ADR 0004 that 0007 superseded.
- `packages/core/src/kernel/connectors.ts:77-78` — `Connector.tag` (`attendance/src/index.ts:30`, `website/src/index.ts:13`) feeds only that never-populated display.
- `packages/kit/src/registry.ts:42,83,91` — comments still speak of "Connections" (a screen that no longer exists; refusals show on Data) and of "no health check" (health checks went with ADR 0007); `:25` names a "Settings" screen that does not exist.
- `firestore.rules:133` — the comment still lists "moving the records in" as an owner's write, the flow ADR 0018 removed.
- `docs/ATTENDANCE-INTEGRATION.md` — marked withdrawn in its first lines and still linked from `README.md`.
- `packages/core/src/kernel/money.ts:37` — `editText` is imported only by `packages/core/test/kernel.test.ts`.
- `packages/core/src/kernel/documents.ts:15` — the type `Collection` is used nowhere.
- `packages/core/src/kernel/connectors.ts:9` — `PlatformName` is imported only by a test; `installerFor` (`:115`), `laterVersion` (`:103`), `monthKey` (`dates.ts:40`), `IDLE_FINDING` (`insight.ts:36`), `parseQuantity` (`lines.ts:31`), `CODE_PREFIX` and `USED_IN` (`schema.ts:13-14`), `OpenStatement` and `VoucherRequest` (`services.ts:49,112`) are exported from core but used only inside core.
- `packages/kit/src/index.ts:6,8,10,15,20,24` — `Shell`, `Outcome`, `Registry`, `KeystoneProvider`, `useOpenConnector`, `useConnectorUpdate`, `LineColumn` and `AppUpdate` are exported but imported by nothing outside the kit, and `findService` only by tests.
- `packages/connectors/attendance/src/index.ts:11,18,27` — each connector exports its locator, its `DesktopApp` and its bare `Connector` beside the plugin (`ATTENDANCE_APP`, `ATTENDANCE`, `attendanceConnector`, and the same in the other three); only that connector's own test imports them, and `ATTENDANCE`, `STUDIO`, `ID_MAKER` and `ADMIN_PORTAL` nothing at all.
- `packages/modules/*/src/rules.ts` — about forty exports are used only inside their own file (for example `PasswordDraft` and `PasswordChange` at `accounts/src/rules.ts:154,163`, `REQUEST_STATUSES`, `PAY_METHODS` and `FundsData` at `funds/src/rules.ts:17,39,85`, `runFor`, `AMOUNTS` and `WorkedOut` at `payroll/src/rules.ts:97,150,202`, `SHIFT`, `DAY_MINUTES`, `WEEKLY_GRACE`, `isTime`, `minutesOf`, `timeOf` at `timekeeping/src/rules.ts:15-62`, the rate constants at `payroll/src/pay.ts:22-31`).
- `packages/ui/src/overlays.tsx:32` — `ConfirmProvider` is exported but used only inside the file, as are `Option` (`fields.tsx:72`), `ButtonProps` (`primitives.tsx:18`), `RowAction` and `RowMenu` (`register.tsx:57,134`).
- `apps/keystone/src/platform/browser.ts:6,73` — `launchApp` throwing `NEEDS_DESKTOP` cannot be reached: `locateApp` returns null there and `openDesktopApp` refuses the web first with its own sentence (`core/src/kernel/connectors.ts:147`).
- `scripts/brand/derive-companies-logo.py` — named by no script, no `package.json` entry and not by `shared/brand/README.md`, which lists the other two brand scripts.

### Pass-through layers

- `packages/kit/src/components.tsx:97-133` with `packages/kit/src/context.tsx:142-188` — `useOpenConnector` and `useConnectorUpdate` are public hooks with one user each, the component beside them.
- `apps/keystone/src/platform/session.ts:14` — `UseLog` is an alias of `StoredText` with no added meaning.
- `apps/keystone/src/platform/index.ts:4` — re-exports the kit's `Platform` type, which nothing imports from here.

---

## 4. Special cases

### An `if` for one value, a parameter for one caller

- `packages/kit/src/context.tsx:23` — the kit names the module id `'home'` to pick the first screen, while `packages/kit/src/Shell.tsx:49` uses `registry.modules[0]` for the same thing and `Shell.tsx:79` prints "0 home" as a fixed word.
- `packages/kit/src/registry.ts:50` — the third argument of `stat` (`installed`) exists for one module (`packages/modules/overview/src/index.tsx:82`).
- `packages/core/src/kernel/connectors.ts:143-144` — `openDesktopApp` accepts `ConnectorEnv | SystemBridge` and sniffs `'system' in env`; only `packages/core/test/kernel.test.ts:226-298` passes the bare bridge.
- `packages/kit/src/store.ts:63-65` — `renamed()` is a store method for one caller (`packages/modules/profile/src/index.tsx:27`).
- `packages/kit/src/store.ts:125-128` — `replaceAll()` is a store method for one caller (`packages/modules/data/src/index.tsx:27`).
- `packages/kit/src/documents.tsx:85-87,107` — `fit === 'halves'` (with `Copy`, `PAGE_WIDTH`, `HALF_PAGE_HEIGHT`, `fitToHalves` at `output.ts:68-75,98-102`) serves the voucher alone (`vouchers/src/VoucherPaper.tsx:33`).
- `packages/kit/src/documents.tsx:86,100` and `packages/kit/src/output.ts:40-59,91-96` — `fit="page"`, landscape and `FitWidth` serve the payroll sheet alone (`payroll/src/PayrollPapers.tsx:48-50`).
- `packages/kit/src/documents.tsx:147-152,160` — `logo="companies"` and `beside` serve the voucher alone (`vouchers/src/VoucherPaper.tsx:35`).
- `packages/kit/src/ComingSoon.tsx:49` — `comingSoon` removes exactly one contribution (`finding`) and keeps the rest, a rule stated only in this line.
- `apps/keystone/src/platform/firestore.ts:141` — the read query branches on `readBy` and the cached `owner` flag, a path only the `rf` collection takes.
- `packages/core/src/kernel/connectors.ts:116-118` — an unknown processor is treated as Apple silicon (`arch === 'x64' ? macIntel : macArm`), the same assumption stated at `apps/keystone/src/platform/desktop.ts:74-75`.

### Swallowed errors

- `apps/keystone/src/platform/desktop.ts:48-54` — `readText` turns every read failure into `null`, which `loadState` (`:87`) reports as "nothing saved yet", against the contract at `packages/kit/src/platform.ts:18` ("Throws when it exists but cannot be read now").
- `packages/kit/src/store.ts:36-40` — a saved state that cannot be parsed is silently replaced by an empty one, with nothing shown to the person.
- `packages/core/src/kernel/connectors.ts:152` — any failure while fetching an installer, including the native digest mismatch (`lib.rs:242`), is dropped and replaced by "its download page is open".
- `packages/core/src/kernel/connectors.ts:187-189` — every error in the update check becomes `null`.
- `packages/kit/src/context.tsx:169` — the update check's rejection (including the 15-second deadline) is discarded with `() => {}`.
- `packages/kit/src/UpdateNotice.tsx:32` — a failed `currentVersion()` is discarded with `() => {}`.
- `apps/keystone/src/platform/desktop.ts:78` — a failed `cpu_arch` is discarded, leaving `arch` undefined for the session.
- `apps/keystone/src/platform/desktop.ts:95-97` — any failure reading a photo becomes "no photo".
- `apps/keystone/src/platform/browser.ts:55` — the same for the browser's photo store.
- `apps/keystone/src/platform/browser.ts:13` and `apps/keystone/src/platform/web-storage.ts:18` — a failed `localStorage` write is ignored; for `web-storage` that is the pending-saves note (`cloud.ts:34`) and the last-used time, so a full store silently drops the safety net of ADR 0013.
- `apps/keystone/src/platform/firestore.ts:239` — a failed `deleteUser` after a refused member write is ignored, leaving a sign-in that is not a member.
- `apps/keystone/src/platform/pending.ts:82-86` — an unreadable pending note counts as nothing pending.
- `packages/core/src/kernel/documents.ts:167-172` and `packages/core/src/kernel/state.ts:80-84` — unparseable JSON becomes `null`; both are then handled by the caller, listed for completeness.
- `apps/keystone/src-tauri/src/lib.rs:36,241,245` — three `let _ = fs::remove_file(...)` discard clean-up failures.
- `e2e/support/sample-records.ts:24` — a refused storage write is ignored, so a test would run against an empty Keystone without saying why.

### Timers used to wait

- `apps/keystone/src/platform/browser.ts:63` — `setTimeout(..., 1000)` waits for a download to have started before revoking its URL.
- `packages/kit/src/store.ts:79` — a 250 ms `setTimeout` delays every save, which is why `main.tsx:72-75` must flush on `pagehide` and `visibilitychange` and why ADR 0013's pending notes exist.
- `packages/kit/test/runtime.test.ts:29` — a real 300 ms sleep waits out that delay.
- `packages/kit/src/UpdateNotice.tsx:46` — the first update check waits a fixed 4 seconds after start.
- `packages/kit/src/context.tsx:126-134` — the connector deadline is a `Promise.race` against a timer; when it fires, the native download (`lib.rs:219-248`, which has no overall time limit) keeps running and may open the installer after the screen has said it gave up.
- `e2e/screens.e2e.ts:197` — `setTimeout(() => location.reload(), 0)` stages a reload inside the save delay.
- `packages/modules/home/src/index.tsx:10` and `packages/kit/src/Session.tsx:92` — one-second `setInterval` polls (a clock, the idle check); both read the time instead of counting, listed for completeness.

### Skipped tests

- None found in `apps/`, `packages/`, `e2e/` or `scripts/`.

---

## Candidate root fixes

Ordered by how many listed problems each removes.

1. **One declared layout for the cloud, checked against `firestore.rules`.** Keep `COLLECTIONS`, each module's
   `RecordDocuments` (collection, checked fields, allowed statuses), the reserved names and the size and name limits
   in one data structure in core, and add a check (in `npm run check`) that reads `firestore.rules` and fails when a
   list, field or limit differs; or generate those rule fragments from it.
   - Removes: every bullet under "Firestore: rules, path builders and module declarations" except the `owner` flag
     and the external-apps one; the `registry.ts:165` reserved-name gap; `MAX_NAME`; the status list; `details`.
   - Behaviour risk: low if it is a check only; medium if rules are generated (a wrong generator closes or opens
     access). Publish only after the emulator suite passes.
   - Covered by: `e2e/cloud/*.e2e.ts` (records, funds, accounts, id-register, kiosk-backup), `packages/core/test/documents.test.ts`,
     `packages/kit/test/registry.test.ts`, `apps/keystone/src/test/cloud.test.tsx`.

2. **Move accounts out of `Platform` into a published service, and make attendance admin a contribution.** Define
   an `accounts` contract beside the other service contracts, let the cloud platform provide it, and let the
   attendance connector contribute its "admin" capability (label, question, field) through `Connector` instead of
   the accounts module and the kit naming it. Put the refusal sentences and the `isOwner(ctx)` test in one place
   (core), used by the platform and by the four modules.
   - Removes: the `Platform`/accounts needless links, `attendanceAdmin` in the kernel, the accounts ↔ attendance
     link that bypasses `ModuleDef`/`Connector`, the copied `ONLY_OWNER*` and own-account sentences, the five copies
     of the owner test, the four fake `Platform` copies' churn, and the `firestore.ts:115` ordering dependence if
     the service is created after `member()` returns.
   - Behaviour risk: medium. Sign-in order in `main.tsx` and the exact sentences are asserted by tests.
   - Covered by: `packages/modules/accounts/test/rules.test.ts` and `screen.test.tsx`, `packages/modules/profile/test/screen.test.tsx`,
     `e2e/cloud/accounts.e2e.ts`, `e2e/cloud/sign-in.e2e.ts`, `apps/keystone/src/test/removal.test.tsx` (attendance removed).

3. **One description of a connected desktop app, shared by TypeScript and Rust.** Derive `downloads` from `repo`,
   drop the optionality and the `updatesItself` flag (the presence of `update` says it), and generate or test the
   native allow-list (`OWNER`, `INSTALLER_TYPES`, command names, struct shapes) against the connectors: a Rust test
   or a `check` script that loads each connector's `repo` and installer patterns and runs them through
   `allowed_repo` and `allowed_installer`.
   - Removes: all bullets under "TypeScript and Rust copies" except the version one; the optional-field and
     double-switch surplus; the `downloads` copy; the `aarch64`/`arm64` mapping if the native side returns the
     platform and processor in one command (also removing the user-agent guess).
   - Behaviour risk: low to medium; the download path is security-relevant, so keep the native refusal as the judge.
   - Covered by: `cargo test` (`lib.rs:250-314`), `packages/connectors/*/test/*.test.ts`, `packages/core/test/kernel.test.ts:226-298`,
     `packages/kit/test/shortcut.test.tsx`, `e2e/connectors/*.e2e.ts`.

4. **Let a module own its identity and its references once.** Give each module one exported `ID` used for
   `ModuleDef.id`, the `ext` key, the draft key and its own `go` calls; let a module declare the directory codes it
   refers to (a `refersTo(state, code)` contribution collected like `waiting`) so `usedBy` stops hardcoding three
   lists; move the three legacy status lists, tone table and `USED_IN` titles out of core into their modules, with
   `WaitingItem.status` a plain string and tone.
   - Removes: the `MODULE` vs `id` pairs, the repeated draft keys and tags, `usedBy`'s blind spot for funds, payroll
     and timekeeping, core's knowledge of module titles and statuses, the duplicated tone table, `section` (drop it
     or render the eyebrow from it).
   - Behaviour risk: medium for `usedBy` (records that could be removed become protected) and low for the rest;
     saved data is unchanged because keys keep their values.
   - Covered by: `apps/keystone/src/test/contract.test.ts`, `removal.test.tsx`, `packages/core/test/kernel.test.ts`,
     each module's `test/rules.test.ts`, `e2e/modules/directory.e2e.ts`.

5. **Make the kit's document blocks composable instead of branching per paper.** Split `Sheet` into a plain sheet
   plus layout wrappers (`TwoUp`, `Landscape`/`FitPage`) that carry their own print behaviour, so the voucher and
   payroll variants live with one definition each; let the voucher use `Meta`/`Lines`/`Signatures` or move its
   ruling into the kit once; keep paper geometry (margin, printable area) in one constant the stylesheet is
   generated from or tested against.
   - Removes: the `documents.tsx`/`output.ts` one-caller branches, the data-attribute string contract, the copied
     millimetres, the voucher's duplicate ruling, the unused `rows`/`header`/`className` parameters, and the highest
     co-change pair in the kernel.
   - Behaviour risk: medium to high: printed output is pixel-checked. Change one paper at a time.
   - Covered by: `packages/kit/test/documents.test.tsx`, `e2e/modules/vouchers.e2e.ts`, `billing.e2e.ts`,
     `payroll.e2e.ts`, `funds.e2e.ts` (with `e2e/support/paper.ts`).

6. **Stop swallowing at the platform edge.** Make `desktop.ts` `readText` distinguish "no file" from "cannot read",
   surface a damaged state and an installer failure as a sentence, and cancel or ignore the native download when the
   kit's deadline fires.
   - Removes: the first, second, third and fifth swallowed-error bullets, the deadline-without-cancel bullet and the
     15 s/20 s mismatch.
   - Behaviour risk: medium; a start that used to open empty will now stop with a message, which is the contract
     `store.ts:26-30` already describes.
   - Covered by: `packages/kit/test/runtime.test.ts`, `packages/kit/test/shortcut.test.tsx`, `e2e/screens.e2e.ts`
     (damaged records), `packages/connectors/id-maker-app/test/id-maker-app.test.ts`. No test covers `desktop.ts` itself.

7. **Narrow what a screen is given.** Have `run` return the new state, drop `store` and `platform` from
   `useKeystone()` in favour of the specific capabilities (`files`, `photos`, `backup`), and pass connectors a real
   `SystemBridge` object instead of the whole `Platform`.
   - Removes: the `useKeystone` internals bullet, the two-contexts bullet, the eight `store.getState()` call sites,
     `renamed()`/`replaceAll()` as one-caller store methods, and the connector run-time exposure.
   - Behaviour risk: low; mechanical, with wide test cover.
   - Covered by: `apps/keystone/src/test/removal.test.tsx`, every module's `e2e/modules/<id>.e2e.ts`,
     `packages/kit/test/runtime.test.ts`.

8. **Delete what nothing uses.** The `statement-payments` service, `requires`, `ConnectorPlugin.modules`,
   `DirectoryRecord.links` and `Connector.tag`, `quiet`, the mobile icons and entry point, the unused exports, and
   the stale comments.
   - Removes: most of section 3.
   - Behaviour risk: low, except `links` (keep reading it from old backups, stop displaying) and the services test,
     which asserts the service exists.
   - Covered by: `apps/keystone/src/test/services.test.tsx` and `packages/kit/test/registry.test.ts` must be edited
     with the deletion, which the repo's rule requires a pull request to state at the top.
