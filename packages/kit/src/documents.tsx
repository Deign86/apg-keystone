// The APG logo made for white paper: the phoenix in solid gold and "ALPHA PREMIER GROUP" in black, drawn in HD so it
// stays sharp on screen and in print.
import logo from '@keystone/ui/logo-paper.png';
import { forwardRef, Fragment, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DASH, peso, toCentavos, type Company, type LineItem } from '@keystone/core';
import { HALF_PAGE_HEIGHT, LANDSCAPE_PAPER_WIDTH, MARKS, PAPER_WIDTH, TWO_UP, TWO_UP_EDGE, type PaperLayout } from './paper';

// Building blocks for printed documents, on white paper tokens. A module composes its
// own document from these (the voucher, the statement); the element on screen is the
// one that is printed and turned into a PDF, so the preview is exactly the output.

/** One copy on a two-up sheet. The second sits below the dashed line to cut along, and screen readers skip it. */
function Copy({ children, second }: { children: ReactNode; second?: boolean }) {
  return (
    <div
      {...{ [MARKS.copy]: '' }}
      aria-hidden={second || undefined}
      style={{ minHeight: HALF_PAGE_HEIGHT, padding: TWO_UP_EDGE }}
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
 * The paper itself, always laid out at its layout's width, in the frame that scales its preview. Where the column is
 * narrower, the preview is scaled down to fit (a transform on a wrapper, so the paper, which Print and Export PDF
 * take, stays at full size). The paper carries its layout's marks, so the two find the layout again.
 */
const Paper = forwardRef<HTMLElement, { children: ReactNode; label: string; layout: PaperLayout; className: string }>(function Paper({ children, label, layout, className }, ref) {
  const frame = useRef<HTMLDivElement>(null);
  // Holds only the paper, so its size is the paper's; a transform leaves that size unscaled.
  const scaler = useRef<HTMLDivElement>(null);
  const fit = useShrinkToFit(frame, scaler);

  return (
    <div ref={frame} {...{ [MARKS.frame]: '' }} className="overflow-hidden" style={fit ? { height: fit.height } : undefined}>
      <div ref={scaler} {...{ [MARKS.scale]: '' }} className="mx-auto w-fit origin-top-left" style={fit ? { transform: `scale(${fit.scale})`, marginInline: 0 } : undefined}>
        <article
          ref={ref}
          data-ui="document"
          {...{ [MARKS.fit]: layout.marks.fit, [MARKS.orientation]: layout.marks.orientation }}
          aria-label={label}
          // As tall as what it holds: a short paper (a statement with no charges yet) leaves no blank band at its foot.
          style={{ width: layout.width }}
          className={`border border-line bg-paper font-body text-[12.5px] leading-snug text-paper-ink ${className}`}
        >
          {children}
        </article>
      </div>
    </div>
  );
});

/** The padding of a paper that prints inside the page's margins. */
const PADDED = 'px-[30px] py-7';

/**
 * A document on an upright A4 page. `orientation="landscape"` turns the A4 on its side, for a sheet too wide to stand
 * upright: the paper is `LANDSCAPE_PAPER_WIDTH` wide, and Print and Export PDF use a landscape page. `fit="page"`
 * prints the sheet scaled to a single page, however long it is.
 */
export const Sheet = forwardRef<HTMLElement, { children: ReactNode; label: string; fit?: 'page'; orientation?: 'portrait' | 'landscape' }>(function Sheet({ children, label, fit, orientation }, ref) {
  const landscape = orientation === 'landscape';
  // Until the payroll sheet has a layout of its own: the marks output.ts still reads for it.
  const layout: PaperLayout = { width: landscape ? LANDSCAPE_PAPER_WIDTH : PAPER_WIDTH, marks: { fit, orientation: landscape ? 'landscape' : undefined }, pdf: { margin: 0 } };

  return <Paper ref={ref} label={label} layout={layout} className={PADDED}>{children}</Paper>;
});

/**
 * A document twice on one A4 sheet, a copy on each half, to be cut apart along the dashed line across the middle
 * (`TWO_UP`). Its frame only marks the paper's edge on screen; it never prints.
 */
export const TwoUp = forwardRef<HTMLElement, { children: ReactNode; label: string }>(function TwoUp({ children, label }, ref) {
  return (
    <Paper ref={ref} label={label} layout={TWO_UP} className="print:border-0">
      <Copy>{children}</Copy>
      <Copy second>{children}</Copy>
    </Paper>
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
 * The row every letterhead opens with, over the gold rule: `mark` on the left (a logo, and anything set beside it),
 * the document's title, number and date on the right. `children` run under the row, across the page. A paper with a
 * letterhead of its own composes this.
 */
export function Masthead({ mark, title, no, date, children }: { mark: ReactNode; title: string; no: string; date?: string; children?: ReactNode }) {
  return (
    <header className="mb-3.5 border-b-2 border-paper-gold pb-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">{mark}</div>
        <div className="shrink-0 text-right">
          <p className="m-0 font-display text-[15px] font-semibold tracking-[0.12em] text-paper-gold uppercase">{title}</p>
          <p className="m-0 mt-0.5 text-[12.5px] font-semibold tabular-nums">{no}</p>
          {date && <p className="m-0 text-xs font-medium tabular-nums">{date}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

/** How a logo sits in a masthead. */
export const paperLogo = 'h-15 w-auto shrink-0';

/**
 * The APG logo, the document's title and number, and under them the company as Company Details keeps it: its name,
 * address and contact, across the page. Nothing of the company shows until it is filled in.
 */
export function Letterhead({ company, title, no, date }: { company: Company; title: string; no: string; date?: string }) {
  return (
    <Masthead mark={<img src={logo} alt="Alpha Premier Group" className={paperLogo} />} title={title} no={no} date={date}>
      {(company.name || company.address || company.contact) && (
        <div className="mt-2">
          {company.name && <p className="m-0 text-[12.5px] font-semibold">{company.name}</p>}
          {company.address && <p className="m-0 text-[11px] text-pretty text-paper-muted">{company.address}</p>}
          {company.contact && <p className="m-0 text-[11px] text-paper-muted">{company.contact}</p>}
        </div>
      )}
    </Masthead>
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
export const amountColumn = (): LineColumn => ({ header: 'Amount', figure: true, cell: (l) => peso(toCentavos(l.amt)) });

/**
 * A document's lines, ruled as the check voucher is: a firm line around the table and above its totals, light ones
 * between columns and rows, the headings on a pale gold band and the grand total on another.
 */
export function Lines({ columns, lines, empty, footer }: { columns: LineColumn[]; lines: LineItem[]; empty: string; footer: [string, string, boolean?][] }) {
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
export function Signatures({ names }: { names: [string, string][] }) {
  return (
    <div className="mt-10 grid gap-8" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0,1fr))` }}>
      {names.map(([who, role]) => (
        <div key={role} className="border-t border-paper-ink pt-1 text-[11px]">
          <p className="m-0 min-h-4 font-bold">{who}</p>
          <p className={`m-0 mt-0.5 ${paperLabel}`}>{role}</p>
        </div>
      ))}
    </div>
  );
}

export const orDash = (s?: string) => (s && s.trim() ? s : DASH);
