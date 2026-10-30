import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Connections } from './app/connections';
import { buildRegistry } from './app/registry';
import { KeystoneStore } from './app/store';
import { plugins } from './connectors';
import { builtInModules } from './modules';
import { detectPlatform } from './platform';
import './styles.css';

// The composition root: the only file that knows the full list of modules and connectors.
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
