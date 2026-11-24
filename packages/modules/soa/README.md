# Statements of Account

## Owns
- `src/index.tsx`: the register of saved statements (open one into the form, Remove… asks first), the form, Print, and
  Export PDF.
- `src/SoaPaper.tsx`: the printed Statement of Account, the company's form set upright on one A4 page (the form itself
  is drawn on its side) under the letterhead every paper carries (docs/adr/0038): Client, Property address, Lease terms,
  Payee and the contract commencement, then four parts, each with its working shown:
  1. **Breakdown:** Particulars · Sqm · Rate · Computation · Amount. Base rent = floor area × rate per sqm; 12% VAT on
     the base rent; less 5% EWT on the base rent; monthly rent = base + VAT − EWT.
  2. **Deposit and advance:** Description · Amount · Qty · Total amount · Coverage · Check no. The security deposit is
     months of base rent, the advance months of the monthly rent; the reservation already paid is taken off. Total due
     on signing.
  3. **Lease term and escalation:** each lease year's dates and its rent. The base rent rises by the escalation each
     year from the second, on the year before's, and VAT and EWT follow it.
  4. **Postdated checks:** No. · Check date · Bank · Check number · Amount · Payment for. One check a month from the
     month after the advance (or the month set), dated on the set day of the month it pays (the 28th to start, cut to
     the month's last day), for that month's rent in its lease year. Check numbers count on from the first.
- `src/rules.ts`: the computation, numbering (`SOA-2026-001`, running within the year), saving, and the saved data
  under `state.ext.soa`. A refused save names the fields it is about (`client`, `sqm`, `depositMonths`…), which the
  form marks and focuses (docs/adr/0042). Tested in `test/rules.test.ts`.

## Contributes
- **Home:** a tile, with the number saved.
- **Overview:** the "New statement of account" button.
- **Activity:** log tag `SOA`.
- **Draft key:** `soa.draft`.
- **Save draft:** the form's work kept with the records, listed under Drafts above the register, opened again or
  deleted; saving the statement for real finishes it (docs/adr/0041). A draft has no number: it takes the next one when
  it is saved.

## Needs
Nothing from another part.

## Removing it
The above disappear. Saved statements stay in `state.json` under `ext.soa`.
