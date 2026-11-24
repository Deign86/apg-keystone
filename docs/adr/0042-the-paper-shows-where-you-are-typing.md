# 0042. The paper shows where you are typing

Status: Accepted · Date: 2026-11-24

## Context

Every document screen shows its form beside a live paper (kit's `Workspace`). On a long form beside a full A4 page it
is hard to tell where on the paper the field being typed in prints. A person should see it as they click or tab into
the field, on every document screen, and the paper must print, export and lay out exactly as before.

## Decision

- The mechanism is the kernel's, written once in `@keystone/kit` (`src/parts.tsx`); modules only name parts.
- A form says which part of the paper its fields fill: `<Fills part="payee">…</Fills>` around a field or a group of
  them. It takes no room (`display: contents`).
- A paper says which part each element is: `const part = usePaperPart()`, then `<dd {...part('payee')}>`. The kit's
  blocks take the name too: `Meta`'s row, `Lines`' `part`, `Signatures`' signatory, and `Letterhead`, whose number is
  the part `no` and date `date`. Several elements may share a name; a two-up sheet marks both copies.
- `Workspace` follows focus in its form. While a field in `Fills` has focus, the paper's part carries
  `data-paper-active`; leaving the field, or focusing one that fills no part, clears it. Focus in a picker's list,
  which opens outside the form, keeps its field's part. The pinned preview scrolls at once (no motion) to bring the part
  to its middle; stacked or unpinned, nothing scrolls, so the field stays in view.
- The stylesheet draws the mark (`packages/ui/src/styles.css`): a 2px ring in the papers' gold, 2px out, as a focused
  control has. A shape, not only a colour; 3:1 or more on white paper and on the dark ID card. No glow: the house
  style keeps shadows for overlays. On screen only (`@media screen`), and left out while Export PDF draws the paper
  (`data-pdf-drawing`). An outline takes no room, so nothing on the paper moves.

## Consequences

A paper outside a `Workspace`, printed or exported is the same markup as before: the paper snapshots are unchanged.
Check Vouchers, Requests for Funds, Billing Statements, Statements of Account and the ID Maker mark their parts.
Payroll's papers have no form beside them (the sheet and payslips are worked out, not typed), so they mark nothing. A
new document screen wraps its fields in `Fills` and names its paper's parts; a field it does not wrap marks nothing.
