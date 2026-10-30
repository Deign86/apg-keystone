# Modules

One folder per screen. `index.ts` is the list, and the only place modules are named together.

| Module | Rail | Owns | Contributes |
|---|---|---|---|
| `home/` | 0 | The kiosk-style front door | Nothing; it collects tiles, the finding and connector cards |
| `overview/` | 1 | Summary for the CEO | Nothing; it collects figures, waiting items, the finding and "New …" buttons |
| `vouchers/` | 2 | Check vouchers and the voucher document | figure, finding, waiting, create, stat, log tag `CV` |
| `billing/` | 3 | Billing statements and the statement document | figure (lead), finding, waiting, create, stat, log tag `BS`, overdue on open |
| `id-maker/` | 4 | Employee ID cards (front, back, verification pattern) | figure, finding, waiting, create, stat, log tag `ID`, expiry on open |
| `directory/` | 5 | Vendors, clients and employees | figure, stat, log tag `DIR` |
| `activity/` | 6 | The audit trail | Nothing; its filters come from every module's `logTags` |
| `connections/` | last | Connector settings, backup, restore and reset | Nothing |

The website connector adds a `website` screen (rail 7) that `requires: ['billing']`.

## Rules

- **Imports:** a module imports only `@keystone/core`, `@keystone/ui`, `../../app/*`, packages, and files in its own
  folder.
- **To show up elsewhere, contribute:** use the fields on `ModuleDef`. Don't edit Overview or Home.
- **To reach another screen:** `const app = useModuleApp(); app.has('x') && app.go('x')`.
- **Forms:** keep the draft with `useDraft('<id>.draft', …)`, so another screen can prefill it through
  `app.setDraft('<id>.draft', …)`.
- **Removing a module:** delete its line in `index.ts`. `src/test/removal.test.tsx` covers every module listed there.

## Template

```tsx
// modules/payroll/index.tsx
import { Panel, ScreenHeader } from '@keystone/ui';
import { useKeystone } from '../../app/context';
import type { ModuleDef } from '../../app/registry';

function Payroll() {
  const { state } = useKeystone();
  return (
    <>
      <ScreenHeader eyebrow="People" title="Payroll" line="The finding for this screen, from @keystone/core." />
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
  // requires: ['directory'],
  // stat, figure, finding, waiting, openWaiting, create, logTags: { PAY: 'Payroll' }, onOpen
  Screen: Payroll,
};
```

Then add `payrollModule` to `index.ts`, and write `modules/payroll/README.md` with the headings Owns, Contributes,
Needs, Removing it.
