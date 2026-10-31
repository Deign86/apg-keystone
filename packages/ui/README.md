# @keystone/ui

The APG design system: the look shared with the attendance tracker and the website admin, as React components.

- `src/theme.css`: **generated** from `shared/design/tokens.json` by `npm run sync` (Tailwind `@theme` plus Orbitron
  and Poppins). Never edit it by hand.
- `src/styles.css`: base styles, the brand's eyebrow and input chrome, the print stylesheet, and the fixed z-index
  scale.
- `src/primitives.tsx`: `Button`, `Panel`, `ScreenHeader`, `Eyebrow`, `SectionLabel`, `KeyBadge`, `StatusPill`, `Tag`,
  `EmptyState`, `FigureStrip`, `cn`.
- `src/fields.tsx`: `Field`, `TextInput`, `CellInput`, `TextArea`, `SelectInput`, `Checkbox`, `FieldRow`, all built
  on Base UI's `Field` so every control is labelled.
- `src/register.tsx`: `Register` (a real table with keyboard-openable rows) and `RowMenu`.
- `src/overlays.tsx`: `FeedbackProvider`, `useNotify` (toasts), `useConfirm` (an alert dialog for anything
  destructive), `Sheet` (dialog).

## Rules

- It knows nothing of Keystone's rules: it depends on no Keystone package (checked by `npm run check:boundaries`).
  Any APG app could use it.
- It follows ui-skills' `baseline-ui`, `fixing-accessibility` and `fixing-motion-performance`, and Taste Skill's app
  rules (see `docs/DESIGN.md`). Base UI is the only primitive layer; don't mix in another.
- A component two Keystone modules need, but which is Keystone-specific, belongs in `@keystone/kit`,
  not here.
