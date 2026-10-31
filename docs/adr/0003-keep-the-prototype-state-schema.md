# 0003. Keep the prototype's saved-state schema

Status: Accepted · Date: 2026-10-30

## Context

The web prototype stored everything in one JSON document (`dir`, `cv`, `bs`, `ids`, `log`). Modern modular-monolith
practice says each module should own its own data, which argues for splitting it.

## Decision

Keep the document as it is, so a prototype backup opens in any Keystone and the other way round.
- **Added fields** are optional.
- **New modules** keep their data under `state.ext[<module id>]`. The kernel keeps keys it doesn't recognise, so
  removing a module never deletes its data.
- **The directory** is a deliberate *shared kernel* (DDD), because every area refers to its records by code.

## Consequences

- **Good:** backups are compatible across versions, and the format stays simple.
- **Since the company's forms (2026-10-31):** vouchers no longer save `bank` or line accounts, statements no longer
  save `period` or `ref`, and invoice numbers read `010100-2026`. Those keys became optional, so every older file
  still loads in Keystone. The web prototype no longer reads newer files reliably: its voucher register breaks on a
  voucher without a bank, and it would number its next statement from the year. It is kept only for reference.
- **Cost:** the four older areas share one document. A domain can read data owned by another. The boundary check
  stops code from depending on another domain, but not data from being read.
- **What would change this:** a format version bump that moves the older areas under `ext`, each behind its own
  accessors.
