import { FeedbackProvider } from '@keystone/ui';
import { StrictMode } from 'react';
import { KeystoneProvider } from './context';
import type { Registry } from './registry';
import { Shell } from './Shell';
import type { KeystoneStore } from './store';

/** The whole app for a given registry: the same tree in production and in the removal tests. */
export function App({ store, registry }: { store: KeystoneStore; registry: Registry }) {
  return (
    <StrictMode>
      <FeedbackProvider>
        <KeystoneProvider store={store} registry={registry}>
          <Shell />
        </KeystoneProvider>
      </FeedbackProvider>
    </StrictMode>
  );
}
