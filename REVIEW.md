# What a review of this repository looks for

For whoever reviews a change here, person or agent. It is read from `main`, never from the change under review: a
change does not get to edit the list it is judged by. `AGENTS.md` has the rules for writing a change; this is what to
check once one is written.

Each row says when it applies (readable from the diff), what to check, and where it came from. Check only the rows
whose trigger matches. Tag each finding **Important** (would cost a wrong figure on a document, a lost or exposed
record, a part that cannot be removed, or a broken release), **Nit**, or **Pre-existing** (already there; not held
against this change).

## The architecture

| When the diff touches | Check | From |
| --- | --- | --- |
| An import in `packages/modules/` or `packages/connectors/` | It names only `@keystone/core`, `@keystone/ui` or `@keystone/kit`. `npm run check:boundaries` passes | AGENTS.md rule 1 |
| A screen that shows another part's data, or jumps to one | It reads contributions or a service and works without the other part; a jump is guarded by `app.has()`. The removal suite still passes unchanged | AGENTS.md rules 3 to 5 |
| A screen file with arithmetic, numbering or a status decision in it | The rule is in the part's `rules.ts` (or core) with a test, and is pure: no I/O, no `Date.now()` | AGENTS.md rule 7 |
| `state.json` keys, `toDocuments`, or a record's fields | Only optional fields are added; no key is renamed or removed; old saved state still loads | AGENTS.md rule 9 |

## Money and documents

| When the diff touches | Check | From |
| --- | --- | --- |
| Tax, totals, amount in words, numbering, payroll | The existing expectations are unchanged. If one changed, the pull request names the rule that changed and who asked for it | The prototype's results are kept exactly |
| The company's details, or payment instructions on a document | Only an owner can change them, in the app and in `firestore.rules` | docs/adr/0018 |
| A paper, its styles, `paper-pdf.ts`, `output.ts` or the print stylesheet | Its exported PDF is as clean as the paper: each rule a line, once, in its colour and width on screen; no rule stitched from pieces; no seam between backgrounds; no frame, and nothing black the paper does not show. A new paper that exports a PDF goes through `expectCleanPdf` (`e2e/support/paper.ts`) | docs/adr/0048, "Every exported PDF" |

## The cloud

| When the diff touches | Check | From |
| --- | --- | --- |
| `firestore.rules` | An emulator test in `e2e/cloud/` shows what is now allowed and what is still refused. The live rules are published after the merge and compared with `main`; the pull request says so | Rules merged on 17 Nov 2026 were live only the next day |
| The `att_…` and `attprivate_…` blocks | Only a device writes them; only that device and an owner read them; a batch that reaches outside them writes nothing (`e2e/cloud/kiosk-backup.e2e.ts`). They hold pay, TINs and bank account numbers: widening who reads them is an **Important** change that names the screen that needs it, and never widens `attprivate_…` along with it | docs/adr/0027, 0028 |
| `latest_release`, `install_from`, `allowed_repo`, `allowed_installer` in `src-tauri/src/lib.rs`, or a connector's `repo` or `installers` | The native side still refuses any repository not `Deign86`'s, any address not a release file on github.com, any type that is not an installer, and a download that does not match its digest; its tests are unchanged or stricter. The connector's test holds the real file names of a release | docs/adr/0029 |
| The `idreg` or `devices` blocks, `issuedId()`, `device()` | The ID Maker (`Deign86/apg-id-creator`, `register/README.md`) and the attendance kiosk (`Deign86/alpha-premier-attendance`, `docs/id-register.md`) still work against them. A new field is accepted here before the app that sends it is released | docs/adr/0025, 0026 |
| `members`, roles, sign-in, User Accounts | Only an owner adds, changes or removes a member; a member changes only their own name; nobody raises their own role | docs/adr/0014, 0015, 0020 |
| `firebase/*` or `@tauri-apps/*` imports | They are only under `apps/keystone/src/platform/` | AGENTS.md rules 8 and 9 |
| An `onSnapshot`, or what the store does with what arrives | An error ends a Firestore listener for good: its callback listens again or falls back to reading, and the person is told (never only a console line). One collection failing never holds up the others. What arrives is never saved back | Live updates stopped until a restart, from v0.31 to docs/adr/0049 |
| Who reads a module's records, or how a part rebuilds a record it read (`readBy`, a `dataOf`) | A staff member's save after reading records someone else wrote is tested in `e2e/cloud/`: it writes only what changed, never another person's record rebuilt in another key order (`diffDocuments` compares content) | Every staff save refused in v0.54–0.55, once staff read every request (docs/adr/0051) |
| `.env*`, workflows, scripts, documents | No password, token, service-account file or key is written in | AGENTS.md |

## The code

| When the diff touches | Check | From |
| --- | --- | --- |
| A type assertion | It has a `SAFETY:` comment just above it. No runtime `typeof` check standing in for a type, and no open dictionary as an explicit return type | Oxlint anti-slop findings on the ID register pull requests |
| A lint or test configuration, `.oxlintrc.json`, a workflow, `REVIEW.md`, `AGENTS.md` | The change weakens no check. A removed rule says which miss it no longer guards against | AGENTS.md, Verification |
| Any test | No test was skipped, given a fixed wait, or retried until it passed. End-to-end tests use roles and names, never CSS | AGENTS.md, Tests |
| A screen, button or flow | Its part's `e2e/` file has the test for it; empty, loading and error states exist | AGENTS.md, Tests |
| A commit subject | `chore`, `docs`, `test` and `ci` make no release; anything else does. The subject matches what the change is | Release by commit subject |

## How the change was verified

The commit says, in a `Verified:` line, what was run and what it showed, or `Verified: none` and why. A claim with no
run behind it is an **Important** finding.
