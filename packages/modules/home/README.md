# Home

## Owns
The kiosk-style front door, shared with the attendance tracker: the clock and the Orbitron greeting. Findings show on
Overview and at the top of the screen each belongs to, not on Home.

## Contributes
Nothing. It collects:
- tiles from every module with `onHome` and `stat`, handing each `stat` the installed modules (docs/adr/0021);
- a shortcut for every connected system, its app's logo, with "Update to …" under it when a newer version of the app
  is out (`@keystone/kit` › `ConnectorShortcut`, docs/adr/0035).

## Needs
Nothing.

## Removing it
The rail starts at the next module, and the connected systems' shortcuts are no longer shown anywhere.
