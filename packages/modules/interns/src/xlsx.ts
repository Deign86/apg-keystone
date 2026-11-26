import { strFromU8, unzipSync } from 'fflate';
import { KeystoneError } from '@keystone/core';

// Reading an Excel workbook (.xlsx), as HR's spreadsheet is kept, into plain cells: what each cell says, its number if
// it holds one, and the colour it is filled with, since the sheet marks a row's status by its colour. An .xlsx is a zip
// of XML files (ECMA-376): the workbook names the sheets, each sheet lists its cells, the shared strings hold the text
// and the styles hold the fills. Nothing is read from anywhere else, so this is pure: bytes in, cells out.

/** One cell as the sheet holds it. */
export interface Cell {
  /** What it says: its text, or its number written out ("240"); "" when empty. */
  text: string;
  /** Its number, when it holds one (a date is a number of days, read by the column that holds it). */
  num: number | null;
  /** Its fill as ARGB in capitals ("FFFF0000"), or null when it is not filled with a colour. */
  fill: string | null;
}

/** One worksheet: its name as the tab shows it, and its cells by row and column, counted from 0. */
export interface Worksheet {
  name: string;
  rows: Cell[][];
}

export interface Workbook {
  sheets: Worksheet[];
  /** The workbook counts days from 1904 rather than 1900 (Excel for Mac's old setting). */
  from1904: boolean;
}

const NOT_A_WORKBOOK = 'That file is not an Excel workbook (.xlsx). In Google Sheets, use File › Download › Microsoft Excel (.xlsx).';

const EMPTY: Cell = { text: '', num: null, fill: null };

function xml(files: Record<string, Uint8Array>, path: string): Document | null {
  const bytes = files[path];

  if (!bytes) return null;
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');

  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

/** The elements with this local name under `root`, whatever prefix the writer gave the namespace. */
const all = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS('*', name)];

const first = (root: Document | Element, name: string): Element | undefined => all(root, name)[0];

/** The text of a string item: its own `t`, or its runs' `t`s, leaving out the phonetic guides (`rPh`). */
const textOf = (si: Element) => all(si, 't').filter((t) => t.parentElement?.localName !== 'rPh').map((t) => t.textContent ?? '').join('');

/** "A1" → column 0; "AB12" → column 27. */
function columnOf(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';

  return [...letters].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
}

/** "B12" → row 11. */
const rowOf = (ref: string) => Number(/\d+$/.exec(ref)?.[0] ?? 1) - 1;

/** Where a relationship points, from the workbook's folder: "worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml". */
const resolve = (target: string) => (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);

/** "FF0000" and "ffff0000" both read "FFFF0000". */
const argb = (rgb: string) => (rgb.length === 6 ? `FF${rgb}` : rgb).toUpperCase();

/** Each style's fill colour, by the style's index in `cellXfs`. Only solid colours given as RGB count. */
function fillsOf(styles: Document | null): (string | null)[] {
  if (!styles) return [];

  const fills = all(first(styles, 'fills') ?? styles, 'fill').map((f) => {
    const pattern = first(f, 'patternFill');
    const rgb = pattern && pattern.getAttribute('patternType') !== 'none' ? first(pattern, 'fgColor')?.getAttribute('rgb') : null;

    return rgb ? argb(rgb) : null;
  });

  const xfs = first(styles, 'cellXfs');

  return xfs ? [...xfs.children].flatMap((x) => (x.localName === 'xf' ? [fills[Number(x.getAttribute('fillId') ?? 0)] ?? null] : [])) : [];
}

function sheetOf(doc: Document, name: string, strings: string[], fills: (string | null)[]): Worksheet {
  const rows: Cell[][] = [];

  for (const c of all(doc, 'c')) {
    const ref = c.getAttribute('r') ?? '';
    const type = c.getAttribute('t') ?? 'n';
    const v = first(c, 'v')?.textContent ?? '';
    const fill = fills[Number(c.getAttribute('s') ?? 0)] ?? null;
    let text = v;
    let num: number | null = null;

    if (type === 's') text = strings[Number(v)] ?? '';
    else if (type === 'inlineStr') text = textOf(first(c, 'is') ?? c);
    else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
    else if (type === 'n' && v !== '') {
      num = Number(v);
      text = String(num);
    }

    if (!text && !fill) continue;
    const r = rowOf(ref);
    const row = rows[r] ?? (rows[r] = []);

    row[columnOf(ref)] = { text, num, fill };
  }

  // Fill the gaps, so every row is an array of cells with nothing missing between them.
  return { name, rows: Array.from(rows, (row) => Array.from(row ?? [], (cell) => cell ?? EMPTY)) };
}

/** The workbook in these bytes, every sheet in the order of its tabs. Refuses a file that is not an .xlsx workbook. */
export function readWorkbook(bytes: Uint8Array): Workbook {
  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(bytes);
  } catch {
    throw new KeystoneError(NOT_A_WORKBOOK);
  }

  const book = xml(files, 'xl/workbook.xml');
  const rels = xml(files, 'xl/_rels/workbook.xml.rels');

  if (!book || !rels) throw new KeystoneError(NOT_A_WORKBOOK);
  const targets = new Map(all(rels, 'Relationship').map((r) => [r.getAttribute('Id') ?? '', resolve(r.getAttribute('Target') ?? '')]));
  const shared = xml(files, 'xl/sharedStrings.xml');
  const strings = shared ? all(shared, 'si').map(textOf) : [];
  const fills = fillsOf(xml(files, 'xl/styles.xml'));
  const pr = first(book, 'workbookPr');
  const from1904 = pr?.getAttribute('date1904') === '1' || pr?.getAttribute('date1904') === 'true';

  const sheets = all(book, 'sheet').flatMap((s) => {
    // The relationship id is r:id, in the relationships namespace; read it by its local name, whatever the prefix.
    const id = [...s.attributes].find((a) => a.localName === 'id')?.value ?? '';
    const doc = xml(files, targets.get(id) ?? '');

    return doc ? [sheetOf(doc, s.getAttribute('name') ?? '', strings, fills)] : [];
  });

  return { sheets, from1904 };
}

/** The ISO date a cell's number of days stands for, as Excel counts them, or null when it is not a whole day number. */
export function dateOfSerial(days: number, from1904 = false): string | null {
  if (!Number.isFinite(days) || days < 1) return null;
  // 1900 dates count from Dec 30, 1899, which absorbs Excel's Feb 29, 1900 that never was (for days after it).
  const epoch = from1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.floor(days) * 86_400_000);

  return d.toISOString().slice(0, 10);
}
