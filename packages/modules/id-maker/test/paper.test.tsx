import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { companyOf } from '@keystone/core';
import { printElement } from '@keystone/kit';
import { sampleState } from '@keystone/core/sample';
import { IDCardSheet } from '../src/IDCard';

// The ID card sheet as it is on screen and at the printer, kept whole: every class name, inline style and data
// attribute of the element that is printed and exported. It is not one of the kit's sheets and has its own sizes
// (the card's, from the design tokens), so this is recorded from what it does today, before anyone moves it.

/** The sheet's markup, a tag to a line, with its images named by file only. */
const markup = (sheet: HTMLElement) => sheet.outerHTML.replace(/ src="[^"]*?([^"/]+)"/g, ' src="$1"').replace(/></g, '>\n<');

/** The @page rules in the document's head. */
const pageRules = () => [...document.head.querySelectorAll('style')].flatMap((s) => (s.textContent?.startsWith('@page') ? [s.textContent] : []));

/** Prints the sheet and answers what it looked like to the printer, then finishes the print. */
function printed(sheet: HTMLElement) {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});

  printElement(sheet);
  const during = { page: pageRules(), sheet: markup(sheet) };

  window.dispatchEvent(new Event('afterprint'));
  print.mockRestore();

  return during;
}

describe('the ID card sheet on paper', () => {
  const s = sampleState();
  const company = companyOf(s);

  it('is laid out, and prints, exactly as it has', () => {
    const ref = createRef<HTMLDivElement>();

    render(<IDCardSheet ref={ref} card={s.ids[0]} photo="photos/card.jpg" company={company} />);
    const sheet = ref.current!;
    const before = markup(sheet);

    expect(before).toMatchSnapshot('on screen');
    expect(printed(sheet)).toMatchSnapshot('at the printer');
    // It carries no layout mark, so it prints as the stylesheet says, with no @page rule of its own, and is put back.
    expect(sheet).not.toHaveAttribute('data-print-fit');
    expect(markup(sheet)).toBe(before);
    expect(pageRules()).toEqual([]);
  });

  it('lays out a card not filled in yet, with no photo, the same way', () => {
    const ref = createRef<HTMLDivElement>();

    render(<IDCardSheet ref={ref} card={{ ...s.ids[0], name: '', pos: '', dept: '', iceName: '', iceNo: '' }} photo={null} company={company} />);

    expect(markup(ref.current!)).toMatchSnapshot('blank');
  });
});
