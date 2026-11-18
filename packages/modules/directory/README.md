# Directory

## Owns
The screen for the master list of vendors, clients and employees. The records and their rules are shared kernel
(`@keystone/core` › `kernel/directory.ts`), because every document reads them. You can add and edit records (in a dialog), remove them (refused
while a document uses the record), filter by type, and search.

## Contributes
- **Overview:** the "Directory records" figure.
- **Home:** a tile.
- **Activity:** log tag `DIR`.
- **Tags:** linked records show each connector's `tag` (RFID, WEB).

It collects two contributions from the other modules: `refersTo` (a record one of them names shows that module's tag
under "Used by" and cannot be removed) and `selects` (the sentence after adding a record says where it can now be picked).

## Needs
Nothing.

## Removing it
Records can no longer be edited by hand. They still come in through connector imports, and vouchers, statements and
IDs keep reading them.
