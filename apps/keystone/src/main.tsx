import { FeedbackProvider } from '@keystone/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Connections } from './app/connections';
import { KeystoneProvider } from './app/context';
import { buildRegistry } from './app/registry';
import { Shell } from './app/Shell';
import { KeystoneStore } from './app/store';
import { plugins } from './connectors';
import { builtInModules } from './modules';
import { detectPlatform } from './platform';
import './styles.css';

async function start() {
  const platform = await detectPlatform();
  const registry = buildRegistry(builtInModules, plugins);
  for (const r of registry.refused) console.warn(`Keystone refused ${r.id}: ${r.reason}`);
  const [store, connections] = await Promise.all([
    KeystoneStore.open(platform),
    (async () => {
      const c = new Connections(platform, registry.connectors);
      await c.load();
      return c;
    })(),
  ]);
  connections.start();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <FeedbackProvider>
        <KeystoneProvider store={store} registry={registry} connections={connections}>
          <Shell />
        </KeystoneProvider>
      </FeedbackProvider>
    </StrictMode>,
  );
}

void start();
