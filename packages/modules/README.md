# Modules

One package per screen, each in `packages/modules/<id>` and named `@keystone/module-<id>`. The list of installed
modules is `apps/keystone/src/modules.ts`, the only place modules are named together.

| Package | Rail | Owns | Contributes | Provides |
|---|---|---|---|---|
| `home/` | 0 | The kiosk-style front door | Nothing; it collects tiles, the finding and connector cards | |
| `overview/` | 1 | Summary for the CEO | Nothing; it collects figures, waiting items, the finding and "New …" buttons | |
| `vouchers/` | 2 | Check vouchers, their rules and the voucher document | figure, finding, waiting, create, stat, log tag `CV` | |
| `billing/` | 3 | Billing statements, their rules (VAT, EWT, payments) and the statement document | figure (lead), finding, waiting, create, stat, log tag `BS`, overdue on open | `billing.statement-payments` |
| `id-maker/` | 4 | Employee ID cards, their rules and the verification pattern | figure, finding, waiting, create, stat, log tag `ID`, expiry on open | |
| `directory/` | 5 | The directory screen (the records themselves are shared kernel, in core) | figure, stat, log tag `DIR` | |
| `activity/` | 6 | The audit trail | Nothing; its filters come from every module's `logTags` | |
| `connections/` | last | Connector settings, backup, restore and reset | Nothing | |

The website connector adds a `website` screen (rail 7). It settles statements through `billing.statement-payments`
and keeps working, without matching, when billing is not installed.

## Rules

- **Dependencies:** a module package depends on `@keystone/core`, `@keystone/ui` and `@keystone/kit` only, plus any
  third-party library it declares itself. Never on another module or a connector. `npm run check:boundaries` fails
  otherwise.
- **To show up elsewhere, contribute:** use the fields on `ModuleDef`. Don't edit Overview or Home.
- **To use another module's behaviour, ask for its service:** `useModuleApp().service<T>(SERVICES.x)`, and handle
  `undefined`. To offer one, add it to `SERVICES` in core and to your `ModuleDef.provides`.
- **To reach another screen:** `const app = useModuleApp(); app.has('x') && app.go('x')`.
- **Rules go in `src/rules.ts`,** as pure functions tested in `test/`. The screen only calls `run(...)`.
- **Forms:** keep the draft with `useDraft('<id>.draft', …)`, so another screen can prefill it through
  `app.setDraft('<id>.draft', …)`.
- **Removing a module:** delete its line in `apps/keystone/src/modules.ts` and its entry in
  `apps/keystone/package.json`. `apps/keystone/src/test/removal.test.tsx` covers every module listed there.

## Template

```
packages/modules/payroll/
  package.json        name, entry, dependencies
  tsconfig.json       extends the root config
  vitest.config.ts    only if it has tests
  README.md           Owns · Contributes · Needs · Removing it
  src/index.tsx       the screen and its ModuleDef
  src/rules.ts        its rules: pure functions over the state
  test/rules.test.ts
```

```json
{
  "name": "@keystone/module-payroll",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Payroll: cut-offs, payslips and the intern DTR.",
  "main": "src/index.tsx",
  "types": "src/index.tsx",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@keystone/core": "*", "@keystone/kit": "*", "@keystone/ui": "*", "react": "^18.3.1" }
}
```

```json
{ "extends": "../../../tsconfig.base.json", "include": ["src", "test"] }
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { partTest } from '../../../vitest.shared';

export default defineConfig({ test: partTest });
```

```tsx
// src/index.tsx
import { Panel, ScreenHeader } from '@keystone/ui';
import { useKeystone, type ModuleDef } from '@keystone/kit';

function Payroll() {
  const { state } = useKeystone();
  return (
    <>
      <ScreenHeader eyebrow="People" title="Payroll" line="The finding for this screen, from its rules." />
      <Panel>…</Panel>
    </>
  );
}

export const payrollModule: ModuleDef = {
  id: 'payroll',
  title: 'Payroll',
  section: 'People',
  blurb: 'Cut-offs, payslips and the intern DTR.',
  order: 7,
  onHome: true,
  // stat, figure, finding, waiting, openWaiting, create, logTags: { PAY: 'Payroll' }, onOpen
  // provides: { [SERVICES.payrollRuns]: payrollRuns }
  Screen: Payroll,
};
```

Then:
1. In `apps/keystone/src/modules.ts`, import `payrollModule` from `@keystone/module-payroll` and add it to the list.
2. In `apps/keystone/package.json`, add `"@keystone/module-payroll": "*"`.
3. Run `npm install` (links the package) and `npm run check`. The removal and contract tests pick it up on their own.
