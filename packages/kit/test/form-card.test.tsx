import { Field, TextInput, type Refusal } from '@keystone/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeystoneError, lineDraft, type LineDraft } from '@keystone/core';
import { FormCard, LineEditor } from '../src/components';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

afterEach(cleanup);

/** A statement form whose save runs `rule` through the store, as a screen does, and shows what it refused. */
function Statement({ store, rule }: { store: KeystoneStore; rule: (lines: LineDraft[], client: string) => void }) {
  const [client, setClient] = useState('');
  const [lines, setLines] = useState([lineDraft({ desc: 'Rent', amount: '100' }), lineDraft({ desc: 'Dues' })]);
  const [error, setError] = useState<Refusal | null>(null);

  const save = () => {
    const r = store.run((s) => {
      rule(lines, client);

      return { state: s, record: null, message: 'Saved.' };
    });

    setError(r.ok ? null : r);
  };

  return (
    <FormCard eyebrow="Billing" title="Statement" onSubmit={save} error={error} actions={<button type="submit">Save</button>}>
      <Field label="Bill to" name="client"><TextInput value={client} onChange={setClient} /></Field>
      <LineEditor title="Charges" lines={lines} onChange={setLines} />
    </FormCard>
  );
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const cell = (name: string) => screen.getByRole('textbox', { name });

describe('a form card', () => {
  it('marks the line a refusal names, focuses it and ties it to the sentence by the save button', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);

    render(<Statement store={store} rule={(lines) => { if (lines.some((l) => !l.amount)) throw new KeystoneError('Enter the amount for line 2, Dues.', 'lines.1.amount'); }} />);
    save();
    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent('Enter the amount for line 2, Dues.');
    expect(cell('Line 2 amount')).toHaveAttribute('aria-invalid', 'true');
    expect(cell('Line 2 amount')).toHaveAttribute('aria-describedby', alert.id);
    expect(document.activeElement).toBe(cell('Line 2 amount'));
    expect(cell('Line 1 amount')).not.toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(cell('Line 2 amount'), { target: { value: '50' } });

    expect(cell('Line 2 amount')).not.toHaveAttribute('aria-invalid', 'true');
    // The sentence stays by the save button until the next save.
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the amount for line 2, Dues.');
  });

  it('marks a named field and says why under it as well', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);

    render(<Statement store={store} rule={(_, client) => { if (!client) throw new KeystoneError('Enter who the statement is billed to.', 'client'); }} />);
    save();

    expect(cell('Bill to')).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(cell('Bill to'));
    expect(screen.getAllByText('Enter who the statement is billed to.')).toHaveLength(2);
    // Only the sentence by the save button is announced: the one under the field is read with the field.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('marks nothing for a refusal about no one field', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);

    render(<Statement store={store} rule={() => { throw new KeystoneError('Invoice No. 1 is already used.'); }} />);
    save();

    expect(screen.getByRole('alert')).toHaveTextContent('Invoice No. 1 is already used.');
    expect(screen.getAllByRole('textbox').filter((t) => t.getAttribute('aria-invalid') === 'true')).toHaveLength(0);
  });
});
