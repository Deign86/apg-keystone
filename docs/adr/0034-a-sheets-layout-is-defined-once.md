# 0034. A sheet's layout is defined once, and a paper composes its own letterhead

Status: Accepted · Date: 2026-11-18

## Context

- The kit's `Sheet` took `fit="halves"` for the check voucher alone and `fit="page"` with `orientation="landscape"`
  for the payroll sheet alone, and `Letterhead` took `logo="companies"` and `beside` for the voucher alone.
  `output.ts` branched on the same values again to print and to save a PDF, and its comments named the two papers.
  `documents.tsx` was the most-changed file in the kernel: twelve commits, six of them with the voucher.
- An A4 page and its 12 mm margin were typed in `documents.tsx`, in `output.ts` and in the print stylesheet, and the
  data attributes the three talk through were strings in each.
- Printed papers are measured by the end-to-end suite in a real browser, so nothing a person sees may move.

## Decision

- **`packages/kit/src/paper.ts` holds the paper once:** `PAPER` (210 × 297 mm, 12 mm margin), what is left inside
  it, and the pixel sizes worked out from them; the marks a paper carries (`MARKS`); and one `PaperLayout` per way a
  sheet sits on the page: `UPRIGHT`, `LANDSCAPE_PAGE`, `TWO_UP`. A layout says its width, its `@page` rule, how the
  paper is fitted before printing and put back after, and how its PDF page is set up.
- **Three sheets, no props to switch them:** `Sheet`, `LandscapePage`, `TwoUp`. Each renders the same paper from its
  layout. `printElement` and `savePdf` read the layout back from the paper's marks and do what it says.
- **`Masthead` is the row a letterhead opens with.** `Letterhead` composes it with the APG logo and the company
  under it. The check voucher composes it itself, with the Group of Companies logo and the address beside it; that
  logo is the vouchers module's import now.
- **The stylesheet is tested against the constant**, not generated from it: a kit test reads `@page` and the marks
  from `packages/ui/src/styles.css`.
- **Each paper has a snapshot** of its markup and of what printing does to it
  (`packages/modules/*/test/paper.test.tsx`). The rearrangement left all of them identical.

## Consequences

- **Good:** a new way to lay a sheet out is one layout and one small component, not a branch in three files; the
  kit names no paper; a change to a paper's markup shows in its snapshot before CI measures it.
- **Cost and limits:**
  - A change that is meant to alter a paper's markup has to update its snapshot, and say so.
  - The voucher still draws its own boxes, line table and signature blocks instead of the kit's `Meta`, `Lines` and
    `Signatures`. Moving it would change its markup; it waits for a change that is allowed to.
  - `savePdf` is not exercised by a unit test (it needs a real canvas); the end-to-end suites export PDFs.
