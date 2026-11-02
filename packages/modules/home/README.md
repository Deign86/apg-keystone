# Home

## Owns
The kiosk-style front door, shared with the attendance tracker: the clock, the Orbitron greeting, and the one finding.

## Contributes
Nothing. It collects:
- tiles from every module with `onHome` and `stat`;
- the finding, the highest `finding` among installed modules;
- a shortcut for every connected system, its app's logo (`@keystone/kit` › `ConnectorShortcut`).

## Needs
Nothing.

## Removing it
The rail starts at the next module, and the connected systems' shortcuts are no longer shown anywhere.
