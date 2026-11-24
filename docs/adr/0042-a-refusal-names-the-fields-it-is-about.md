# 0042. A refusal names the fields it is about, and the form marks them

Status: Accepted · Date: 2026-11-24

## Context

- **A refused save said why only at the foot of the form.** A rule threw `KeystoneError('Enter the client.')`, the
  store's `run()` handed back `{ ok: false, error }`, and the screen wrote the sentence next to the save button. On a
  long form (a Statement of Account, a voucher with many particulars) the field was often out of sight, and nothing
  on screen, or for a screen reader, said which field the sentence was about.
- **Only the rule knows which field it refused.** The screen could guess from the sentence, but that would put a
  rule's knowledge in a screen (AGENTS.md › rule 7) and break the day the wording changes.
- **The words stay the rules'** (AGENTS.md › Copy): whatever marks a field must reuse the rule's sentence, not
  write its own.

## Decision

- **`KeystoneError` carries the fields it is about:** `new KeystoneError('Enter the client.', 'client')`, read back as
  `fields` (none by default). A field is named by its key in the module's draft (`client`, `sqm`, `depositMonths`);
  a line's cell as `lines.<index>.<desc|qty|amount>`, the index of the line as it shows on screen. A refusal about
  no one field (a number already used, a record gone, a status, a permission) names none and stays a sentence.
- **`run()` passes them on:** a refused `Outcome` is `{ ok: false, error, fields }`; anything else thrown has no
  fields. Core's `fieldsOf(cause)` reads them off whatever was thrown, for screens that call the platform themselves.
- **The form marks them, by name, in the design system:** `Field` and `CellInput` take a `name`; `FieldMarks` (ui)
  marks each named one invalid (`aria-invalid`, the red border), says the sentence under a field and ties it with
  `aria-describedby` (a line's cell, too small for it, points at the form's sentence instead), moves the focus to the
  first marked one on the form and scrolls it into view. Editing a field clears its mark; the next refusal marks
  afresh. `FormCard` does this for every form built on it, given the refused outcome as its `error`; a dialog wraps
  its own fields in `FieldMarks`. The kit's `LineEditor`, `SignatoryPicker` and `BankAccountPicker` name their fields.
- **Each module names its fields in its own `src/rules.ts`,** and its rules tests assert them (`refusalOf` in
  `@keystone/kit/testing`).

## Consequences

- A screen keeps the whole refusal (`setError(r)`), not only its sentence. A plain sentence still works everywhere
  a refusal does, and marks nothing.
- The field names are a contract between a module's rules and its screen, both in the same package. A name the
  screen does not render marks nothing, and the sentence at the foot still says why: a missing name degrades to the
  old behaviour, never to a crash.
- Nothing about the saved state, the cloud layout or any service changes.
