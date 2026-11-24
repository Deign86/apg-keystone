# 0039. The lines on a paper are banded, white and gold

Status: Accepted · Date: 2026-11-24

## Context

Sir Mark wants each new line in a check voucher's particulars to change colour, white, gold, white, gold, so a line
reads across on its own, and the same on every paper that lists lines.

## Decision

- Kit's `paperStripe(i)` bands a row: the first white (`bg-paper`), the next the paper's gold tint (`bg-paper-tint`,
  the colour of the headings), and on. It is the one place the banding is decided.
- Every list of lines on a paper uses it: the check voucher's particulars, kit's `Lines` (the billing statement's
  charges and the fund transfer request's expenses) and the payroll sheet's employees. A paper that lists lines later
  uses `Lines` or `paperStripe`.
- Papers print their backgrounds (`print-color-adjust: exact`), so the bands print and export as shown.

## Consequences

The forms on screen are unchanged; only the papers are banded. Fixed boxes (the totals, the invoice box, the payslip's
figures) are not lists of lines and stay as they are.
