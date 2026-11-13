// The APG logo made for white paper: the phoenix in solid gold and "ALPHA PREMIER GROUP" in black, drawn in HD so it
// stays sharp on screen and in print.
import logo from '@keystone/ui/logo-paper.png';
import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { peso, toCentavos, type Company, type LineItem } from '@keystone/core';

// Building blocks for printed documents, on white paper tokens. A module composes its
// own document from these (the voucher, the statement); the element on screen is the
// one that is printed and turned into a PDF, so the preview is exactly the output.

/** The paper's width in CSS px: an A4 page less the print stylesheet's 12 mm margins (186 mm). */
export const PAPER_WIDTH = Math.round((186 / 25.4) * 96);

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
 * A document, always laid out at the paper's width. Where the column is narrower, the
 * preview is scaled down to fit (a transform on a wrapper, so the paper itself, which
 * Print and Export PDF take, stays at full size). `fit="page"` prints the sheet scaled to
 * a single page, however long it is. `fit="halves"` lays the document out twice on one A4,
 * once on each half, out to near the paper's edges with no print margin, and draws a
 * dashed line across the middle: one cut leaves two copies, each on half an A4.
 */
export const Sheet = forwardRef<HTMLElement, { children: ReactNode; label: string; fit?: 'page' | 'halves' }>(function Sheet({ children, label, fit: printFit }, ref) {
  const halves = printFit === 'halves';
  const width = halves ? PAGE_WIDTH : PAPER_WIDTH;
  const frame = useRef<HTMLDivElement>(null);
  // Holds only the paper, so its height is the paper's; a transform leaves that height unscaled.
  const scaler = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const f = frame.current;
    const s = scaler.current;

    if (!f || !s) return;

    const measure = () => {
      // A column with no width yet (a hidden screen) is measured again when it gets one.
      if (!f.clientWidth) return;

      const scale = Math.min(1, f.clientWidth / width);
      const next = scale < 1 ? { scale, height: s.offsetHeight * scale } : null;
      setFit((old) => (old?.scale === next?.scale && old?.height === next?.height ? old : next));
    };

    const watch = new ResizeObserver(measure);
    watch.observe(f);
    watch.observe(s);
    measure();

    return () => watch.disconnect();
  }, [width]);

  return (
    <div ref={frame} data-sheet-frame="" className="overflow-hidden" style={fit ? { height: fit.height } : undefined}>
      <div ref={scaler} data-sheet-scale="" className="mx-auto w-fit origin-top-left" style={fit ? { transform: `scale(${fit.scale})`, marginInline: 0 } : undefined}>
        <article
          ref={ref}
          data-ui="document"
          data-print-fit={printFit}
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

export function Meta({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  return (
    <dl className="m-0 mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(([k, v, strong]) => (
        <div key={k} className="flex items-baseline gap-1.5 border-b border-dotted border-paper-line py-0.5">
          <dt className="min-w-[100px] text-[11px] text-paper-muted">{k}</dt>
          <dd className={`m-0 tabular-nums ${strong ? 'font-semibold' : ''}`}>{v}</dd>
        </div>
      ))}
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

/** A document's lines. `rows` pads the table with blank rows, as a printed form has. */
export function Lines({ columns, lines, empty, footer, rows = 0 }: { columns: LineColumn[]; lines: LineItem[]; empty: string; footer: [string, string, boolean?][]; rows?: number }) {
  const blank = Math.max(0, rows - Math.max(lines.length, 1));

  return (
    <table className="my-2 w-full border-collapse">
      <thead>
        <tr className="border-y border-paper-ink text-left text-[11px] tracking-[0.04em] uppercase">
          {columns.map((c) => <th key={c.header} className={`px-1.5 py-1 font-semibold ${c.figure ? 'text-right' : ''}`}>{c.header}</th>)}
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr className="border-b border-paper-rule"><td colSpan={columns.length} className="px-1.5 py-1.5 text-paper-muted">{empty}</td></tr>
        )}
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-paper-rule align-top">
            {columns.map((c) => <td key={c.header} className={`px-1.5 py-1.5 ${c.figure ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>{c.cell(l)}</td>)}
          </tr>
        ))}
        {Array.from({ length: blank }, (_, i) => (
          <tr key={`blank-${i}`} aria-hidden="true" className="border-b border-paper-rule"><td colSpan={columns.length} className="px-1.5 py-1.5">&nbsp;</td></tr>
        ))}
      </tbody>
      <tfoot>
        {footer.map(([k, v, grand]) => (
          <tr key={k} className={grand ? 'border-t-2 border-paper-gold text-[13.5px]' : ''}>
            <td colSpan={columns.length - 1} className="px-1.5 py-1 font-semibold">{k}</td>
            <td className="px-1.5 py-1 text-right font-semibold whitespace-nowrap tabular-nums">{v}</td>
          </tr>
        ))}
      </tfoot>
    </table>
  );
}

export function Signatures({ names, className = '' }: { names: [string, string][]; className?: string }) {
  return (
    <div className={`mt-8 grid gap-3.5 ${className}`} style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0,1fr))` }}>
      {names.map(([who, role]) => (
        <div key={role} className="border-t border-paper-ink pt-1 text-[11px]">
          <p className="m-0 min-h-4 font-semibold">{who}</p>
          <p className="m-0 text-paper-muted">{role}</p>
        </div>
      ))}
    </div>
  );
}

export const orDash = (s?: string) => (s && s.trim() ? s : '—');
