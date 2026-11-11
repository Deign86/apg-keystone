import { createRoot } from 'react-dom/client';
import { App, buildRegistry, documentLayout, KeystoneStore, type Platform } from '@keystone/kit';
import { plugins } from './connectors';
import { SignIn, StartFailed } from './Gate';
import { builtInModules } from './modules';
import { detectPlatform } from './platform';
import { cloudPlatform } from './platform/cloud';
import { firebaseConfig, firebaseEmulators } from './platform/config';
import { cloudSession, unusedTooLong, webStorageLog } from './platform/session';
import './styles.css';

// The composition root: with modules.ts and connectors.ts, the only place that names every part.
async function start() {
  const root = createRoot(document.getElementById('root')!);
  const registry = buildRegistry(builtInModules, plugins);

  for (const r of registry.refused) console.warn(`Keystone left out ${r.id}: ${r.reason}`);
  let platform: Platform = await detectPlatform();
  let explain = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
  let signOut: (() => void) | undefined;
  let signedInAs: (() => Promise<Platform>) | undefined;

  // A build with a Firebase project keeps the records in the cloud, behind a sign-in (docs/adr/0009). The SDK is
  // loaded only then.
  const options = firebaseConfig(import.meta.env);

  if (options) {
    const { openFirebase } = await import('./platform/firestore');
    const layout = documentLayout(registry.modules);
    const cloud = openFirebase(options, firebaseEmulators(import.meta.env), layout);
    const local = platform;
    const session = cloudSession(() => cloud.signOut().then(() => location.reload()));

    // Last used here longer ago than Keystone may sit unused (closed, or the computer asleep): ask for the account again
    // (docs/adr/0012).
    if ((await cloud.signedIn()) && unusedTooLong(webStorageLog, Date.now())) await cloud.signOut();

    if (!(await cloud.signedIn())) {
      await new Promise<void>((signedIn) => root.render(<SignIn signIn={async (email, password) => {
        await cloud.signIn(email, password);
        session.used(Date.now());
        signedIn();
      }} />));
    }

    // Who is signed in decides what they read and may do (docs/adr/0011), so it is read before the records. The owner
    // makes everyone else's account from Keystone (docs/adr/0013).
    signedInAs = async () => ({ ...cloudPlatform(local, cloud.remote, layout, await cloud.member()), session, accounts: cloud.accounts });
    explain = cloud.explain;
    signOut = () => void session.signOut();
  }

  let store: KeystoneStore;

  try {
    if (signedInAs) platform = await signedInAs();
    store = await KeystoneStore.open(platform, registry.modules.flatMap((m) => (m.onOpen ? [m.onOpen] : [])));
  } catch (e) {
    console.error(e);
    root.render(<StartFailed reason={explain(e)} onRetry={() => location.reload()} onSignOut={signOut} />);

    return;
  }

  // A change is written 250 ms after it is made. Hiding or leaving the page (a reload, closing the window) writes it
  // at once, so a save made just before is not lost.
  addEventListener('pagehide', () => void store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });
  root.render(<App store={store} registry={registry} />);
}

void start();
