import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, Sheet, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useState } from 'react';
import { SERVICES, type BankAccount } from '@keystone/core';
import { useKeystone, type ModuleDef } from '@keystone/kit';
import {
  accountDraftOf, accountLabel, accountsOf, bankAccounts, banksLine, newAccountDraft, nextAccountId, removeAccount, saveAccount, TAG,
  type AccountDraft,
} from './rules';

function AccountForm({ draft, onDone }: { draft: AccountDraft; onDone: () => void }) {
  const { state, ctx, run } = useKeystone();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const r = run((s, c) => saveAccount(s, d, c));

    if (r.ok) onDone(); else setError(r.error);
  };

  return (
    <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <FieldRow>
        <Field label="Bank"><TextInput autoFocus value={d.bank} onChange={(bank) => setD({ ...d, bank })} /></Field>
        <Field label="Branch"><TextInput placeholder="Optional" value={d.branch} onChange={(branch) => setD({ ...d, branch })} /></Field>
      </FieldRow>
      <Field label="Account name" hint="As the bank holds it. Statements print it for the client."><TextInput value={d.name} onChange={(name) => setD({ ...d, name })} /></Field>
      <Field label="Account number"><TextInput figures value={d.number} onChange={(number) => setD({ ...d, number })} /></Field>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error
          ? <p role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error}</p>
          : <span className="mr-auto text-xs text-ink-2">{d.editing ? `Keeps ${d.editing}.` : `Gets ${nextAccountId(state, ctx)}.`}</span>}
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit">{d.editing ? 'Save changes' : 'Add account'}</Button>
      </div>
    </form>
  );
}

/** The company's bank accounts: a register, and a dialog to add or edit one. */
function Banks() {
  const { state, ctx, run } = useKeystone();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<AccountDraft | null>(null);
  const accounts = accountsOf(state, ctx);
  const add = () => setEditing(newAccountDraft());

  const columns: Column<BankAccount>[] = [
    { key: 'id', header: 'No.', width: 72, cell: (a) => <span className="font-semibold text-gold-bright tabular-nums">{a.id}</span> },
    { key: 'bank', header: 'Bank', width: 140, cell: (a) => <span title={a.bank}>{a.bank}</span> },
    { key: 'branch', header: 'Branch', width: 160, cell: (a) => (a.branch ? <span className="text-ink-2" title={a.branch}>{a.branch}</span> : <span className="text-ink-3">—</span>) },
    { key: 'name', header: 'Account name', cell: (a) => <span title={a.name}>{a.name}</span> },
    { key: 'number', header: 'Account number', width: 170, cell: (a) => <span className="tabular-nums">{a.number}</span> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Settings"
        title="Bank Accounts"
        line={banksLine(accounts)}
        actions={<Button kind="primary" onClick={add}>Add account</Button>}
      />
      <Panel>
        <Register
          label="Bank accounts"
          columns={columns}
          rows={accounts}
          rowKey={(a) => a.id}
          onOpen={(a) => setEditing(accountDraftOf(a))}
          actions={(a) => [
            { label: 'Edit…', onSelect: () => setEditing(accountDraftOf(a)) },
            {
              label: 'Remove…', danger: true,
              onSelect: () => confirm({
                title: `Remove ${a.id}?`,
                body: `${accountLabel(a)}, in the name of ${a.name}, is removed from Bank Accounts. Statements already issued keep the payment instructions written on them.`,
                confirm: 'Remove account',
                danger: true,
                onConfirm: () => run((s, c) => removeAccount(s, a.id, c)),
              }),
            },
          ]}
          empty={<EmptyState text="No bank accounts yet." action={<Button size="sm" kind="primary" onClick={add}>Add one</Button>} />}
        />
      </Panel>
      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.editing ? `Edit ${editing.editing}` : 'Add account'}
        description="Where the company pays checks from and asks clients to pay into."
      >
        {editing && <AccountForm key={editing.editing ?? 'new'} draft={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

export const banksModule: ModuleDef = {
  id: 'banks',
  title: 'Bank Accounts',
  section: 'Settings',
  blurb: 'The company’s bank accounts, for checks and for where clients pay.',
  order: 91,
  logTags: { [TAG]: 'Bank Accounts' },
  provides: { [SERVICES.bankAccounts]: bankAccounts },
  Screen: Banks,
};
