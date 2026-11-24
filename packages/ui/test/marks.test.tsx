import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CellInput, Checkbox, Field, FieldMarks, SelectInput, TextInput, type Refusal } from '../src/fields';

afterEach(cleanup);

/** A form of a text field, a dropdown, a checkbox and a cell, marked by whatever refusal `refuse` is handed. */
function Form({ refusals }: { refusals: (Refusal | null)[] }) {
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [at, setAt] = useState(0);
  const [client, setClient] = useState('');
  const [term, setTerm] = useState('12');
  const [ewt, setEwt] = useState(false);
  const [amount, setAmount] = useState('');

  return (
    <form>
      <FieldMarks refusal={refusal} describedBy="said">
        <Field label="Client" name="client"><TextInput value={client} onChange={setClient} /></Field>
        <Field label="Term" name="term"><SelectInput label="Term" value={term} onChange={setTerm} options={[{ value: '12', label: '12 months' }, { value: '24', label: '24 months' }]} /></Field>
        <Field label="Withholding" name="ewt"><Checkbox checked={ewt} onChange={setEwt}>Withhold EWT</Checkbox></Field>
        <CellInput name="lines.0.amount" label="Line 1 amount" value={amount} onChange={setAmount} />
        <Field label="Notes"><TextInput value="" onChange={() => {}} /></Field>
      </FieldMarks>
      {refusal && <p id="said">{refusal.error}</p>}
      <button type="button" onClick={() => { setRefusal(refusals[at] ?? null); setAt(at + 1); }}>Save</button>
    </form>
  );
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const client = () => screen.getByRole('textbox', { name: 'Client' });
const amount = () => screen.getByRole('textbox', { name: 'Line 1 amount' });
const invalid = (el: HTMLElement) => el.getAttribute('aria-invalid') === 'true';

/** The sentence as said under the fields it marks, not on the form. */
const under = (text: string) => screen.queryAllByText(text).filter((el) => el.id !== 'said');

describe('a refusal that names fields', () => {
  it('marks each named field invalid, says why under it and ties the sentence to it', () => {
    render(<Form refusals={[{ error: 'Enter the client.', fields: ['client'] }]} />);
    save();

    expect(invalid(client())).toBe(true);
    const [why] = under('Enter the client.');

    expect(why).toBeDefined();
    expect(client().getAttribute('aria-describedby')?.split(' ')).toContain(why?.id);
    expect(invalid(screen.getByRole('textbox', { name: 'Notes' }))).toBe(false);
  });

  it('moves the focus to the first named field on the form, whatever order the refusal names them in', () => {
    render(<Form refusals={[{ error: 'Enter the amount and the client.', fields: ['lines.0.amount', 'client'] }]} />);
    save();

    expect(document.activeElement).toBe(client());
    expect(invalid(amount())).toBe(true);
  });

  it('ties a marked cell to the sentence on the form, since a cell is too small to say it', () => {
    render(<Form refusals={[{ error: 'Enter the amount for line 1.', fields: ['lines.0.amount'] }]} />);
    save();

    expect(invalid(amount())).toBe(true);
    expect(amount().getAttribute('aria-describedby')).toBe('said');
    expect(document.activeElement).toBe(amount());
  });

  it('clears a field’s mark as soon as it is edited, and only that field’s', () => {
    render(<Form refusals={[{ error: 'Enter the client and the amount.', fields: ['client', 'lines.0.amount'] }]} />);
    save();
    fireEvent.change(client(), { target: { value: 'A' } });

    expect(invalid(client())).toBe(false);
    expect(under('Enter the client and the amount.')).toHaveLength(0);
    expect(invalid(amount())).toBe(true);

    fireEvent.change(amount(), { target: { value: '5' } });

    expect(invalid(amount())).toBe(false);
  });

  it('marks a dropdown and a checkbox, and clears each when it is changed', () => {
    render(<Form refusals={[{ error: 'Pick the term and say whether to withhold.', fields: ['term', 'ewt'] }]} />);
    save();
    const term = screen.getByRole('combobox', { name: 'Term' });

    expect(invalid(term)).toBe(true);
    expect(document.activeElement).toBe(term);
    expect(under('Pick the term and say whether to withhold.')).toHaveLength(2);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(under('Pick the term and say whether to withhold.')).toHaveLength(1);
  });

  it('marks the fields again on the next refusal, even when it is the same sentence', () => {
    render(<Form refusals={[{ error: 'Enter the client.', fields: ['client'] }, { error: 'Enter the client.', fields: ['client'] }]} />);
    save();
    fireEvent.change(client(), { target: { value: ' ' } });

    expect(invalid(client())).toBe(false);

    save();

    expect(invalid(client())).toBe(true);
  });
});

describe('a refusal about no one field', () => {
  it('marks nothing and leaves the focus where it was', () => {
    render(<Form refusals={[{ error: 'CV No. 1 is already used.', fields: [] }, { error: 'Could not save.' }]} />);
    const button = screen.getByRole('button', { name: 'Save' });

    button.focus();
    save();

    expect(screen.getAllByRole('textbox').some(invalid)).toBe(false);
    expect(document.activeElement).toBe(button);

    save();

    expect(screen.getAllByRole('textbox').some(invalid)).toBe(false);
  });
});
