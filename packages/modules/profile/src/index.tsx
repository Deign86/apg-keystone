import { Button, Field, FieldMarks, FieldRow, Panel, ScreenHeader, TextInput, useConfirm, type Refusal } from '@keystone/ui';
import { useId, useState, type FormEvent } from 'react';
import { fieldsOf, roleLabel, sentenceOf, SERVICES, type Accounts, type Member, type PayoutAccount } from '@keystone/core';
import { useKeystone, useModuleApp, type ModuleDef } from '@keystone/kit';
import { bankChanged, checkBank, checkName, MAX_NAME, nameChanged, NO_SIGN_IN, TAG, ID } from './rules';

const NO_BANK: PayoutAccount = { bank: '', branch: '', name: '', number: '' };

/**
 * The bank account of whoever is signed in (docs/adr/0052), kept with their sign-in. Their requests for funds by
 * transfer start with it. Only they, and the CEO, can change it.
 */
function YourBank({ setBank, who }: { setBank: NonNullable<Accounts['setBank']>; who: Member }) {
  const { run, ctx } = useKeystone();
  const confirm = useConfirm();
  const [bank, setTyped] = useState<PayoutAccount>(() => ({ ...NO_BANK, ...who.bank }));
  const [error, setError] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const said = useId();
  const typed = (patch: Partial<PayoutAccount>) => setTyped({ ...bank, ...patch });

  const keep = async (next: PayoutAccount | null) => {
    setError(null);
    setBusy(true);

    try {
      const checked = next && checkBank(next, ctx);

      await setBank(checked);
      run((s, c) => bankChanged(s, checked, c));
      setTyped(checked ?? NO_BANK);
    } catch (err) {
      setError({ error: sentenceOf(err), fields: fieldsOf(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mt-4 max-w-xl">
      <form className="flex flex-col gap-3.5" aria-label="Your bank account" onSubmit={(e) => { e.preventDefault(); void keep(bank); }}>
        <div>
          <h2 className="m-0 font-display text-[15px] font-semibold">Your bank account</h2>
          <p className="m-0 mt-1 text-[13px] text-pretty text-ink-2">Your requests for funds paid by bank transfer start with this account. Only you and the CEO can change it.</p>
        </div>
        <FieldMarks refusal={error} describedBy={said}>
          <FieldRow>
            <Field name="bank" label="Bank"><TextInput placeholder="BDO" value={bank.bank} onChange={(v) => typed({ bank: v })} /></Field>
            <Field name="branch" label="Branch"><TextInput placeholder="Optional" value={bank.branch} onChange={(v) => typed({ branch: v })} /></Field>
          </FieldRow>
          <FieldRow>
            <Field name="accountName" label="Account name" hint="As the bank holds it."><TextInput capitalize value={bank.name} onChange={(v) => typed({ name: v })} /></Field>
            <Field name="number" label="Account number"><TextInput figures placeholder="0012 3456 7890" value={bank.number} onChange={(v) => typed({ number: v })} /></Field>
          </FieldRow>
        </FieldMarks>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {error
            ? <p id={said} role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error.error}</p>
            : <span className="mr-auto text-xs text-ink-2">{who.bank ? 'Saved with your sign-in.' : 'None saved yet.'}</span>}
          {who.bank && (
            <Button
              kind="danger"
              disabled={busy}
              onClick={() => confirm({ title: 'Remove your bank account?', body: 'Your next requests for funds by transfer start with the account your last one went to instead.', confirm: 'Remove', danger: true, onConfirm: () => void keep(null) })}
            >
              Remove…
            </Button>
          )}
          <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save bank account'}</Button>
        </div>
      </form>
    </Panel>
  );
}

const LINE = 'How Keystone shows you to everyone: in the rail, on what you prepare and file, and in the activity log.';

/** Whoever is signed in changing the name Keystone shows for them. */
function YourProfile({ accounts, who }: { accounts: Accounts; who: Member }) {
  const { run, ctx } = useKeystone();
  const app = useModuleApp();
  const [name, setName] = useState(who.name);
  const [error, setError] = useState<Refusal | null>(null);
  const said = useId();
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const next = checkName(name, ctx);

      // The rail shows the new name with the log line that says so.
      await accounts.rename(next);
      run((s, c) => nameChanged(s, who.name, next, c));
      setName(next);
    } catch (err) {
      setError({ error: sentenceOf(err), fields: fieldsOf(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="Profile" line={LINE} />
      <Panel className="max-w-xl">
        <form className="flex flex-col gap-3.5" aria-label="Your profile" onSubmit={(e) => void save(e)}>
          <FieldMarks refusal={error} describedBy={said}>
            <Field name="name" label="Your name" hint={`Your full name, up to ${MAX_NAME} characters. Everyone signed in sees it.`}>
              <TextInput capitalize autoComplete="name" value={name} onChange={setName} />
            </Field>
          </FieldMarks>
          <p className="m-0 text-[13px] text-ink-2">Role: <span className="font-semibold text-ink">{roleLabel(who)}</span>. Only the CEO changes roles.</p>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            {error
              ? <p id={said} role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error.error}</p>
              : <span className="mr-auto text-xs text-ink-2">Saved with your sign-in, on every computer and phone.</span>}
            <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save name'}</Button>
          </div>
        </form>
        {app.has('accounts') && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="m-0 text-[13px] text-ink-2">Your password is changed on User Accounts.</p>
            <Button size="sm" onClick={() => app.go('accounts')}>Open User Accounts</Button>
          </div>
        )}
      </Panel>
      {accounts.setBank && <YourBank setBank={accounts.setBank} who={ctx.who ?? who} />}
    </>
  );
}

function Profile() {
  const { ctx } = useKeystone();
  const accounts = useModuleApp().service(SERVICES.accounts);

  if (accounts && ctx.who) return <YourProfile accounts={accounts} who={ctx.who} />;

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="Profile" line={LINE} />
      <Panel>
        <p className="m-0 max-w-[68ch] text-[13px] text-pretty text-ink-2">{NO_SIGN_IN}</p>
      </Panel>
    </>
  );
}

export const profileModule: ModuleDef = {
  id: ID,
  title: 'Profile',
  blurb: 'Your name as Keystone shows it to everyone, and the bank account your requests for funds are paid into.',
  // First under Settings, before User Accounts.
  order: 88,
  logTags: { [TAG]: 'Profile' },
  Screen: Profile,
};
