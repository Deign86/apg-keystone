import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { dateOfSerial, readWorkbook } from '../src/xlsx';

// The workbook reader, against a workbook written by openpyxl (test/fixtures/sample-interns.xlsx, made-up interns laid
// out as HR's spreadsheet is) and against workbooks put together here for what openpyxl never writes.

const sample = () => readWorkbook(new Uint8Array(readFileSync(createRequire(import.meta.url).resolve('./fixtures/sample-interns.xlsx'))));

/** A one-sheet workbook from the XML of its sheet, with any shared strings and styles, as another writer might make it. */
function book(sheet: string, extra: { strings?: string; styles?: string; workbookPr?: string } = {}) {
  const parts = {
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${extra.workbookPr ?? ''}<x:sheets><x:sheet name="Only" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="/xl/worksheets/one.xml"/></Relationships>'),
    'xl/worksheets/one.xml': strToU8(`<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>${sheet}</x:sheetData></x:worksheet>`),
    'xl/sharedStrings.xml': extra.strings && strToU8(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${extra.strings}</sst>`),
    'xl/styles.xml': extra.styles && strToU8(`<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${extra.styles}</styleSheet>`),
  };

  // A part not given is left out of the zip, as a writer that has none leaves it out.
  return readWorkbook(zipSync(Object.fromEntries(Object.entries(parts).flatMap(([path, bytes]) => (bytes ? [[path, bytes]] : [])))));
}

describe('reading a workbook', () => {
  it('reads every tab in order, by its name as written, with each cell’s text, number and fill', () => {
    const b = sample();

    expect(b.sheets.map((s) => s.name)).toEqual(['BATCH 1', 'BATCH  2 ', 'BATCH 3', 'CLeaners', 'Notes']);
    expect(b.from1904).toBe(false);
    const [header, ana] = b.sheets[0].rows;

    expect(header.map((c) => c.text)).toEqual(['NAME', 'SCHOOL', 'Start date', 'End date', 'Total Hours Rendered ', 'Documents Issued (Proof of Completion)', 'Notes/Remarks']);
    expect(ana[0]).toEqual({ text: 'Ana Reyes', num: null, fill: 'FFFFEB9C' });
    expect(ana[2]).toEqual({ text: '45810', num: 45810, fill: 'FFFFEB9C' });
    expect(ana[4]).toMatchObject({ text: '240', num: 240 });
    // The gaps between cells are empty cells, so a column is the same index on every row.
    expect(b.sheets[3].rows[3].map((c) => c.text)).toEqual(['', 'MONDAY', '', '', 'TUESDAY', '', '', 'WEDNESDAY', '', '', 'THURSDAY', '', '', 'FRIDAY', '', '', 'SATURDAY', '', '', 'SUNDAY']);
  });

  it('reads inline strings, rich text without its phonetic guides, booleans and a namespace prefix', () => {
    const b = book(
      '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Inline</x:t></x:is></x:c><x:c r="C1" t="s"><x:v>0</x:v></x:c><x:c r="D1" t="b"><x:v>1</x:v></x:c><x:c r="AB1" t="str"><x:v>formula text</x:v></x:c></x:row>',
      { strings: '<si><r><t>Ma. </t></r><r><t>Cruz</t></r><rPh><t>マ</t></rPh></si>' },
    );

    expect(b.sheets[0].rows[0].map((c) => c.text)).toEqual(['Inline', '', 'Ma. Cruz', 'TRUE', ...Array<string>(23).fill(''), 'formula text']);
  });

  it('reads a fill given in six digits or eight, and leaves out a fill that is none or a theme colour', () => {
    const styles = '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="ff0000"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor theme="4"/></patternFill></fill></fills>'
      + '<cellXfs><xf fillId="0"/><xf fillId="2"/><xf fillId="3"/></cellXfs>';

    const b = book('<x:row r="1"><x:c r="A1" s="1" t="inlineStr"><x:is><x:t>red</x:t></x:is></x:c><x:c r="B1" s="2" t="inlineStr"><x:is><x:t>theme</x:t></x:is></x:c></x:row>', { styles });

    expect(b.sheets[0].rows[0].map((c) => c.fill)).toEqual(['FFFF0000', null]);
  });

  it('counts days from 1904 when the workbook says so', () => {
    expect(book('', { workbookPr: '<x:workbookPr date1904="1"/>' }).from1904).toBe(true);
    expect(dateOfSerial(45811)).toBe('2025-06-03');
    expect(dateOfSerial(44349, true)).toBe('2025-06-03');
    // A day number with a time of day is that day; nothing before the first day is a date.
    expect(dateOfSerial(45811.75)).toBe('2025-06-03');
    expect(dateOfSerial(0)).toBeNull();
  });

  it('refuses a file that is not an .xlsx workbook, saying how to get one from Google Sheets', () => {
    const said = 'That file is not an Excel workbook (.xlsx). In Google Sheets, use File › Download › Microsoft Excel (.xlsx).';

    expect(refusalOf(() => readWorkbook(strToU8('NAME,SCHOOL\nAna,Sample'))))?.toEqual({ error: said, fields: [] });
    expect(refusalOf(() => readWorkbook(zipSync({ 'word/document.xml': strToU8('<w/>') }))))?.toEqual({ error: said, fields: [] });
  });
});
