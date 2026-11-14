// The APG logo made for white paper: the phoenix in solid gold and "ALPHA PREMIER GROUP" in black, drawn in HD so it
// stays sharp on screen and in print.
import logo from '@keystone/ui/logo-paper.png';
import { forwardRef, Fragment, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { peso, toCentavos, type Company, type LineItem } from '@keystone/core';

// Building blocks for printed documents, on white paper tokens. A module composes its
// own document from these (the voucher, the statement); the element on screen is the
// one that is printed and turned into a PDF, so the preview is exactly the output.

/** The paper's width in CSS px: an A4 page less the print stylesheet's 12 mm margins (186 mm). */
export const PAPER_WIDTH = Math.round((186 / 25.4) * 96);

/** The paper's width on an A4 page turned on its side, less the same margins (273 mm): a sheet too wide to stand upright. */
export const LANDSCAPE_PAPER_WIDTH = Math.round((273 / 25.4) * 96);

/** A whole A4 page's width in CSS px (210 mm, rounded down so it never spills onto a second page): a two-up sheet prints with no margin. */
export const PAGE_WIDTH = Math.floor((210 / 25.4) * 96);

/** Half an A4 page's height in CSS px (148.5 mm, rounded down): one copy on a two-up sheet, from an edge of the page to the middle, where it is cut. */
export const HALF_PAGE_HEIGHT = Math.floor((148.5 / 25.4) * 96);

/** How far a two-up sheet's copies keep in from the paper's edges and the cut: inside what any printer reaches. */
const EDGE = '6mm';

/** One copy on a two-up sheet. The second sits below the dashed line to cut along, and screen readers skip it. */
function Copy({ children, second }: { children: ReactNode; second?: boolean }) {
  return (
    <div
      data-sheet-copy=""
      aria-hidden={second || undefined}
      style={{ minHeight: HALF_PAGE_HEIGHT, padding: EDGE }}
      className={`flex flex-col ${second ? 'border-t border-dashed border-paper-muted' : ''}`}
    >
      {children}
    </div>
  );
}

/**
 * How far `content` has to shrink to fit across `box`, and the height it then takes, or null when it fits. Measured
 * again whenever either changes size; a box with no width yet (a hidden screen) is measured once it gets one.
 */
function useShrinkToFit(box: RefObject<HTMLElement>, content: RefObject<HTMLElement>) {
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const b = box.current;
    const c = content.current;

    if (!b || !c) return;

    const measure = () => {
      if (!b.clientWidth) return;

      // Layout sizes, which a transform leaves alone: the scale this sets never changes what it measures.
      const scale = Math.min(1, b.clientWidth / c.offsetWidth);
      const next = scale < 1 ? { scale, height: c.offsetHeight * scale } : null;
      setFit((old) => (old?.scale === next?.scale && old?.height === next?.height ? old : next));
    };

    const watch = new ResizeObserver(measure);
    watch.observe(b);
    watch.observe(c);
    measure();

    return () => watch.disconnect();
  }, [box, content]);

  return fit;
}

/**
 * A document, always laid out at the paper's width. Where the column is narrower, the
 * preview is scaled down to fit (a transform on a wrapper, so the paper itself, which
 * Print and Export PDF take, stays at full size). `orientation="landscape"` turns the
 * A4 on its side, for a sheet too wide to stand upright: the paper is `LANDSCAPE_PAPER_WIDTH`
 * wide, and Print and Export PDF use a landscape page. `fit="page"` prints the sheet scaled to
 * a single page, however long it is. `fit="halves"` lays the document out twice on one A4,
 * upright, once on each half, out to near the paper's edges with no print margin, and draws a
 * dashed line across the middle: one cut leaves two copies, each on half an A4.
 */
export const Sheet = forwardRef<HTMLElement, { children: ReactNode; label: string; fit?: 'page' | 'halves'; orientation?: 'portrait' | 'landscape' }>(function Sheet({ children, label, fit: printFit, orientation }, ref) {
  const halves = printFit === 'halves';
  const landscape = !halves && orientation === 'landscape';
  const width = halves ? PAGE_WIDTH : landscape ? LANDSCAPE_PAPER_WIDTH : PAPER_WIDTH;
  const frame = useRef<HTMLDivElement>(null);
  // Holds only the paper, so its size is the paper's; a transform leaves that size unscaled.
  const scaler = useRef<HTMLDivElement>(null);
  const fit = useShrinkToFit(frame, scaler);

  return (
    <div ref={frame} data-sheet-frame="" className="overflow-hidden" style={fit ? { height: fit.height } : undefined}>
      <div ref={scaler} data-sheet-scale="" className="mx-auto w-fit origin-top-left" style={fit ? { transform: `scale(${fit.scale})`, marginInline: 0 } : undefined}>
        <article
          ref={ref}
          data-ui="document"
          data-print-fit={printFit}
          data-print-orientation={landscape ? 'landscape' : undefined}
          aria-label={label}
          style={{ width, minHeight: halves ? undefined : 420 }}
          // A two-up sheet's frame only marks the paper's edge on screen; it never prints.
          className={`border border-line bg-paper font-body text-[12.5px] leading-snug text-paper-ink ${halves ? 'print:border-0' : 'px-[30px] py-7'}`}
        >
          {halves ? <><Copy>{children}</Copy><Copy second>{children}</Copy></> : children}
        </article>
      </div>
    </div>
  );
});

/**
 * Part of a document that can be wider than the paper, such as a payroll sheet's 22 columns. It is laid out as narrow
 * as it goes (a table's columns at their narrowest, headings wrapped), and where that is still wider than the paper it
 * is scaled down as a whole to fit across it. A transform inside the paper, so the preview, the print and the PDF show
 * it the same; the box keeps the scaled height, so what follows sits right under it.
 */
export function FitWidth({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const fit = useShrinkToFit(box, content);

  return (
    <div ref={box} style={fit ? { height: fit.height } : undefined}>
      <div ref={content} className="w-min min-w-full origin-top-left" style={fit ? { transform: `scale(${fit.scale})` } : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * The APG logo, the company and the document's title and number. The company is as Company Details keeps it, and
 * nothing of it shows until it is filled in. `nameOnly` leaves the address and contact out and puts the name beside the
 * logo: one line. Otherwise the name, address and contact run under the logo, across the page.
 */
export function Letterhead({ company, title, no, date, nameOnly }: { company: Company; title: string; no: string; date?: string; nameOnly?: boolean }) {
  return (
    <header className="mb-3.5 border-b-2 border-paper-gold pb-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <img src={logo} alt="Alpha Premier Group" className="h-15 w-auto shrink-0" />
          {nameOnly && company.name && (
            <p className="m-0 min-w-0 border-l border-paper-line pl-4 text-[12.5px] font-semibold">{company.name}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 font-display text-[15px] font-semibold tracking-[0.12em] text-paper-gold uppercase">{title}</p>
          <p className="m-0 mt-0.5 text-[12.5px] font-semibold tabular-nums">{no}</p>
          {date && <p className="m-0 text-xs font-medium tabular-nums">{date}</p>}
        </div>
      </div>
      {!nameOnly && (company.name || company.address || company.contact) && (
        <div className="mt-2">
          {company.name && <p className="m-0 text-[12.5px] font-semibold">{company.name}</p>}
          {company.address && <p className="m-0 text-[11px] text-pretty text-paper-muted">{company.address}</p>}
          {company.contact && <p className="m-0 text-[11px] text-paper-muted">{company.contact}</p>}
        </div>
      )}
    </header>
  );
}

// The papers' smallest text is 11px, the house minimum (docs/DESIGN.md), like every screen's but the ID card's.

/** A heading on a paper's tinted band (a table's columns, a total): the paper's gold, in tracked capitals. */
export const paperHeading = 'text-[11px] font-semibold tracking-[0.14em] text-paper-gold uppercase';

/** The label of a box on a paper: small tracked capitals in the paper's grey. */
export const paperLabel = 'text-[11px] font-semibold tracking-[0.08em] text-paper-muted uppercase';

/**
 * A document's facts as one ruled box, two to a row: a firm line around it and light ones between, each column's
 * labels lined up so the values start together. `strong` sets a value in bold.
 */
export function Meta({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  const lastRow = Math.ceil(rows.length / 2) - 1;

  return (
    <dl className="m-0 mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] border border-paper-ink">
      {rows.map(([k, v, strong], i) => {
        const under = Math.floor(i / 2) < lastRow ? 'border-b border-paper-line' : '';

        return (
          <Fragment key={k}>
            <dt className={`flex items-center py-1.5 pr-3 pl-2.5 ${paperLabel} ${under} ${i % 2 ? 'border-l border-paper-line' : ''}`}>{k}</dt>
            <dd className={`m-0 flex items-center py-1.5 pr-2.5 tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${under}`}>{v}</dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

/** One column of a document's line table. Figures align right. */
export interface LineColumn {
  header: string;
  cell: (l: LineItem) => ReactNode;
  figure?: boolean;
}

/** The line's amount before tax, as a column. */
export const amountColumn = (header = 'Amount'): LineColumn => ({ header, figure: true, cell: (l) => peso(toCentavos(l.amt)) });

/**
 * A document's lines, ruled as the check voucher is: a firm line around the table and above its totals, light ones
 * between columns and rows, the headings on a pale gold band and the grand total on another. `rows` pads the table with
 * blank rows, as a printed form has.
 */
export function Lines({ columns, lines, empty, footer, rows = 0 }: { columns: LineColumn[]; lines: LineItem[]; empty: string; footer: [string, string, boolean?][]; rows?: number }) {
  const blank = Math.max(0, rows - Math.max(lines.length, 1));
  const cell = (i: number, figure?: boolean) => `px-2.5 py-1.5 ${i ? 'border-l border-paper-line' : ''} ${figure ? 'text-right whitespace-nowrap tabular-nums' : ''}`;

  return (
    <table className="my-2 w-full border-collapse border border-paper-ink">
      <thead>
        <tr className={`border-b border-paper-line bg-paper-tint text-left ${paperHeading}`}>
          {columns.map((c, i) => <th key={c.header} className={`${cell(i, c.figure)} font-semibold`}>{c.header}</th>)}
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr className="border-b border-paper-rule"><td colSpan={columns.length} className="px-2.5 py-1.5 text-paper-muted">{empty}</td></tr>
        )}
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-paper-rule align-top">
            {columns.map((c, j) => <td key={c.header} className={cell(j, c.figure)}>{c.cell(l)}</td>)}
          </tr>
        ))}
        {Array.from({ length: blank }, (_, i) => (
          <tr key={`blank-${i}`} aria-hidden="true" className="border-b border-paper-rule">
            {columns.map((c, j) => <td key={c.header} className={cell(j)}>&nbsp;</td>)}
          </tr>
        ))}
      </tbody>
      <tfoot>
        {footer.map(([k, v, grand], i) => (
          <tr key={k} className={`${i === 0 || grand ? 'border-t border-paper-ink' : ''} ${grand ? 'bg-paper-tint' : ''}`}>
            <td colSpan={columns.length - 1} className={`px-2.5 py-1.5 text-right ${grand ? paperHeading : 'font-medium'}`}>{k}</td>
            <td className={`border-l border-paper-line px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums ${grand ? 'text-sm font-bold' : 'font-semibold'}`}>{v}</td>
          </tr>
        ))}
      </tfoot>
    </table>
  );
}

/** Lines to sign on: room above a firm line, then who signs, in bold, and their role. */
export function Signatures({ names, className = '' }: { names: [string, string][]; className?: string }) {
  return (
    <div className={`mt-10 grid gap-8 ${className}`} style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0,1fr))` }}>
      {names.map(([who, role]) => (
        <div key={role} className="border-t border-paper-ink pt-1 text-[11px]">
          <p className="m-0 min-h-4 font-bold">{who}</p>
          <p className={`m-0 mt-0.5 ${paperLabel}`}>{role}</p>
        </div>
      ))}
    </div>
  );
}

export const orDash = (s?: string) => (s && s.trim() ? s : '—');
