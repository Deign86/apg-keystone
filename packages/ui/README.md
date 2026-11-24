# @keystone/ui

The APG design system: the look shared with the attendance tracker and the website admin, as React components.

- `src/theme.css`: **generated** from `shared/design/tokens.json` by `npm run sync` (Tailwind `@theme` plus Orbitron,
  Poppins, and Keystone Peso, the peso sign Poppins lacks, from `scripts/build-peso-font.py`). Never edit it by
  hand.
- `src/styles.css`: base styles, the brand's eyebrow and input chrome, the print stylesheet, and the fixed z-index
  scale.
- `src/primitives.tsx`: `Button`, `Panel`, `ScreenHeader`, `Eyebrow`, `SectionLabel`, `KeyBadge`, `StatusPill`, `Tag`,
  `EmptyState`, `FigureStrip`, `cn`.
- `src/fields.tsx`: `Field`, `TextInput`, `CellInput`, `TextArea`, `SelectInput`, `Checkbox`, `FieldRow`, all built
  on Base UI's `Field` so every control is labelled. `FieldMarks` marks the fields a refusal names (`Refusal`: the
  sentence and the `name`s of its fields): each turns red, is announced invalid and tied to the sentence until it is
  edited, and the first takes the focus and scrolls into view (docs/adr/0044).
- `src/register.tsx`: `Register` (a real table with keyboard-openable rows; a column marked `detail`, a breakdown it
  can do without, is left out while the table is too narrow to show every column whole; `current` marks the row open
  in the form beside it, `aria-current` and a gold line at its edge; `pageSize`, `PAGE_SIZE` for most, shows a long
  register a page at a time with Previous and Next, on the page of the current row; `group` folds two or more rows of
  one kind, such as vouchers to one payee, into a row that opens to show them, a page then counting folds) and `RowMenu`. Tested in
  `test/register.test.tsx`.
- `src/tabs.tsx`: `Tabs` (one screen split into views shown one at a time, on Base UI's `Tabs`: a row of tabs under a
  1px line, the shown one with a gold line under it, an optional muted note after each name; every panel stays
  mounted while hidden, so a register's page or a half-filled form is as it was on coming back; a change of tab made
  while the page is scrolled past them brings the tabs back into view).
- `src/overlays.tsx`: `FeedbackProvider`, `useNotify` (toasts), `useConfirm` (an alert dialog for anything
  destructive), `AlertSheet` (an alert dialog its owner opens and closes, with its own buttons), `Sheet` (dialog).

## Rules

- It knows nothing of Keystone's rules: it depends on no Keystone package (checked by `npm run check:boundaries`).
  Any APG app could use it.
- It follows ui-skills' `baseline-ui`, `fixing-accessibility` and `fixing-motion-performance`, and Taste Skill's app
  rules (see `docs/DESIGN.md`). Base UI is the only primitive layer; don't mix in another.
- A component two Keystone modules need, but which is Keystone-specific, belongs in `@keystone/kit`,
  not here.
