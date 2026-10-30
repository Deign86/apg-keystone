# The app kernel

The parts of the app every module and connector may rely on. Nothing here imports a module or a connector
(`npm run check:boundaries`).

| File | What it does |
|---|---|
| `registry.ts` | `ModuleDef`, `ConnectorPlugin`, `ModuleApp`, and `buildRegistry`, which validates parts, applies `requires`, and leaves out anything broken, with a reason |
| `store.ts` | Holds the saved state, runs core rules (`run`), writes `state.json` about 250ms later, and runs modules' `onOpen` housekeeping |
| `connections.ts` | The connector runtime: settings, keychain secrets, health and figures on a schedule, and `safely()` (a deadline plus error capture for every call) |
| `context.tsx` | Hooks: `useKeystone`, `useModuleApp`, `useDraft`, `useConnectorStatus`, `useImportPeople`, `usePhoto` |
| `Shell.tsx` | The rail, ⌘/Ctrl+number navigation, and one error boundary per screen |
| `App.tsx` | The provider tree, used by `main.tsx` and by the removal tests |
| `kit.tsx` | Building blocks for modules: `LineEditor`, `Workspace`, `FormCard`, `ConnectorCard`, `Feed` |
| `documents.tsx` | Building blocks for printed documents: `Sheet`, `Letterhead`, `Meta`, `Lines`, `Signatures` |
| `output.ts` | `savePdf` and `printElement`: the element on screen is the one printed |

When two modules need the same thing, it moves here. A module never imports another module.
