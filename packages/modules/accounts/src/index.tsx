import { Button, EmptyState, Field, Panel, Register, ScreenHeader, Sheet, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useKeystone, type AppAccounts, type MemberAccount, type ModuleDef } from '@keystone/kit';
import {
  accountMade, accountRemoved, accountsLine, checkAccount, checkPasswordChange, checkRemoval, CLOUD_ONLY, makesAccounts, membersInOrder,
  MIN_PASSWORD, newAccountDraft, newPasswordDraft, NO_SIGN_IN, passwordChanged, removalQuestion, removeRefusal, roleLabel, TAG,
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

/** Anyone signed in changing their own password: the current one, then the new one twice. */
function PasswordForm({ accounts, onDone }: { accounts: AppAccounts; onDone: () => void }) {
  const { ctx, run } = useKeystone();
  const [d, setD] = useState(newPasswordDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { current, next } = checkPasswordChange(d, ctx);

      await accounts.changePassword(current, next);
      run((s, c) => passwordChanged(s, c));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3.5" aria-label="Change password" onSubmit={(e) => void change(e)}>
      <Field label="Current password">
        <TextInput type="password" autoFocus autoComplete="current-password" value={d.current} onChange={(current) => setD({ ...d, current })} />
      </Field>
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
        <TextInput type="password" autoComplete="new-password" value={d.next} onChange={(next) => setD({ ...d, next })} />
      </Field>
      <Field label="New password again">
        <TextInput type="password" autoComplete="new-password" value={d.again} onChange={(again) => setD({ ...d, again })} />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error
          // Narrower than the other forms' errors, so the longer Change password button keeps to the same row.
          ? <p role="alert" className="m-0 mr-auto max-w-[30ch] text-xs text-pretty text-bad">{error}</p>
          : <span className="mr-auto text-xs text-ink-2">You stay signed in here.</span>}
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Button>
      </div>
    </form>
  );
}

/** Who can open the records in the cloud; for the owner, making and removing staff accounts; for anyone, their password. */
function Members({ accounts }: { accounts: AppAccounts }) {
  const { ctx, run, notify } = useKeystone();
  const confirm = useConfirm();
  const [members, setMembers] = useState<MemberAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [changing, setChanging] = useState(false);
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

  const remove = async (m: MemberAccount) => {
    try {
      checkRemoval(m, ctx);
      await accounts.remove(m.uid);
      run((s, c) => accountRemoved(s, m, c));
      setMembers((ms) => ms && ms.filter((x) => x.uid !== m.uid));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

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
        actions={<>
          <Button onClick={() => setChanging(true)}>Change password</Button>
          {owner && <Button kind="primary" disabled={!members} onClick={() => setMaking(true)}>Make account</Button>}
        </>}
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
          rowLabel={(m) => m.name}
          // The owner removes staff accounts from a row's menu; owners and their own account have none.
          actions={owner ? (m) => (removeRefusal(m, ctx) ? [] : [{
            label: 'Remove…', danger: true,
            onSelect: () => confirm({
              title: `Remove ${m.name}?`, body: removalQuestion(m), confirm: 'Remove account', danger: true, onConfirm: () => void remove(m),
            }),
          }]) : undefined}
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
      <Sheet
        open={changing}
        onOpenChange={(o) => !o && setChanging(false)}
        title="Change password"
        description="The password you sign in to Keystone with, on every computer and phone."
      >
        {changing && <PasswordForm accounts={accounts} onDone={() => setChanging(false)} />}
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
  // Under Settings after Profile, before Data and Bank Accounts.
  order: 89,
  logTags: { [TAG]: 'User Accounts' },
  Screen: Accounts,
};
