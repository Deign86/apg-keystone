# Data

## Owns
- Back up and restore (restore asks first). There is nothing to reset to: Keystone has no sample data, only what was
  saved (docs/adr/0018). Restoring is how records kept elsewhere come in on purpose.
- The list of parts the registry left out, with their reasons.

## Contributes
Nothing.

## Needs
Nothing.

## Removing it
Nobody can back up or restore from inside Keystone; the saved data itself is untouched. A part the registry leaves
out is no longer listed anywhere.
