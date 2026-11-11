import { createRoot } from 'react-dom/client';
import { App, buildRegistry, KeystoneStore, type Platform } from '@keystone/kit';
import { plugins } from './connectors';
import { SignIn, StartFailed } from './Gate';
import { builtInModules } from './modules';
import { detectPlatform } from './platform';
import { cloudPlatform } from './platform/cloud';
import { firebaseConfig } from './platform/config';
import './styles.css';

// The composition root: with modules.ts and connectors.ts, the only place that names every part.
async function start() {
  const root = createRoot(document.getElementById('root')!);
  const registry = buildRegistry(builtInModules, plugins);

  for (const r of registry.refused) console.warn(`Keystone left out ${r.id}: ${r.reason}`);
  let platform: Platform = await detectPlatform();
  let explain = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
  let signOut: (() => void) | undefined;

  // A build with a Firebase project keeps the records in the cloud, behind a sign-in (docs/adr/0009). The SDK is
  // loaded only then.
  const options = firebaseConfig(import.meta.env);

  if (options) {
    const { openFirebase } = await import('./platform/firestore');
    const cloud = openFirebase(options);

    if (!(await cloud.signedIn())) {
      await new Promise<void>((signedIn) => root.render(<SignIn signIn={async (email, password) => { await cloud.signIn(email, password); signedIn(); }} />));
    }

    platform = cloudPlatform(platform, cloud.remote);
    explain = cloud.explain;
    signOut = () => void cloud.signOut().then(() => location.reload());
  }

  let store: KeystoneStore;

  try {
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
