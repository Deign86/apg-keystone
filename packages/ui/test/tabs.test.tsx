import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs } from '../src/tabs';

afterEach(cleanup);

function Screen({ start = 'list' }: { start?: 'list' | 'form' }) {
  const [view, setView] = useState(start);

  return (
    <Tabs
      label="Records"
      value={view}
      onChange={setView}
      tabs={[
        { value: 'list', label: 'Register', note: 3, panel: <p>The rows</p> },
        { value: 'form', label: 'Entry', note: 'New', panel: <input aria-label="Payee" /> },
      ]}
    />
  );
}

describe('Tabs', () => {
  it('shows one panel at a time, the one whose tab is pressed', () => {
    render(<Screen />);
    expect(screen.getByRole('tablist', { name: 'Records' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Register 3' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('The rows');
    expect(screen.queryByRole('textbox', { name: 'Payee' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Entry New' }));
    expect(screen.getByRole('tab', { name: 'Entry New' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Payee' })).toBeTruthy();
    // The register's panel is still there, hidden.
    expect(screen.getByText('The rows').closest('[hidden]')).not.toBeNull();
  });

  it('keeps a hidden panel mounted, so what was typed in it is there on coming back', () => {
    render(<Screen start="form" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Payee' }), { target: { value: 'Meralco' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Register 3' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Entry New' }));

    expect(screen.getByRole('textbox', { name: 'Payee' })).toHaveProperty('value', 'Meralco');
  });
});
