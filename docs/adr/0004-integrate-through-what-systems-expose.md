# 0004. Integrate other APG systems only through what they already expose

Status: Accepted · Date: 2026-10-30

## Context

- **The attendance tracker** serves read-only attendance on its office-network viewer. Its documented policy keeps
  the roster and photos off the network.
- **Branding Studio** accepts files at launch.
- **The website's admin API** has no tokens.

## Decision

Each connector uses only what its system already offers:
- **Attendance:** the LAN viewer, plus its `.apbackup` files for the roster and photos.
- **Branding Studio:** launching it with files, and its GitHub releases.
- **Website:** an ordinary admin session.

A change to another system is proposed in its own repo and decided by its owner. The first such proposal is
`docs/ATTENDANCE-INTEGRATION.md`.

## Consequences

- **Good:** nothing in the other systems had to change, and each keeps its own security rules.
- **Cost:** the roster is only as fresh as the latest backup, and the website integration depends on an admin account.
- **Next:** if the attendance owner accepts the integration endpoint, the attendance connector tries it first and
  falls back to the backup.
