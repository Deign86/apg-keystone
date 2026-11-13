import { Button, Field, Panel, ScreenHeader, TextInput } from '@keystone/ui';
import { useState, type FormEvent } from 'react';
import type { Member } from '@keystone/core';
import { useKeystone, useModuleApp, type AppAccounts, type ModuleDef } from '@keystone/kit';
import { checkName, MAX_NAME, nameChanged, NO_SIGN_IN, roleLabel, TAG } from './rules';

const LINE = 'How Keystone shows you to everyone: in the rail, on what you prepare and file, and in the activity log.';

/** Whoever is signed in changing the name Keystone shows for them. */
function YourProfile({ accounts, who }: { accounts: AppAccounts; who: Member }) {
  const { run, store } = useKeystone();
  const app = useModuleApp();
  const [name, setName] = useState(who.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const next = checkName(name, store.ctx);

      await accounts.rename(next);
      // The rail shows the new name with the log line that says so.
      store.renamed(next);
      run((s, c) => nameChanged(s, who.name, next, c));
      setName(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="Profile" line={LINE} />
      <Panel className="max-w-xl">
        <form className="flex flex-col gap-3.5" aria-label="Your profile" onSubmit={(e) => void save(e)}>
          <Field label="Your name" hint={`Your full name, up to ${MAX_NAME} characters. Everyone signed in sees it.`}>
            <TextInput autoComplete="name" value={name} onChange={setName} />
          </Field>
          <p className="m-0 text-[13px] text-ink-2">Role: <span className="font-semibold text-ink">{roleLabel(who)}</span>. Only the owner changes roles.</p>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            {error
              ? <p role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error}</p>
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
    </>
  );
}

function Profile() {
  const { platform, ctx } = useKeystone();

  if (platform.accounts && ctx.who) return <YourProfile accounts={platform.accounts} who={ctx.who} />;

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
  id: 'profile',
  title: 'Profile',
  section: 'Settings',
  blurb: 'Your name as Keystone shows it to everyone.',
  // First under Settings, before User Accounts.
  order: 88,
  logTags: { [TAG]: 'Profile' },
  Screen: Profile,
};
