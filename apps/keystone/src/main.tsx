import { createRoot } from 'react-dom/client';
import { App, buildRegistry, KeystoneStore } from '@keystone/kit';
import { plugins } from './connectors';
import { builtInModules } from './modules';
import { detectPlatform } from './platform';
import './styles.css';

// The composition root: with modules.ts and connectors.ts, the only place that names every part.
async function start() {
  const platform = await detectPlatform();
  const registry = buildRegistry(builtInModules, plugins);

  for (const r of registry.refused) console.warn(`Keystone left out ${r.id}: ${r.reason}`);
  const store = await KeystoneStore.open(platform, registry.modules.flatMap((m) => (m.onOpen ? [m.onOpen] : [])));

  // A change is written 250 ms after it is made. Hiding or leaving the page (a reload, closing the window) writes it
  // at once, so a save made just before is not lost.
  addEventListener('pagehide', () => void store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });
  createRoot(document.getElementById('root')!).render(<App store={store} registry={registry} />);
}

void start();
