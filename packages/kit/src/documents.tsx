import logo from '@keystone/ui/logo.png';
import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { peso, toCentavos, type Company, type LineItem } from '@keystone/core';

// Building blocks for printed documents, on white paper tokens. A module composes its
// own document from these (the voucher, the statement); the element on screen is the
// one that is printed and turned into a PDF, so the preview is exactly the output.

/** The paper's width in CSS px: an A4 page less the print stylesheet's 12 mm margins (186 mm). */
export const PAPER_WIDTH = Math.round((186 / 25.4) * 96);

/**
 * A document, always laid out at the paper's width. Where the column is narrower, the
 * preview is scaled down to fit (a transform on a wrapper, so the paper itself, which
 * Print and Export PDF take, stays at full size). `onePage` prints the sheet scaled to
 * a single page, however long it is.
 */
export const Sheet = forwardRef<HTMLElement, { children: ReactNode; label: string; onePage?: boolean }>(function Sheet({ children, label, onePage }, ref) {
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

      const scale = Math.min(1, f.clientWidth / PAPER_WIDTH);
      const next = scale < 1 ? { scale, height: s.offsetHeight * scale } : null;
      setFit((old) => (old?.scale === next?.scale && old?.height === next?.height ? old : next));
    };

    const watch = new ResizeObserver(measure);
    watch.observe(f);
    watch.observe(s);
    measure();

    return () => watch.disconnect();
  }, []);

  return (
    <div ref={frame} data-sheet-frame="" className="overflow-hidden" style={fit ? { height: fit.height } : undefined}>
      <div ref={scaler} data-sheet-scale="" className="mx-auto w-fit origin-top-left" style={fit ? { transform: `scale(${fit.scale})`, marginInline: 0 } : undefined}>
        <article ref={ref} data-ui="document" data-print-fit={onePage || undefined} aria-label={label} style={{ width: PAPER_WIDTH }} className="min-h-[420px] border border-line bg-paper px-[30px] py-7 font-body text-[12.5px] leading-snug text-paper-ink">
          {children}
        </article>
      </div>
    </div>
  );
});

export function Letterhead({ company, title, no, date }: { company: Company; title: string; no: string; date?: string }) {
  return (
    <header className="mb-3.5 flex justify-between gap-4 border-b-2 border-paper-gold pb-2.5">
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="" className="size-11 object-contain" />
        <div>
          <p className="m-0 font-display text-[12.5px] font-bold tracking-[0.04em]">{company.name}</p>
          <p className="m-0 text-[11px] text-paper-muted">{company.address}</p>
          <p className="m-0 text-[11px] text-paper-muted">{company.contact}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="m-0 font-display text-[13px] font-semibold tracking-[0.1em] text-paper-gold uppercase">{title}</p>
        <p className="m-0 text-xs font-medium tabular-nums">{no}</p>
        {date && <p className="m-0 text-xs font-medium tabular-nums">{date}</p>}
      </div>
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
