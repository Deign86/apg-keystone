import { FeedbackProvider } from '@keystone/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeystoneProvider } from '../src/context';
import { InstallNotice } from '../src/InstallNotice';
import type { AppInstaller, InstallWay, Platform } from '../src/platform';
import { buildRegistry } from '../src/registry';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

// The web app's install hint in the rail (docs/adr/0047), against a stand-in for the browser's install support.

afterEach(cleanup);

/** An installer whose way the test changes, as the browser does when it offers its dialog or Keystone is installed. */
function installerAt(start: InstallWay | null, accepted = true) {
  let way = start;
  const watchers = new Set<() => void>();

  const changed = () => {
    for (const f of watchers) f();
  };

  const installer: AppInstaller & { set(next: InstallWay | null): void } = {
    way: () => way,
    watch: (f) => {
      watchers.add(f);

      return () => { watchers.delete(f); };
    },
    prompt: vi.fn(async () => {
      if (accepted) way = null;
      changed();

      return accepted;
    }),
    set(next) {
      way = next;
      changed();
    },
  };

  return installer;
}

async function mount(platform: Partial<Platform>) {
  const store = await KeystoneStore.open({ ...memoryPlatform().platform, ...platform });

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([], [])}>
        <InstallNotice />
      </KeystoneProvider>
    </FeedbackProvider>,
  );
}

describe('the install hint', () => {
  it('offers the browser\'s dialog, opens it on a press, and goes once Keystone is installed', async () => {
    const installer = installerAt('prompt');

    await mount({ installer });
    expect(screen.getByText('Keystone can open like an app on this device.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Install Keystone' })); });

    expect(installer.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Install Keystone' })).toBeNull();
  });

  it('says where an iPhone or iPad keeps it, and follows the browser when it offers its own dialog later', async () => {
    const installer = installerAt(null);

    await mount({ installer });
    expect(screen.queryByText(/like an app/)).toBeNull();

    act(() => installer.set('share-menu'));
    expect(screen.getByText('To open Keystone like an app, tap Share, then Add to Home Screen.')).toBeInTheDocument();

    act(() => installer.set('prompt'));
    expect(screen.getByRole('button', { name: 'Install Keystone' })).toBeInTheDocument();
  });

  it('shows nothing where Keystone cannot be installed from the page (the desktop app)', async () => {
    await mount({});

    expect(screen.queryByText(/like an app/)).toBeNull();
  });
});
