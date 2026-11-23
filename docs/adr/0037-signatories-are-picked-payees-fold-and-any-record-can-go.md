# 0037. Signatories are picked from a list, the voucher register folds by payee, and a record in use can be removed

Status: Accepted · Date: 2026-11-23

## Context

- **Every signatory was typed** on vouchers, statements, IDs and Company Details, so the same person was spelled
  several ways from one document to the next.
- **A payee paid often filled the voucher register** with one row per voucher.
- **A directory record a document named could not be removed** (docs/adr/0003), so people who had left stayed listed.

## Decision

- **A signatory is picked from a list, or typed under Other…** (`SignatoryPicker` in `@keystone/kit`). The list is the
  directory's employees, Company Details' names, whoever is signed in and the names on the module's own saved documents,
  each once whatever its capitals (`signatoryNames` in core). Nothing is hardcoded (docs/adr/0018): empty records
  list only whoever is signed in, then Other…. Saved documents keep the names as they are; no field changes in the saved state.
- **The voucher register folds vouchers to one payee** into a row with their count and total, which opens to show them
  (`Register`'s `group`, `payeeKey` in the vouchers module). A payee is its name in capitals, letters and digits only.
  A page counts folds; the fold holding the voucher open in the form starts open.
- **A record a document names can be removed** once the confirmation says which records name it. Those records keep what
  was saved on them; one that names it only by its code (older vouchers and statements, IDs, timekeeping, payroll) shows
  the code from then on. `removeDirectoryRecord` still refuses it unless asked to remove it anyway.

## Consequences

- One spelling per person, picked rather than typed, on every signed document.
- A record removed while in use cannot be brought back, and older documents that named it by code lose its name.
