import { FeedbackProvider } from '@keystone/ui';
import type { SystemBridge } from '@keystone/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorShortcut } from '../src/components';
import { CONNECTOR_CHECK_EVERY_MS, KeystoneProvider } from '../src/context';
import { buildRegistry } from '../src/registry';
import { KeystoneStore } from '../src/store';
import { memoryPlatform, okConnector } from './fakes';

async function mount(connector = okConnector('attendance')) {
  const { platform } = memoryPlatform();
  const store = await KeystoneStore.open(platform);

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([], [connector])}>
        <ConnectorShortcut connector={connector} />
      </KeystoneProvider>
    </FeedbackProvider>,
  );

  return { platform, button: screen.getByRole('button', { name: `Open ${connector.name}` }) };
}

describe('a connected system’s shortcut', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is the app’s logo, named for the app, and hands the app only the operating system', async () => {
    const seen: SystemBridge[] = [];
    const { platform, button } = await mount(okConnector('attendance', { name: 'Attendance Tracker', logo: 'attendance-logo.png', open: async ({ system }) => { seen.push(system); } }));

    expect(button.querySelector('img')).toHaveAttribute('src', 'attendance-logo.png');
    expect(button).toHaveTextContent('Attendance Tracker');

    fireEvent.click(button);
    await act(async () => {});

    expect(seen).toHaveLength(1);
    expect(seen[0].platform).toBe(platform.platform);
    expect(Object.keys(seen[0]).sort()).toEqual(['arch', 'installFrom', 'latestRelease', 'launchApp', 'locateApp', 'openUrl', 'platform']);
  });

  it('says what the app did instead, and why it could not open', async () => {
    const { button } = await mount(okConnector('studio', { open: async () => 'Alpha Branding Studio is not on this computer, so its download page is open.' }));
    fireEvent.click(button);

    expect(await screen.findByText('Alpha Branding Studio is not on this computer, so its download page is open.')).toBeInTheDocument();
  });

  it('reports an app that does not answer instead of waiting for ever', async () => {
    vi.useFakeTimers();
    const { button } = await mount(okConnector('kiosk', { name: 'The kiosk', open: () => new Promise(() => {}) }));

    fireEvent.click(button);
    expect(button).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(screen.getByText('The kiosk did not answer within 15 seconds.')).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('while an installer downloads, says so under the logo and waits the minutes a download takes', async () => {
    vi.useFakeTimers();
    let arrived = () => {};

    const { button } = await mount(okConnector('id-maker-app', {
      name: 'Alpha Premier ID Maker',
      open: async ({ slow }) => {
        slow?.('Downloading Alpha Premier ID Maker 2.0.4…');
        await new Promise<void>((done) => { arrived = done; });

        return 'Its installer is open.';
      },
    }));

    fireEvent.click(button);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Downloading Alpha Premier ID Maker 2.0.4…');

    // Well past the 15 seconds an opening gets: still downloading, nothing reported.
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(button).toBeDisabled();
    expect(screen.queryByText(/did not answer/)).not.toBeInTheDocument();

    await act(async () => { arrived(); });
    expect(screen.getByText('Its installer is open.')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Alpha Premier ID Maker');
  });

  it('gives up on a download that never ends', async () => {
    vi.useFakeTimers();

    const { button } = await mount(okConnector('id-maker-app', { name: 'The ID Maker', open: ({ slow }) => { slow?.('Downloading…');

 return new Promise(() => {}); } }));

    fireEvent.click(button);
    await act(() => vi.advanceTimersByTimeAsync(20 * 60_000));

    expect(screen.getByText('The ID Maker did not answer within 20 minutes.')).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('offers a newer version of the app, and installs it when asked', async () => {
    const installed: string[] = [];
    await mount(okConnector('attendance', {
      name: 'Alpha Premier Attendance',
      update: async () => ({ version: '0.2.57', install: async () => { installed.push('0.2.57');

 return 'The installer for Alpha Premier Attendance 0.2.57 is open.'; } }),
    }));

    fireEvent.click(await screen.findByRole('button', { name: 'Update to 0.2.57' }));

    expect(await screen.findByText('The installer for Alpha Premier Attendance 0.2.57 is open.')).toBeInTheDocument();
    expect(installed).toEqual(['0.2.57']);
    expect(screen.queryByRole('button', { name: 'Update to 0.2.57' })).not.toBeInTheDocument();
  });

  it('offers nothing when the app is up to date, or the system has nothing to install', async () => {
    await mount(okConnector('attendance', { update: async () => null }));
    await mount(okConnector('website'));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /Update to/ })).not.toBeInTheDocument();
  });

  it('asks again every hour while it shows, so a version released after Home opened appears', async () => {
    vi.useFakeTimers();
    const out = [null, { version: '0.2.58', install: async () => {} }];
    let asked = 0;

    await mount(okConnector('attendance', { update: async () => out[Math.min(asked++, 1)] }));
    await act(async () => {});
    expect(asked).toBe(1);
    expect(screen.queryByRole('button', { name: /Update to/ })).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(CONNECTOR_CHECK_EVERY_MS - 1));
    expect(asked).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(asked).toBe(2);
    expect(screen.getByRole('button', { name: 'Update to 0.2.58' })).toBeInTheDocument();
  });

  it('a failed update check never disturbs the shortcut, keeps what it last found, and is noted for whoever looks', async () => {
    vi.useFakeTimers();
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let online = true;

    const { button } = await mount(okConnector('attendance', {
      name: 'Alpha Premier Attendance',
      update: async () => {
        if (!online) throw new Error('offline');

        return { version: '0.2.57', install: async () => {} };
      },
    }));

    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Update to 0.2.57' })).toBeInTheDocument();

    online = false;
    await act(() => vi.advanceTimersByTimeAsync(CONNECTOR_CHECK_EVERY_MS));

    expect(warned).toHaveBeenCalledWith('Keystone could not check Alpha Premier Attendance for an update; it tries again within the hour.', new Error('offline'));
    expect(screen.getByRole('button', { name: 'Update to 0.2.57' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('stops asking once it is gone from the screen', async () => {
    vi.useFakeTimers();
    let asked = 0;

    await mount(okConnector('attendance', { update: async () => { asked++;

 return null; } }));
    await act(async () => {});
    cleanup();
    await act(() => vi.advanceTimersByTimeAsync(3 * CONNECTOR_CHECK_EVERY_MS));

    expect(asked).toBe(1);
  });
});
