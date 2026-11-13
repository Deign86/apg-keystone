# @keystone/kit

The app runtime every module and connector builds on. It depends on `@keystone/core` and `@keystone/ui` only and knows
no module and no connector (`npm run check:boundaries`). Parts import it by name: `import { useModuleApp } from
'@keystone/kit'`.

| File | What it does |
|---|---|
| `src/registry.ts` | `ModuleDef`, `ConnectorPlugin`, `ModuleApp`, and `buildRegistry`, which validates parts, applies `requires`, keeps one provider per service, and leaves out anything broken, with a reason. `findService` looks a service up by its published name |
| `src/store.ts` | Holds the saved state, runs rules (`run`), writes `state.json` about 250ms after a burst of changes, never overwrites a damaged file until something changes, and runs modules' `onOpen` housekeeping |
| `src/context.tsx` | Hooks: `useKeystone`, `useModuleApp` (`go`, `has`, `setDraft`, `service`), `useDraft`, `useOpenConnector` (opens a connected system's app under a 15-second deadline and says what happened), `usePhoto` |
| `src/Shell.tsx` | The rail, ⌘/Ctrl+number navigation, and one error boundary per screen |
| `src/ComingSoon.tsx` | `comingSoon`: a module as a screen not released yet (docs/adr/0017, 0019), marked "Soon" in the rail and "Coming soon" on its Home tile; its own screen shows faded behind a "Coming soon" notice, `inert` and hidden from screen readers. It keeps everything it contributes but its finding |
| `src/Session.tsx` | Signing out of the records in the cloud (docs/adr/0012): `SignOutButton` in the rail, and `IdleSignOut`, which asks "Still there?" a minute before and signs out once Keystone has sat unused for the session's `idleMs`. Nothing without `Platform.session` |
| `src/App.tsx` | The provider tree, used by the app's `main.tsx` and by its tests |
| `src/components.tsx` | Building blocks for screens: `LineEditor` (amounts, or `pricing="unit"` for quantity × unit price), `Workspace`, `FormCard`, `ConnectorShortcut` (a connected system's logo, which opens it), `Feed` |
| `src/documents.tsx` | Building blocks for printed documents: `Sheet` (always laid out at the paper's width, `PAPER_WIDTH`, and scaled down on screen to fit its column, so the preview, the print and the PDF are one layout; `fit="page"` prints it scaled to one page; `fit="halves"` lays it out twice on a whole A4, `PAGE_WIDTH` wide, a copy on each half 6 mm in from the edges, with a dashed line across the middle to cut along), `Letterhead` (the APG logo made for paper, `@keystone/ui/logo-paper.png`, and the company as Company Details keeps it, with an optional date; `nameOnly` keeps the company's name alone, beside the logo on one line, as the check voucher does; otherwise its name, address and contact run under the logo), `Meta`, `Lines` (the document chooses its columns; `amountColumn`), `Signatures` |
| `src/output.ts` | `savePdf` and `printElement`: the element on screen is the one printed; a `fit="page"` sheet is scaled to fit one A4 page; a `fit="halves"` sheet prints with no page margin (so no browser header either), each copy fitted to exactly half the page |
| `src/platform.ts` | The `Platform` interface the app implements for Tauri and for the browser, and for the records in the cloud: who is signed in (`who`), signing out (`session`) and the members, making their accounts, removing them and changing your password (`accounts`) |

Tests in `test/`: the registry and services (`registry.test.ts`), the store (`runtime.test.ts`), the connector
shortcut (`shortcut.test.tsx`), the update notice (`update-notice.test.tsx`), signing out (`session.test.tsx`) and screens
coming soon (`coming-soon.test.tsx`), against an in-memory platform
(`fakes.ts`). `test/setup.ts` is the shared jsdom setup every
package's tests use (`vitest.shared.ts`).

When two parts need the same thing, it moves here (Keystone-specific) or to `@keystone/ui` (generic).
