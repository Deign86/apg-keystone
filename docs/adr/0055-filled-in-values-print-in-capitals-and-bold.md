# 0055. What someone fills in prints in capitals and bold, and a row's boxes line up

Status: Accepted · Date: 2026-11-26

## Context

- **The ask:** "everything that requires an answer or is the one being filled up by the user, automatically all caps
  it and bold it" — for example Date filed in capitals and bold, Deadline bold — "and make sure this rule sticks across
  the entire system".
- **What there was:** each paper chose its own weight. Some values were bold (a voucher's boxes, Requested by), some
  medium (Date filed, Deadline, an address), and only a few were in capitals (a voucher's names, Bill to).
- **Also asked:** on the forms, a box beside a label that runs to two lines ("Payment reference / Transaction ID") sat
  lower than its neighbour's.

## Decision

- **One rule, in the kit:** `paperValue` (`font-bold uppercase`) is how a paper prints whatever someone typed or
  picked.
  - The shared blocks use it for every value: `Meta`, every line of `Lines`, and a signatory's name and position in
    `Signatures`.
  - Each module paper uses it for its own values:
    - the check voucher's boxes, particulars and signatories;
    - the billing statement's Bill to, address, TIN, Attention, invoice and due dates, mode of payment and notes;
    - the statement of account's details at the top, notes, coverage, check numbers and banks;
    - the acknowledgement receipt's remarks, mode ticked and date received;
    - the fund transfer request, which is all kit blocks.
- **What it does not touch:** labels and headings, and what the paper works out itself, such as totals, VAT, the rent
  schedule and the amount in words.
- **Display only:** the capitals are CSS. What is saved stays as typed, and Export PDF draws the capitals too
  (`paper-pdf.ts` reads `text-transform`).
- **Receipts:** the receiver is whoever takes the payment, typed in, so the receipt has no e-signature option. Its
  line is always signed by hand.
- **A row's boxes line up:** in a `FieldRow`, a `Field` lays its label, box and hint on the row's grid (`subgrid`). A
  label that wraps moves the boxes beside it down with it. A field outside a row is unchanged.

## Consequences

- **Good:**
  - Every paper reads the same way: the answers stand out from the labels and from what Keystone worked out.
  - A paper added later gets the rule by using the kit's blocks or `paperValue`.
- **Cost and limits:**
  - Long typed notes print in capitals and bold too. If a note reads better as typed, it can be exempted on its paper.
  - Tests that read a paper's text read it in capitals.
