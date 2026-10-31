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
- **Cost:** the four older areas share one document. A domain can read data owned by another. The boundary check
  stops code from depending on another domain, but not data from being read.
- **What would change this:** a format version bump that moves the older areas under `ext`, each behind its own
  accessors.
