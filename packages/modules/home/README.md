# Home

## Owns
The kiosk-style front door, shared with the attendance tracker: the status capsule, the clock, the Orbitron greeting,
and the one finding.

## Contributes
Nothing. It collects:
- tiles from every module with `onHome` and `stat`;
- the finding, the highest `finding` among installed modules;
- a card for every connector (`@keystone/kit` › `ConnectorCard`).

## Needs
Nothing.

## Removing it
The rail starts at the next module. Connector cards still appear, and still work, under Connections.
