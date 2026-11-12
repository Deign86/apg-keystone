import { AlertSheet, Button } from '@keystone/ui';
import { LogOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeystone } from './context';

// Signing out of the records in the cloud (docs/adr/0012): a button in the rail, and on its own once Keystone has sat
// unused for the session's idleMs, with a minute's warning first. Nothing shows without a sign-in.

/** How long before signing out by itself Keystone says so, with a way to stay. */
export const WARN_BEFORE_MS = 60_000;

/** How often it looks at the clock. A timer stops while the computer sleeps, so the time is read, never counted. */
export const LOOK_EVERY_MS = 1_000;

/** How often it tells the session it is in use, so a restart knows when it was last used. */
export const NOTE_USE_EVERY_MS = 30_000;

/** What counts as using Keystone. While the warning shows, only a key press or a click does. */
const USE = ['pointerdown', 'keydown', 'pointermove', 'wheel', 'scroll', 'touchstart'] as const;
const ANSWER = new Set(['pointerdown', 'keydown']);

/** Writes the last save, then signs out once, however many times it is asked. */
function useSignOut() {
  const { platform, store } = useKeystone();
  const session = platform.session;
  const leaving = useRef(false);

  return useCallback(async () => {
    if (!session || leaving.current) return;
    leaving.current = true;
    await store.flush();
    await session.signOut();
  }, [session, store]);
}

/** "Sign out" in the rail foot. */
export function SignOutButton() {
  const { platform } = useKeystone();
  const signOut = useSignOut();

  if (!platform.session) return null;

  return (
    <Button size="sm" kind="quiet" className="mt-1.5 -ml-2.5" onClick={() => void signOut()}>
      <LogOut size={13} aria-hidden="true" />
      Sign out
    </Button>
  );
}

/** Signs out after the session's idleMs without use, and asks "Still there?" for the last minute. */
export function IdleSignOut() {
  const { platform } = useKeystone();
  const session = platform.session;
  const signOut = useSignOut();
  const [left, setLeft] = useState<number | null>(null);
  const last = useRef(0);
  const warned = useRef(false);
  const stayButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!session) return;
    let noted = 0;

    const use = (e?: Event) => {
      if (e && warned.current && !ANSWER.has(e.type)) return;
      last.current = Date.now();

      if (last.current - noted >= NOTE_USE_EVERY_MS) {
        noted = last.current;
        session.used(last.current);
      }
    };

    const look = () => {
      const remaining = session.idleMs - (Date.now() - last.current);

      if (remaining <= 0) {
        clearInterval(timer);
        void signOut();

        return;
      }

      warned.current = remaining <= WARN_BEFORE_MS;
      setLeft(warned.current ? remaining : null);
    };

    use();

    for (const type of USE) window.addEventListener(type, use, { capture: true, passive: true });
    const timer = setInterval(look, LOOK_EVERY_MS);

    return () => {
      clearInterval(timer);

      for (const type of USE) window.removeEventListener(type, use, { capture: true });
    };
  }, [session, signOut]);

  const stay = () => {
    last.current = Date.now();
    warned.current = false;
    setLeft(null);
  };

  const seconds = Math.max(1, Math.ceil((left ?? 0) / 1000));

  return (
    <AlertSheet
      open={left !== null}
      title="Still there?"
      description={`Keystone has not been used for a while. It signs out in ${seconds} second${seconds === 1 ? '' : 's'} to keep APG's records safe.`}
      initialFocus={stayButton}
    >
      <Button kind="quiet" onClick={() => void signOut()}>Sign out now</Button>
      <Button ref={stayButton} kind="primary" onClick={stay}>Stay signed in</Button>
    </AlertSheet>
  );
}
