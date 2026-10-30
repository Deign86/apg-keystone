# ID Maker

## Owns
- `index.tsx`: the register, the form, filling a card from an employee (photo included), choosing a photo (cropped
  square at 640px), Print, and Export print file.
- `IDCard.tsx`: the CR80 card, front and back, with the 21×21 verification pattern.
- Rules: `@keystone/core` › `domains/ids.ts`.

## Contributes
- **Overview:** the "IDs issued this month" figure, cards waiting to print in the waiting list, and the "New ID"
  button.
- **Finding:** "N IDs are waiting to be printed" (priority 10).
- **On open:** Active cards past their date become Expired.
- **Home:** a tile.
- **Activity:** log tag `ID`.
- **Draft key:** `id-maker.draft`.

## Needs
Nothing. Employees come from the directory when present. People imported by a connector (attendance, website) bring
their photo.

## Removing it
The above disappear. Saved cards stay in `state.json`.
