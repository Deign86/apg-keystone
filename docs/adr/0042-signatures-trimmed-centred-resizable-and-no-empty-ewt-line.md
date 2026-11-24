# 0042. Signatures are trimmed, centred and resizable, a statement prints no empty EWT line, and Enter adds a line

Status: Accepted · Date: 2026-11-24

## Context

- **Signatures printed at different sizes.** Each is kept scaled to fit 480 × 160 with its paper see-through
  (docs/adr/0038), but with the empty paper around the ink kept: a small signature on a big scan printed small, a
  large one large. They printed left-aligned on their line (centred only on the check voucher).
- **The CEO wants to resize a signature where a paper shows it,** once, for that person, on every paper.
- **A statement that withholds no EWT printed "Less: EWT (2%) —".** The leasing team wants no such line.
- **Particulars:** Enter in a line submitted the whole form; staff expect it to start the next line.

## Decision

- **A signature is trimmed to its ink** (kit's `trimSignature`, a small margin kept): on saving one in Company Details,
  and, for those kept before, when a paper first shows it (once per signature while Keystone is open; unchanged where
  the computer cannot read it). On every paper it is **centred on its line and drawn at one height** (3 rem) times its
  signatory's size.
- **A signatory's size is kept with the signatures,** `state.company.signatureSizes` (by the same key, 0.5 to 2; the
  standard keeps nothing), only by the CEO, as the signatures themselves are. The company module keeps the rule
  (`resizeSignature`) and publishes it as a service, `company.signature-sizes` (`SERVICES.signatureSizes`); the kit's
  `SignatureImage` asks for it and shows a resize handle on hover or focus where it may (drag, arrow keys, Home for the
  standard size). The handle never prints. Without the company module, or for staff, there is no handle. Removing a
  signature removes its size.
- **A billing statement prints its EWT line only when EWT is withheld.** VAT keeps its line with a dash, so a statement
  still says whether VAT was added.
- **Enter in the line editor** moves to the next line when the line is filled in, adding one after the last, and to the
  line's empty box when it is not; it never submits the form.

## Consequences

- Saved signatures need not be uploaded again; they are trimmed where they are shown.
- A statement saved before prints without the EWT line when it withheld none; its amounts do not change.
- Company Details (one owner-only record in the cloud) gains an optional field; `firestore.rules` is unchanged.
