import { FeedbackProvider } from '@keystone/ui';
import type { SystemBridge } from '@keystone/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorShortcut } from '../src/components';
import { KeystoneProvider } from '../src/context';
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

  it('offers a newer version of an app that cannot update itself, and installs it when asked', async () => {
    const installed: string[] = [];
    await mount(okConnector('id-maker-app', {
      name: 'Alpha Premier ID Maker',
      update: async () => ({ version: '2.0.5', install: async () => { installed.push('2.0.5');

 return 'The installer for Alpha Premier ID Maker 2.0.5 is open.'; } }),
    }));

    fireEvent.click(await screen.findByRole('button', { name: 'Update to 2.0.5' }));

    expect(await screen.findByText('The installer for Alpha Premier ID Maker 2.0.5 is open.')).toBeInTheDocument();
    expect(installed).toEqual(['2.0.5']);
    expect(screen.queryByRole('button', { name: 'Update to 2.0.5' })).not.toBeInTheDocument();
  });

  it('offers nothing for an app that updates itself, or when the check fails', async () => {
    await mount(okConnector('attendance'));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /Update to/ })).not.toBeInTheDocument();
  });

  it('a failed update check never disturbs the shortcut, and is noted for whoever looks', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { button } = await mount(okConnector('id-maker-app', { update: async () => { throw new Error('offline'); } }));
    await act(async () => {});

    expect(warned).toHaveBeenCalledWith('Keystone could not check id-maker-app for an update; it tries again when Home next opens.', new Error('offline'));

    expect(screen.queryByRole('button', { name: /Update to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
