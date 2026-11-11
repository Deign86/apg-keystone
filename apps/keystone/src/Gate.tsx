import { Button, Field, FeedbackProvider, Panel, TextInput } from '@keystone/ui';
import keystoneMark from '@keystone/ui/keystone-mark.png';
import { StrictMode, useState, type FormEvent, type ReactNode } from 'react';

// What shows before Keystone itself, when the build keeps its records in the cloud (docs/adr/0009): signing in, and
// the reason Keystone could not open. Nothing here knows Firebase; the composition root passes the actions in.

function Frame({ title, line, children }: { title: string; line: string; children: ReactNode }) {
  return (
    <StrictMode>
      <FeedbackProvider>
        <main className="grid min-h-dvh place-items-center bg-bg p-6 text-ink">
          <div className="w-full max-w-sm">
            <img src={keystoneMark} alt="" className="mb-5 size-10 object-contain" />
            <h1 className="m-0 text-2xl font-bold">{title}</h1>
            <p className="mt-1.5 mb-5 text-sm text-ink-2">{line}</p>
            {children}
          </div>
        </main>
      </FeedbackProvider>
    </StrictMode>
  );
}

/** Email and password for the company's records. `signIn` throws the sentence to show when they are refused. */
export function SignIn({ signIn }: { signIn: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Frame title="Sign in to Keystone" line="APG's records are kept in the cloud. Sign in with the account the owner made for you.">
      <Panel as="form" onSubmit={submit} className="flex flex-col gap-4" aria-label="Sign in">
        <Field label="Email">
          <TextInput type="email" value={email} onChange={setEmail} autoFocus />
        </Field>
        <Field label="Password" error={error ?? undefined}>
          <TextInput type="password" value={password} onChange={setPassword} />
        </Field>
        <Button kind="primary" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Panel>
    </Frame>
  );
}

/** Why Keystone could not open its records, with a way to try again and, when signed in, to switch accounts. */
export function StartFailed({ reason, onRetry, onSignOut }: { reason: string; onRetry: () => void; onSignOut?: () => void }) {
  return (
    <Frame title="Keystone could not open the records" line="Nothing was changed or saved.">
      <Panel>
        <p role="alert" className="m-0 text-sm">{reason}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button kind="primary" onClick={onRetry}>Try again</Button>
          {onSignOut && <Button kind="quiet" onClick={onSignOut}>Sign in as someone else</Button>}
        </div>
      </Panel>
    </Frame>
  );
}
