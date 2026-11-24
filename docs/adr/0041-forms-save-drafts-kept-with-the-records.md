# 0041. Forms save drafts, kept with the records; a request's drafts are kept to their author

Status: Accepted · Date: 2026-11-24

## Context

- **Half-filled work was lost when Keystone closed.** Each document form (check vouchers, requests for funds, billing
  statements, statements of account, IDs) keeps what is typed only in memory (`useDraft`), so it survives switching
  screens and nothing more.
- **The owner chose a Save draft button and a drafts list,** over keeping whatever is typed on one computer: drafts kept
  with the records, in the cloud, so they are on every computer; listed on their screen, marked Draft; opened again,
  finished or deleted; several on each screen. A draft is not numbered, not logged as issued and counted in nothing.
- **Not every record is everyone's.** Vouchers, statements, statements of account and IDs are read by every member. A
  request for funds is read only by its requester and the CEO (docs/adr/0011, 0021): firestore.rules hold the `rf`
  collection to them. A request's draft must be held the same way, by the rules, not only hidden on screen.
- **A module's data is one `ext` document in the cloud,** any member's to write, and some modules rewrite theirs whole
  on every save, so drafts kept inside it would be lost or overwritten.

## Decision

- **The kernel keeps every module's saved drafts** (`packages/core/src/kernel/drafts.ts`): two lists under `state.ext`,
  by keys no module id can take, `_drafts` (shared) and `_mydrafts` (private). A draft is `{ id, module, title, saved,
  by, uid?, body }`: the form's draft as it was, what the list calls it, when and by whom it was saved, and, when private,
  its author's uid. Its id is the author, the module and a running number of the author's own, so two computers never
  make the same one. Saving a draft writes no log entry.
- **In the cloud each list is a collection with a document per draft** (`DRAFT_DOCUMENTS`, through the same layout a
  module's own records use, docs/adr/0011): `drafts`, which any member reads, saves over and deletes, and `mydrafts`,
  with `uid` beside the body, which an owner reads and writes whole and a member reads, saves and deletes only when it is
  their own, and never gives to someone else. A member is sent only their own (`readBy`); an owner is sent all of them
  and sees only their own on screen. `cloud-layout.json` declares both, with no statuses, and
  `scripts/check-cloud-layout.mjs` now compares statuses only for a collection that declares some. No module may take
  either collection's name.
- **The kit gives every form the same Save draft** (`useSavedDrafts`, `SaveDraftButton`, `SavedDrafts` in
  `@keystone/kit`). A module says what a draft is called and how a saved one goes back in its form; a request for funds'
  drafts are `private`. Saving or opening a draft marks the form with it (`Editing.savedDraft`), so the next save goes
  over it and a new form starts a new draft. Saved for real, the form's draft is finished and leaves the list.
- **A draft goes back in its form over a fresh one,** so a field an older Keystone did not save starts as a new form's,
  its lines get new ids, and a new document takes the next free number then, not the one free when it was saved. A
  draft of an edit to a saved record goes back to editing that record.
- **The Drafts list** sits above the screen's register: each draft marked Draft, with what it is, when and by whom it
  was saved, Open and Delete…. Nothing shows while there are none.

## Consequences

- Drafts are in backups and restores as part of `state.ext`, and move with the records into the cloud.
- A shared draft is anyone's to finish or delete, as the records it becomes are. Two people saving the same draft at
  once: the later save wins, as with any record.
- The CEO's Keystone holds every member's private drafts, as it holds every request, and lists only the CEO's own.
- Drafts carry no record number, so nothing in Overview, Home, the findings or the totals counts them.
