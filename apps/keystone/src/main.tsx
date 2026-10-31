import { createRoot } from 'react-dom/client';
import { App, buildRegistry, Connections, KeystoneStore } from '@keystone/kit';
import { plugins } from './connectors';
import { builtInModules } from './modules';
import { detectPlatform } from './platform';
import './styles.css';

// The composition root: with modules.ts and connectors.ts, the only place that names every part.
async function start() {
  const platform = await detectPlatform();
  const registry = buildRegistry(builtInModules, plugins);

  for (const r of registry.refused) console.warn(`Keystone left out ${r.id}: ${r.reason}`);
  const connections = new Connections(platform, registry.connectors);

  const [store] = await Promise.all([
    KeystoneStore.open(platform, registry.modules.flatMap((m) => (m.onOpen ? [m.onOpen] : []))),
    connections.load(),
  ]);

  connections.start();
  createRoot(document.getElementById('root')!).render(<App store={store} registry={registry} connections={connections} />);
}

void start();
