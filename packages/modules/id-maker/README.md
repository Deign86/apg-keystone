# ID Maker

## Owns
- `src/index.tsx`: the register, the form, filling a card from an employee (photo included), choosing a photo (cropped
  square at 640px), Print, and Export print file.
- `src/IDCard.tsx`: the CR80 card, front and back, with the 21×21 verification pattern.
- `src/rules.ts`: its rules (numbering, issuing from an employee, expiry on open) and what it contributes;
  `src/verification.ts`: the verification pattern, identical to the prototype's `drawCode`. Tested in
  `test/rules.test.ts`.

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
