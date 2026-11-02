import { Button } from '@keystone/ui';
import { useEffect, useRef, useState } from 'react';
import { useKeystone } from './context';
import type { AppUpdate } from './platform';

/** As the attendance app does: the first check soon after start, then every 8 hours. */
export const FIRST_CHECK_MS = 4_000;
export const CHECK_EVERY_MS = 8 * 60 * 60 * 1000;

type UpdateState =
  | { step: 'idle' }
  | { step: 'ready'; update: AppUpdate }
  | { step: 'installing'; update: AppUpdate; done: number | null }
  | { step: 'failed'; update: AppUpdate; error: string };

/**
 * Keystone's version, and a newer one when it is out, in the rail. Checks quietly in the background (being offline
 * never interrupts work); installing writes the last save first, then the app restarts into the new version.
 * Shows nothing where the platform cannot update (the browser preview).
 */
export function UpdateNotice() {
  const { platform, store } = useKeystone();
  const updater = platform.updater;
  const [current, setCurrent] = useState<string | null>(null);
  const [state, setState] = useState<UpdateState>({ step: 'idle' });
  const installing = useRef(false);

  useEffect(() => {
    if (!updater) return;
    let live = true;

    updater.currentVersion().then((v) => { if (live) setCurrent(v); }, () => {});

    const look = async () => {
      if (installing.current) return;

      try {
        const update = await updater.check();

        if (live && update && !installing.current) setState({ step: 'ready', update });
      } catch (e) {
        console.warn('Keystone could not check for updates; it tries again later.', e);
      }
    };

    const first = setTimeout(look, FIRST_CHECK_MS);
    const every = setInterval(look, CHECK_EVERY_MS);

    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [updater]);

  if (!updater) return null;

  const install = async (update: AppUpdate) => {
    installing.current = true;
    setState({ step: 'installing', update, done: null });

    try {
      await store.flush();
      await update.install((done) => setState({ step: 'installing', update, done }));
    } catch (e) {
      installing.current = false;
      setState({ step: 'failed', update, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const update = state.step === 'idle' ? null : state.update;
  const notesUrl = update?.notesUrl;

  return (
    <div className="mb-3">
      {update && (
        <div role="status" className="mb-2 rounded-control border border-gold-soft bg-gold-tint p-2.5 text-ink">
          <p className="m-0 font-semibold">Keystone {update.version} is ready.</p>
          {state.step === 'installing' && (
            <p className="m-0 mt-1 text-ink-2">
              {state.done === 1 ? 'Installing. Keystone restarts by itself.' : `Downloading${state.done === null ? '…' : ` ${Math.round(state.done * 100)}%`}`}
            </p>
          )}
          {state.step === 'failed' && <p role="alert" className="m-0 mt-1 text-bad">The update did not install: {state.error}</p>}
          {state.step !== 'installing' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => void install(update)}>{state.step === 'failed' ? 'Try again' : 'Update and restart'}</Button>
              {notesUrl && <Button size="sm" kind="quiet" onClick={() => void platform.openUrl(notesUrl)}>What’s new</Button>}
            </div>
          )}
        </div>
      )}
      {current && <p className="m-0 text-[11px] text-ink-3">Keystone {current}</p>}
    </div>
  );
}
