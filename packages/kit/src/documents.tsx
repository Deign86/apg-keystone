// The Group of Companies logo made for white paper, drawn in HD so it stays sharp on screen and in print.
import companiesLogo from '@keystone/ui/logo-paper-companies.png';
import { forwardRef, Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DASH, peso, toCentavos, type Company, type LineItem } from '@keystone/core';
import { HALF_PAGE_HEIGHT, LANDSCAPE_PAGE, MARKS, TWO_UP, TWO_UP_EDGE, UPRIGHT, type PaperLayout } from './paper';
import { useSignatureSize } from './context';

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

/** A document on an upright A4 page, inside the print margins (`UPRIGHT`). */
export const Sheet = forwardRef<HTMLElement, { children: ReactNode; label: string }>(function Sheet({ children, label }, ref) {
  return <Paper ref={ref} label={label} layout={UPRIGHT} className={PADDED}>{children}</Paper>;
});

/**
 * A document on an A4 page turned on its side, for a sheet too wide to stand upright, printed scaled to a single page
 * however long it is (`LANDSCAPE_PAGE`). Print and Export PDF use a landscape page.
 */
export const LandscapePage = forwardRef<HTMLElement, { children: ReactNode; label: string }>(function LandscapePage({ children, label }, ref) {
  return <Paper ref={ref} label={label} layout={LANDSCAPE_PAGE} className={PADDED}>{children}</Paper>;
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
 * Every paper's header, the same on each (docs/adr/0038): the document's title across the top, then the Group of
 * Companies logo with the company's address beside it, and the document's number and date on the right. The logo
 * names the company, so its name and contact are left out.
 */
export function Letterhead({ company, title, no, date }: { company: Company; title: string; no: string; date?: string }) {
  return (
    <header className="mb-3.5 border-b-2 border-paper-gold pb-2.5">
      <p className="m-0 mb-2 text-center font-display text-[17px] font-semibold tracking-[0.16em] text-paper-gold uppercase">{title}</p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <img src={companiesLogo} alt="Alpha Premier Group of Companies" className="h-15 w-auto shrink-0" />
          {company.address && <p className="m-0 min-w-0 border-l border-paper-line pl-4 text-[11px] text-pretty text-paper-muted">{company.address}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 text-[12.5px] font-semibold tabular-nums">{no}</p>
          {date && <p className="m-0 text-xs font-medium tabular-nums">{date}</p>}
        </div>
      </div>
    </header>
  );
}

// The papers' smallest text is 11px, the house minimum (docs/DESIGN.md), like every screen's but the ID card's.

/** A heading on a paper's tinted band (a table's columns, a total): the paper's gold, in tracked capitals. */
export const paperHeading = 'text-[11px] font-semibold tracking-[0.14em] text-paper-gold uppercase';

/**
 * A row of a paper's lines, banded as Sir Mark asked (docs/adr/0039): white, then the paper's gold tint, then white,
 * down the list, so each line reads across on its own. `i` counts from 0.
 */
export const paperStripe = (i: number) => (i % 2 ? 'bg-paper-tint' : 'bg-paper');

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
          <tr key={i} className={`border-b border-paper-rule align-top ${paperStripe(i)}`}>
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

/**
 * Who signs, side by side: a line, the name under it, the position when the document keeps one, and what they sign as.
 * With `signed` (a lookup of the signatures Company Details keeps, `signatureOf`), a signatory's signature prints above
 * their line.
 */
export function Signatures({ names, signed }: {
  names: ([who: string, role: string] | [who: string, role: string, position: string])[];
  signed?: (who: string) => string | undefined;
}) {
  return (
    <div className="mt-14 grid gap-8" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0,1fr))` }}>
      {names.map(([who, role, position]) => {
        const signature = who ? signed?.(who) : undefined;

        return (
          <div key={role} className="relative border-t border-paper-ink pt-1 text-[11px]">
            {signature && <SignatureImage src={signature} who={who} />}
            <p className="m-0 min-h-4 font-bold">{who}</p>
            {/* Under the name, the signatory's position, when the document keeps one. */}
            {position && <p className="m-0 font-semibold">{position}</p>}
            <p className={`m-0 mt-0.5 ${paperLabel}`}>{role}</p>
          </div>
        );
      })}
    </div>
  );
}

/** How much empty paper is left around a signature's ink once it is trimmed, in the image's own pixels. */
const SIGNATURE_MARGIN = 4;

/** How strongly a pixel has to be inked to count as part of the signature, out of 255. */
const INKED = 24;

/**
 * The signature with the empty paper around its ink cut away, so every signature, however much margin its scan or
 * drawing had, fills the same height over its line. Signatures are kept with their paper see-through (company
 * Details), so the ink is whatever is not see-through. Unchanged when this computer cannot read the image.
 */
export async function trimSignature(src: string): Promise<string> {
  const image = new Image();

  image.src = src;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const read = document.createElement('canvas');

  read.width = width;
  read.height = height;
  const g = read.getContext('2d');

  if (!g || !width || !height) return src;
  g.drawImage(image, 0, 0);
  const alpha = g.getImageData(0, 0, width, height).data;
  let [left, top, right, bottom] = [width, height, -1, -1];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[(y * width + x) * 4 + 3] > INKED) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < 0) return src;
  [left, top] = [Math.max(0, left - SIGNATURE_MARGIN), Math.max(0, top - SIGNATURE_MARGIN)];
  [right, bottom] = [Math.min(width - 1, right + SIGNATURE_MARGIN), Math.min(height - 1, bottom + SIGNATURE_MARGIN)];
  const cut = document.createElement('canvas');

  cut.width = right - left + 1;
  cut.height = bottom - top + 1;
  cut.getContext('2d')?.drawImage(read, left, top, cut.width, cut.height, 0, 0, cut.width, cut.height);

  return cut.toDataURL('image/png');
}

/** Each kept signature trimmed once for as long as Keystone is open: every paper that shows it shares the work. */
const trimmed = new Map<string, Promise<string>>();

/** The signature to show: the kept one at first, then trimmed once that is done (it stays as kept if it cannot be). */
function useTrimmed(src: string): string {
  const [shown, setShown] = useState(src);

  useEffect(() => {
    let live = true;

    setShown(src);

    if (!trimmed.has(src)) trimmed.set(src, trimSignature(src).catch(() => src));
    void trimmed.get(src)?.then((t) => { if (live) setShown(t); });

    return () => { live = false; };
  }, [src]);

  return shown;
}

/** A signature's standard height, in rem (h-12): its size is a share of this. */
const SIGNATURE_HEIGHT = 3;

/** How far the resize handle is dragged, in CSS px, to add the standard height once more. */
const DRAG_PER_SIZE = 48;

/** A size step for the arrow keys on the resize handle. */
const SIZE_STEP = 0.1;

const clampSize = (n: number) => Math.min(2, Math.max(0.5, n));

/**
 * A signature over the line it is signed on, in the room above it, centered on its line. Trimmed to its ink and drawn
 * at one height (its signatory's size, kept with the signatures), so every signature reads alike whatever was
 * uploaded. Its box sits on the line, so it never moves the line. Where it may be resized (the CEO, on screen), a
 * handle shows on hover or focus: drag it up to enlarge, down to shrink, or use the arrow keys; Home is the standard
 * size. The handle never prints.
 */
export function SignatureImage({ src, who }: { src: string; who: string }) {
  const shown = useTrimmed(src);
  const { size, resize } = useSignatureSize(who);
  // The size while the handle is being dragged, before it is let go and kept.
  const [dragging, setDragging] = useState<{ from: number; at: number; size: number } | null>(null);
  const live = dragging?.size ?? size;

  return (
    // The full width of the line, centring what it holds, so a wide signature may use all of it.
    <span className="absolute inset-x-0 bottom-full mb-0.5 flex justify-center" style={{ height: `${SIGNATURE_HEIGHT * live}rem` }}>
      <span className="group relative flex h-full max-w-full items-end">
        <img src={shown} alt={`Signature of ${who}`} className="pointer-events-none h-full max-w-full object-contain object-bottom" />
        {resize && (
          <span
            role="slider"
            tabIndex={0}
            aria-label={`Size of ${who}'s signature`}
            aria-valuemin={50}
            aria-valuemax={200}
            aria-valuenow={Math.round(live * 100)}
            aria-valuetext={`${Math.round(live * 100)}%`}
            title="Drag to resize this signature on every paper"
            className="absolute -top-1.5 -right-1.5 size-3 cursor-ns-resize touch-none rounded-full border border-paper-gold bg-paper opacity-0 group-hover:opacity-100 focus:opacity-100 print:hidden"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging({ from: e.clientY, at: size, size }); }}
            onPointerMove={(e) => { if (dragging) setDragging({ ...dragging, size: clampSize(dragging.at + (dragging.from - e.clientY) / DRAG_PER_SIZE) }); }}
            onPointerUp={() => { if (dragging) resize(dragging.size); setDragging(null); }}
            onPointerCancel={() => setDragging(null)}
            onKeyDown={(e) => {
              const step = { ArrowUp: SIZE_STEP, ArrowRight: SIZE_STEP, ArrowDown: -SIZE_STEP, ArrowLeft: -SIZE_STEP }[e.key];

              if (step !== undefined) { e.preventDefault(); resize(clampSize(size + step)); }

              if (e.key === 'Home') { e.preventDefault(); resize(1); }
            }}
          />
        )}
      </span>
    </span>
  );
}

export const orDash = (s?: string) => (s && s.trim() ? s : DASH);
