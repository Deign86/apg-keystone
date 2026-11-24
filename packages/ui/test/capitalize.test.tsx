import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { capitalizeWords, Field, TextInput } from '../src/fields';

afterEach(cleanup);

function NameField({ capitalize = true }: { capitalize?: boolean }) {
  const [name, setName] = useState('');

  return (
    <Field label="Name">
      <TextInput capitalize={capitalize} value={name} onChange={setName} />
    </Field>
  );
}

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });

describe('capitalizeWords', () => {
  it('starts each word with a capital and leaves the rest as typed', () => {
    expect(capitalizeWords('juan dela cruz')).toBe('Juan Dela Cruz');
    expect(capitalizeWords('ma. beatriz b. conos')).toBe('Ma. Beatriz B. Conos');
    expect(capitalizeWords('ALPHA PREMIER GROUP OPC')).toBe('ALPHA PREMIER GROUP OPC');
    expect(capitalizeWords('mcDonald')).toBe('McDonald');
  });

  it('counts a word after a hyphen, a slash or an opening bracket', () => {
    expect(capitalizeWords('anne-marie santos/reyes (rona)')).toBe('Anne-Marie Santos/Reyes (Rona)');
  });

  it('keeps joining words small inside a name, but not at its start', () => {
    expect(capitalizeWords('alpha premier group of companies opc')).toBe('Alpha Premier Group of Companies Opc');
    expect(capitalizeWords('the residences at greenbelt')).toBe('The Residences at Greenbelt');
    expect(capitalizeWords('Alpha Premier Group Of Companies')).toBe('Alpha Premier Group Of Companies');
  });

  it('waits on the word being typed while it could still become a joining word', () => {
    expect(capitalizeWords('group o')).toBe('Group o');
    expect(capitalizeWords('group oc')).toBe('Group Oc');
    expect(capitalizeWords('deign grey o lazaro')).toBe('Deign Grey O Lazaro');
    expect(capitalizeWords('juan a santos')).toBe('Juan A Santos');
  });

  it('leaves digits, empty text and letters with no lowercase alone', () => {
    expect(capitalizeWords('3rd floor')).toBe('3rd Floor');
    expect(capitalizeWords('')).toBe('');
    expect(capitalizeWords('  ñino')).toBe('  Ñino');
  });
});

describe('a name field', () => {
  it('capitalizes each word as it is typed', () => {
    render(<NameField />);
    fireEvent.change(field(), { target: { value: 'jean ashley chico' } });

    expect(field().value).toBe('Jean Ashley Chico');
  });

  it('keeps the caret where it was when a name is corrected in the middle', () => {
    render(<NameField />);
    fireEvent.change(field(), { target: { value: 'Juan Cruz' } });
    const input = field();

    // "dela " typed after "Juan ", the caret just after it, as a browser delivers a keystroke: the field's text and
    // caret change, then an input event.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Juan dela Cruz');
    input.setSelectionRange(10, 10);
    fireEvent.input(input);

    expect(input.value).toBe('Juan Dela Cruz');
    expect([input.selectionStart, input.selectionEnd]).toEqual([10, 10]);
  });

  it('asks a phone to start each word with a capital', () => {
    render(<NameField />);

    expect(field().getAttribute('autocapitalize')).toBe('words');
  });

  it('leaves a field that is not a name as typed', () => {
    render(<NameField capitalize={false} />);
    fireEvent.change(field(), { target: { value: 'jean ashley chico' } });

    expect(field().value).toBe('jean ashley chico');
    expect(field().hasAttribute('autocapitalize')).toBe(false);
  });
});
