import { Button, EmptyState, Field, FieldMarks, Panel, Register, ScreenHeader, Sheet, TextInput, useConfirm, type Column, type Refusal } from '@keystone/ui';
import { CANNOT_KEEP_GRANT, DASH, fieldsOf, sentenceOf, SERVICES, type Accounts, type MemberAccount, type MemberGrant } from '@keystone/core';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { memberGrants, useKeystone, useModuleApp, type ModuleDef } from '@keystone/kit';
import {
  accountMade, accountRemoved, accountsLine, checkAccount, grantAction, grantQuestion, grantRefusal, grantSet, grantTitle, hasGrant, checkPasswordChange, checkRemoval, CLOUD_ONLY, makesAccounts, membersInOrder,
  MIN_PASSWORD, newAccountDraft, newPasswordDraft, NO_SIGN_IN, passwordChanged, removalQuestion, removeRefusal, roleLine, TAG, ID,
} from './rules';

/** The CEO's form for a new staff account: name, email and the password they first sign in with. */
function AccountForm({ accounts, members, onDone, onCancel }: {
  accounts: Accounts; members: MemberAccount[]; onDone: (made: MemberAccount) => void; onCancel: () => void;
}) {
  const { ctx, run } = useKeystone();
  const [d, setD] = useState(newAccountDraft);
  const [error, setError] = useState<Refusal | null>(null);
  const said = useId();
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
      setError({ error: sentenceOf(err), fields: fieldsOf(err) });
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3.5" aria-label="New account" onSubmit={(e) => void make(e)}>
      <FieldMarks refusal={error} describedBy={said}>
        <Field name="name" label="Name" hint="As Keystone shows them: who asked for funds, who is signed in.">
          <TextInput capitalize autoFocus autoComplete="off" value={d.name} onChange={(name) => setD({ ...d, name })} />
        </Field>
        <Field name="email" label="Email" hint="They sign in with it.">
          <TextInput type="email" autoComplete="off" value={d.email} onChange={(email) => setD({ ...d, email })} />
        </Field>
        <Field name="password" label="Password" hint={`At least ${MIN_PASSWORD} characters. Give it to them yourself; Keystone does not send it.`}>
          <TextInput type="password" autoComplete="new-password" value={d.password} onChange={(password) => setD({ ...d, password })} />
        </Field>
      </FieldMarks>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error
          ? <p id={said} role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error.error}</p>
          : <span className="mr-auto text-xs text-ink-2">A staff account.</span>}
        <Button onClick={onCancel}>Cancel</Button>
        <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Making account…' : 'Make account'}</Button>
      </div>
    </form>
  );
}

/** Anyone signed in changing their own password: the current one, then the new one twice. */
function PasswordForm({ accounts, onDone }: { accounts: Accounts; onDone: () => void }) {
  const { ctx, run } = useKeystone();
  const [d, setD] = useState(newPasswordDraft);
  const [error, setError] = useState<Refusal | null>(null);
  const said = useId();
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
      setError({ error: sentenceOf(err), fields: fieldsOf(err) });
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3.5" aria-label="Change password" onSubmit={(e) => void change(e)}>
      <FieldMarks refusal={error} describedBy={said}>
        <Field name="current" label="Current password">
          <TextInput type="password" autoFocus autoComplete="current-password" value={d.current} onChange={(current) => setD({ ...d, current })} />
        </Field>
        <Field name="next" label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
          <TextInput type="password" autoComplete="new-password" value={d.next} onChange={(next) => setD({ ...d, next })} />
        </Field>
        <Field name="again" label="New password again">
          <TextInput type="password" autoComplete="new-password" value={d.again} onChange={(again) => setD({ ...d, again })} />
        </Field>
      </FieldMarks>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error
          // Narrower than the other forms' errors, so the longer Change password button keeps to the same row.
          ? <p id={said} role="alert" className="m-0 mr-auto max-w-[30ch] text-xs text-pretty text-bad">{error.error}</p>
          : <span className="mr-auto text-xs text-ink-2">You stay signed in here.</span>}
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Button>
      </div>
    </form>
  );
}

/** Who can open the records in the cloud; for the CEO, making and removing staff accounts; for anyone, their password. */
function Members({ accounts }: { accounts: Accounts }) {
  const { ctx, run, notify, registry } = useKeystone();
  // What the installed connected systems let the CEO give a staff member (Connector.memberGrant). None installed: none offered.
  const grants = memberGrants(registry.connectors);
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
      setError(sentenceOf(e));
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
      notify(sentenceOf(e), 'error');
    }
  };

  const setGrant = async (m: MemberAccount, g: MemberGrant, on: boolean) => {
    try {
      const refusal = grantRefusal(m, g, ctx);

      if (refusal || !accounts.setGrant) throw new Error(refusal ?? CANNOT_KEEP_GRANT);
      await accounts.setGrant(m.uid, g.field, on);
      const changed = run((s, c) => grantSet(s, m, g, on, c));

      if (changed.ok) setMembers((ms) => ms && ms.map((x) => (x.uid === m.uid ? changed.record : x)));
    } catch (e) {
      notify(sentenceOf(e), 'error');
    }
  };

  const columns: Column<MemberAccount>[] = [
    {
      key: 'name', header: 'Name',
      cell: (m) => <span title={m.name}>{m.name}{m.uid === ctx.who?.uid && <span className="text-ink-2"> (you)</span>}</span>,
    },
    { key: 'email', header: 'Email', cell: (m) => (m.email ? <span title={m.email}>{m.email}</span> : <span className="text-ink-3">{DASH}</span>) },
    { key: 'role', header: 'Role', width: 200, cell: (m) => roleLine(m, grants) },
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
          // The CEO removes staff accounts from a row's menu; owners and their own account have none.
          actions={owner ? (m) => (removeRefusal(m, ctx) ? [] : [...grants.flatMap((g) => (accounts.setGrant && !grantRefusal(m, g, ctx) ? [{
            label: `${grantAction(m, g)}…`,
            onSelect: () => confirm({
              title: grantTitle(m, g), body: grantQuestion(m, g), confirm: grantAction(m, g),
              onConfirm: () => void setGrant(m, g, !hasGrant(m, g)),
            }),
          }] : [])), {
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
        description="A staff account opens APG's records, and files and reads its own requests for funds. Only the CEO decides them."
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
  const accounts = useModuleApp().service(SERVICES.accounts);

  if (accounts) return <Members accounts={accounts} />;

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
  id: ID,
  title: 'User Accounts',
  blurb: 'Who can open APG’s records, and the CEO making an account for each staff member.',
  // Under Settings after Profile, before Data and Bank Accounts.
  order: 89,
  logTags: { [TAG]: 'User Accounts' },
  Screen: Accounts,
};
