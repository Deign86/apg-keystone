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
      <KeystoneProvider store={store} registry={buildRegistry([], [{ connector }])}>
        <ConnectorShortcut connector={connector} />
      </KeystoneProvider>
    </FeedbackProvider>,
  );

  return { platform, button: screen.getByRole('button', { name: `Open ${connector.name}` }) };
}

describe('a connected system’s shortcut', () => {
  afterEach(() => vi.useRealTimers());

  it('is the app’s logo, named for the app, and hands the app only the operating system', async () => {
    const seen: SystemBridge[] = [];
    const { platform, button } = await mount(okConnector('attendance', { name: 'Attendance Tracker', logo: 'attendance-logo.png', open: async ({ system }) => { seen.push(system); } }));

    expect(button.querySelector('img')).toHaveAttribute('src', 'attendance-logo.png');
    expect(button).toHaveTextContent('Attendance Tracker');

    fireEvent.click(button);
    await act(async () => {});

    expect(seen).toEqual([platform]);
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
});
