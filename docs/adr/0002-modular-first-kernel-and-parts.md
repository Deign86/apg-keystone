# 0002. Modular-first: a fixed kernel and removable parts

Status: Accepted · Date: 2026-10-31

## Context

Keystone will keep growing: more screens, and more APG systems to connect. The goal is that any screen or connected
system can be taken out without breaking the rest. See `docs/references/on-modular-architectures.md` for the reference
and principles.

## Decision

1. **A fixed kernel:** the core schema and state, the design system, the app shell and registries, and the platform
   layer.
2. **Removable parts:** core domains, modules (screens) and connectors (systems). A part never imports another part,
   and the kernel never imports a part.
3. **Contributions, not references.** Parts declare what they offer on `ModuleDef` or `Connector`, and the
   registry-built screens collect it. A hard dependency is declared with `requires`.
4. **Enforced in CI:** `scripts/check-boundaries.mjs` (boundaries) and `removal.test.tsx` (each part removed in turn).

## Consequences

- **Good:**
  - Adding a part is one folder plus one line; removing it is deleting the line.
  - Failures are contained to a single screen or connector card.
- **Cost:**
  - Shared code has to move into the kernel kit.
  - Overview's ordering is spread across the domains' finding priorities.
- **Still open:** parts are folders, not packages, and are compiled in. See trade-offs T2 and T3 in the reference.
