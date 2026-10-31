import { FeedbackProvider } from '@keystone/ui';
import { StrictMode } from 'react';
import type { Connections } from './connections';
import { KeystoneProvider } from './context';
import type { Registry } from './registry';
import { Shell } from './Shell';
import type { KeystoneStore } from './store';

/** The whole app for a given registry: the same tree in production and in the removal tests. */
export function App({ store, registry, connections }: { store: KeystoneStore; registry: Registry; connections: Connections }) {
  return (
    <StrictMode>
      <FeedbackProvider>
        <KeystoneProvider store={store} registry={registry} connections={connections}>
          <Shell />
        </KeystoneProvider>
      </FeedbackProvider>
    </StrictMode>
  );
}
