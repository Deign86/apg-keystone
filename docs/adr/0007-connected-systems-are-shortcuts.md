# 0007. Connected systems are shortcuts to their apps

Status: Accepted · Date: 2026-11-02

## Context

- **Each connected system had a full card on Home**, with:
  - a health badge and live figures;
  - an update check and a Download latest button;
  - an import into the Directory;
  - its own settings (the kiosk's LAN address, a viewer token, the website's admin password in the keychain).
- **The website also brought a screen of its own**, matching payments reported online to statements.
- **That was a second front end to apps that already have their own.** People asked for the cards to be simply a
  way to open each app: its logo, nothing else.

## Decision

- **A connector is a shortcut.** It has an id, a name, its app's logo and `open(env)`; `env` holds only the
  operating system (`system`: find an installed app, start it, open a URL).
- **The two desktop apps** (attendance, Branding Studio) open with `openDesktopApp` in core. It starts the
  installed app, and opens the app's latest release page when it is not on this computer.
- **The website** opens its admin portal in the browser.
- **Removed:**
  - from the contract: settings, health, figures, actions and people imports;
  - from the kit: the connector runtime (`Connections`);
  - the Website screen;
  - from the Platform interface: HTTP, the keychain and per-connector settings;
  - on the native side: the HTTP plugin, the keychain, and the folder and backup commands.
- **Renamed:** with no settings left to hold, the Connections screen is now **Data** (back up, restore, reset).

Supersedes [0004](0004-integrate-through-what-systems-expose.md): Keystone no longer reads anything from the other
systems.

## Consequences

- **Good:**
  - Home shows the three apps as three logos.
  - Keystone keeps no passwords and makes no network calls of its own; only its updater does.
  - Each connector is a few lines.
- **Cost:**
  - No live attendance figures, update checks for the other apps, or employee import.
  - No website payment matching.
  - People and photos are added in the Directory and ID Maker by hand.
- **Unchanged:**
  - Records already linked to a system keep their tag in the Directory.
  - Billing still provides the statement-payments service for any future part.
