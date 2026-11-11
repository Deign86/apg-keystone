import { Button, EmptyState, Field, Panel, Register, ScreenHeader, Sheet, TextInput, type Column } from '@keystone/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useKeystone, type AppAccounts, type MemberAccount, type ModuleDef } from '@keystone/kit';
import {
  accountMade, accountsLine, checkAccount, CLOUD_ONLY, makesAccounts, membersInOrder, MIN_PASSWORD, newAccountDraft, NO_SIGN_IN, roleLabel,
  TAG,
} from './rules';

/** The owner's form for a new staff account: name, email and the password they first sign in with. */
function AccountForm({ accounts, members, onDone, onCancel }: {
  accounts: AppAccounts; members: MemberAccount[]; onDone: (made: MemberAccount) => void; onCancel: () => void;
}) {
  const { ctx, run } = useKeystone();
  const [d, setD] = useState(newAccountDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const made = await accounts.create(checkAccount(d, members, ctx));

      run((s, c) => accountMade(s, made, c));
      onDone(made);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3.5" aria-label="New account" onSubmit={(e) => void make(e)}>
      <Field label="Name" hint="As Keystone shows them: who asked for funds, who is signed in.">
        <TextInput autoFocus autoComplete="off" value={d.name} onChange={(name) => setD({ ...d, name })} />
      </Field>
      <Field label="Email" hint="They sign in with it.">
        <TextInput type="email" autoComplete="off" value={d.email} onChange={(email) => setD({ ...d, email })} />
      </Field>
      <Field label="Password" hint={`At least ${MIN_PASSWORD} characters. Give it to them yourself; Keystone does not send it.`}>
        <TextInput type="password" autoComplete="new-password" value={d.password} onChange={(password) => setD({ ...d, password })} />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error
          ? <p role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error}</p>
          : <span className="mr-auto text-xs text-ink-2">A staff account.</span>}
        <Button onClick={onCancel}>Cancel</Button>
        <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Making account…' : 'Make account'}</Button>
      </div>
    </form>
  );
}

/** Who can open the records in the cloud, and, for the owner, making an account for a new staff member. */
function Members({ accounts }: { accounts: AppAccounts }) {
  const { ctx } = useKeystone();
  const [members, setMembers] = useState<MemberAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const owner = makesAccounts(ctx);

  const read = useCallback(async () => {
    try {
      setMembers(await accounts.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [accounts]);

  useEffect(() => { void read(); }, [read]);

  const columns: Column<MemberAccount>[] = [
    {
      key: 'name', header: 'Name',
      cell: (m) => <span title={m.name}>{m.name}{m.uid === ctx.who?.uid && <span className="text-ink-2"> (you)</span>}</span>,
    },
    { key: 'email', header: 'Email', cell: (m) => (m.email ? <span title={m.email}>{m.email}</span> : <span className="text-ink-3">—</span>) },
    { key: 'role', header: 'Role', width: 96, cell: (m) => roleLabel(m) },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Settings"
        title="User Accounts"
        line={accountsLine(members, ctx)}
        actions={owner && <Button kind="primary" disabled={!members} onClick={() => setMaking(true)}>Make account</Button>}
      />
      <Panel>
        {error && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p role="alert" className="m-0 text-[13px] text-pretty text-bad">{error}</p>
            <Button size="sm" onClick={() => void read()}>Try again</Button>
          </div>
        )}
        <Register
          label="User accounts"
          columns={columns}
          rows={membersInOrder(members ?? [])}
          rowKey={(m) => m.uid}
          empty={<EmptyState text={members ? 'No accounts yet.' : 'Reading the accounts…'} />}
        />
      </Panel>
      <Sheet
        open={making}
        onOpenChange={(o) => !o && setMaking(false)}
        title="Make account"
        description="A staff account opens APG's records, and files and reads its own requests for funds. Only the owner decides them."
      >
        {making && members && (
          <AccountForm
            accounts={accounts}
            members={members}
            onCancel={() => setMaking(false)}
            onDone={(made) => { setMembers([...members, made]); setMaking(false); }}
          />
        )}
      </Sheet>
    </>
  );
}

function Accounts() {
  const { platform } = useKeystone();

  if (platform.accounts) return <Members accounts={platform.accounts} />;

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="User Accounts" line={NO_SIGN_IN} />
      <Panel>
        <p className="m-0 max-w-[68ch] text-[13px] text-pretty text-ink-2">{CLOUD_ONLY}</p>
      </Panel>
    </>
  );
}

export const accountsModule: ModuleDef = {
  id: 'accounts',
  title: 'User Accounts',
  section: 'Settings',
  blurb: 'Who can open APG’s records, and the owner making an account for each staff member.',
  // First under Settings, before Data and Bank Accounts.
  order: 89,
  logTags: { [TAG]: 'User Accounts' },
  Screen: Accounts,
};
