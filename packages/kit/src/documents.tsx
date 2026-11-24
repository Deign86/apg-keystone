// The Group of Companies logo made for white paper, drawn in HD so it stays sharp on screen and in print.
import companiesLogo from '@keystone/ui/logo-paper-companies.png';
import { forwardRef, Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { clampOffset, DASH, peso, toCentavos, type Company, type LineItem, type SignatureOffset } from '@keystone/core';
import { HALF_PAGE_HEIGHT, LANDSCAPE_PAGE, MARKS, TWO_UP, TWO_UP_EDGE, UPRIGHT, type PaperLayout } from './paper';
import { useSignatureSize } from './context';
import { usePaperPart } from './parts';

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
 * names the company, so its name and contact are left out. Its number is the part `no` and its date the part `date`,
 * for the fields that fill them (`Fills`).
 */
export function Letterhead({ company, title, no, date }: { company: Company; title: string; no: string; date?: string }) {
  const part = usePaperPart();

  return (
    <header className="mb-3.5 border-b-2 border-paper-gold pb-2.5">
      <p className="m-0 mb-2 text-center font-display text-[17px] font-semibold tracking-[0.16em] text-paper-gold uppercase">{title}</p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <img src={companiesLogo} alt="Alpha Premier Group of Companies" className="h-15 w-auto shrink-0" />
          {company.address && <p className="m-0 min-w-0 border-l border-paper-line pl-4 text-[11px] text-pretty text-paper-muted">{company.address}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p {...part('no')} className="m-0 text-[12.5px] font-semibold tabular-nums">{no}</p>
          {date && <p {...part('date')} className="m-0 text-xs font-medium tabular-nums">{date}</p>}
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
 * labels lined up so the values start together. `strong` sets a value in bold; `part` names the value as the part of
 * the paper a field fills (`Fills`).
 */
export function Meta({ rows }: { rows: [label: string, value: ReactNode, strong?: boolean, part?: string][] }) {
  const lastRow = Math.ceil(rows.length / 2) - 1;
  const mark = usePaperPart();

  return (
    <dl className="m-0 mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] border border-paper-ink">
      {rows.map(([k, v, strong, part], i) => {
        const under = Math.floor(i / 2) < lastRow ? 'border-b border-paper-line' : '';

        return (
          <Fragment key={k}>
            <dt className={`flex items-center py-1.5 pr-3 pl-2.5 ${paperLabel} ${under} ${i % 2 ? 'border-l border-paper-line' : ''}`}>{k}</dt>
            <dd {...mark(part)} className={`m-0 flex items-center py-1.5 pr-2.5 tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${under}`}>{v}</dd>
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
 * between columns and rows, the headings on a pale gold band and the grand total on another. `part` names the table
 * as the part of the paper a field fills (`Fills`).
 */
export function Lines({ columns, lines, empty, footer, part }: { columns: LineColumn[]; lines: LineItem[]; empty: string; footer: [string, string, boolean?][]; part?: string }) {
  const mark = usePaperPart();
  const cell = (i: number, figure?: boolean) => `px-2.5 py-1.5 ${i ? 'border-l border-paper-line' : ''} ${figure ? 'text-right whitespace-nowrap tabular-nums' : ''}`;

  return (
    <table {...mark(part)} className="my-2 w-full border-collapse border border-paper-ink">
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
 * their line. A signatory's `part` names their place as the part of the paper a field fills (`Fills`).
 */
export function Signatures({ names, signed }: {
  names: [who: string, role: string, position?: string, part?: string][];
  signed?: (who: string) => string | undefined;
}) {
  const mark = usePaperPart();

  // Kept on one page, its lines with their names, when a long paper runs onto another (break-inside-avoid).
  return (
    <div className="mt-14 grid break-inside-avoid gap-8" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0,1fr))` }}>
      {names.map(([who, role, position, part]) => {
        const signature = who ? signed?.(who) : undefined;

        return (
          <div key={role} {...mark(part)} className="relative border-t border-paper-ink pt-1 text-[11px]">
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

/** How long a signature's image may take to load before it is shown as kept, untrimmed. */
const LOAD_LIMIT_MS = 5000;

/**
 * The image at `src`, once loaded. By its load and error events, not `decode()`, which a webview can leave unsettled
 * and with it every signature untrimmed; given up on after a few seconds.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((done, fail) => {
    const image = new Image();
    const late = setTimeout(() => fail(new Error('The signature took too long to load.')), LOAD_LIMIT_MS);

    image.onload = () => { clearTimeout(late); done(image); };

    image.onerror = () => { clearTimeout(late); fail(new Error('The signature could not be read.')); };

    image.src = src;
  });
}

/**
 * The signature with the empty paper around its ink cut away, so every signature, however much margin its scan or
 * drawing had, fills the same box over its line. Signatures are kept with their paper see-through (company
 * Details), so the ink is whatever is not see-through. Unchanged when this computer cannot read the image.
 */
export async function trimSignature(src: string): Promise<string> {
  const image = await loadImage(src);
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

/** A signature's box at its standard size, in rem: 3 high (h-12), three times as wide. Its size scales both. */
const SIGNATURE_HEIGHT = 3;
const SIGNATURE_WIDTH = 9;

/** A size step for the arrow keys on the frame, and a move step for Shift and the arrow keys, in rem. */
const SIZE_STEP = 0.1;
const MOVE_STEP = 0.25;

/** One rem in CSS px, for a drag measured in px: the papers are laid out in rem at the browser's 16px. */
const REM = 16;

const clampSize = (n: number) => Math.min(2, Math.max(0.5, Math.round(n * 100) / 100));

/** A length in rem, to three decimals, so 3 × 1.1 is "3.3rem", not "3.3000000000000003rem". */
const rem = (n: number) => `${Math.round(n * 1000) / 1000}rem`;

/** How far the pointer is from where a signature sits on its line (the middle of its box's foot). */
const reach = (x: number, y: number, box: DOMRect) => Math.max(1, Math.hypot(x - (box.left + box.width / 2), y - box.bottom));

/** A drag on the frame: moving the signature from where it was, or resizing it by its corner. */
type Drag =
  | { kind: 'move'; x: number; y: number; from: SignatureOffset; scale: number; offset: SignatureOffset }
  | { kind: 'size'; at: number; from: number; size: number };

/**
 * A signature over the line it is signed on, in the room above it. Every signature is trimmed to its ink and drawn
 * into the same box, three times as wide as it is high, sitting on the middle of its line: scaled to fit, so a tall
 * signature and a wide one take the same room, and every signatory's reads alike whatever was uploaded. The box is
 * its signatory's size (kept with the signatures) times the standard, and is not held to the line's width, so a larger
 * size is always larger. It never moves the line.
 *
 * Where it may be changed (the CEO, on screen), a dashed frame shows around it on hover or focus. Drag the signature to
 * move it anywhere about its line, a correction where trimming left it off; drag the square at the frame's top right
 * corner to resize it from where it sits; or use the arrow keys to resize, Shift and the arrow keys to move, and Home
 * for the standard size and place. Size and place are kept for that signatory, on every paper. The frame never prints.
 * A finger has no hover: on a touch screen the frame always shows (never in an exported PDF), and the corner takes a
 * press from well around it.
 */
export function SignatureImage({ src, who }: { src: string; who: string }) {
  const shown = useTrimmed(src);
  const { size, offset, resize, move } = useSignatureSize(who);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The last size and place asked for from the keyboard, so presses quicker than the paper redraws still add up.
  const asked = useRef<{ size: number; offset: SignatureOffset } | null>(null);
  const live = drag?.kind === 'size' ? drag.size : size;
  const at = drag?.kind === 'move' ? drag.offset : offset;

  useEffect(() => { asked.current = null; }, [size, offset.x, offset.y]);

  const now = () => asked.current ?? { size, offset };

  const keepSize = (next: number) => {
    asked.current = { ...now(), size: clampSize(next) };
    resize?.(asked.current.size);
  };

  const keepPlace = (next: SignatureOffset) => {
    asked.current = { ...now(), offset: clampOffset(next) };
    move?.(asked.current.offset);
  };

  return (
    <span
      className="group absolute bottom-full left-1/2 mb-0.5"
      style={{
        height: rem(SIGNATURE_HEIGHT * live),
        width: rem(SIGNATURE_WIDTH * live),
        transform: `translate(calc(-50% + ${rem(at.x)}), ${rem(at.y)})`,
      }}
    >
      <img src={shown} alt={`Signature of ${who}`} className="pointer-events-none size-full object-contain object-bottom" />
      {resize && move && (
        <span
          role="slider"
          tabIndex={0}
          aria-label={`Size of ${who}'s signature`}
          aria-valuemin={50}
          aria-valuemax={200}
          aria-valuenow={Math.round(live * 100)}
          aria-valuetext={`${Math.round(live * 100)}%${at.x || at.y ? ', moved' : ''}`}
          title="Drag to move this signature; drag the corner to resize it. On every paper."
          className="absolute inset-0 cursor-move touch-none outline-1 outline-offset-2 outline-paper-mark outline-dashed opacity-0 group-hover:opacity-100 focus:opacity-100 print:hidden [[data-pdf-drawing]_&]:hidden [[data-touch]_&]:opacity-100"
          onPointerDown={(e) => {
            const box = e.currentTarget.getBoundingClientRect();

            e.currentTarget.setPointerCapture(e.pointerId);
            // How much the preview is scaled down on screen, so the signature follows the pointer exactly.
            setDrag({ kind: 'move', x: e.clientX, y: e.clientY, from: offset, scale: box.width / (SIGNATURE_WIDTH * size * REM), offset });
          }}
          onPointerMove={(e) => {
            if (drag?.kind !== 'move') return;
            const toRem = (px: number) => px / drag.scale / REM;

            setDrag({ ...drag, offset: clampOffset({ x: drag.from.x + toRem(e.clientX - drag.x), y: drag.from.y + toRem(e.clientY - drag.y) }) });
          }}
          onPointerUp={() => {
            if (drag?.kind === 'move' && (drag.offset.x !== offset.x || drag.offset.y !== offset.y)) keepPlace(drag.offset);
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(e) => {
            const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];

            if (step && e.shiftKey) {
              e.preventDefault();
              const { offset: from } = now();

              keepPlace({ x: from.x + step[0] * MOVE_STEP, y: from.y + step[1] * MOVE_STEP });
            } else if (step) {
              e.preventDefault();
              // Up and right enlarge, down and left shrink.
              keepSize(now().size + (step[0] + -step[1]) * SIZE_STEP);
            }

            if (e.key === 'Home') {
              e.preventDefault();
              keepSize(1);
              keepPlace({ x: 0, y: 0 });
            }
          }}
        >
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 size-2.5 cursor-nesw-resize touch-none border border-paper-mark bg-paper [[data-touch]_&]:after:absolute [[data-touch]_&]:after:-inset-5 [[data-touch]_&]:after:content-['']"
            onPointerDown={(e) => {
              const box = e.currentTarget.parentElement?.getBoundingClientRect();

              e.stopPropagation();

              if (!box) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ kind: 'size', at: size, from: reach(e.clientX, e.clientY, box), size });
            }}
            onPointerMove={(e) => {
              const box = e.currentTarget.parentElement?.getBoundingClientRect();

              if (drag?.kind === 'size' && box) setDrag({ ...drag, size: clampSize((drag.at * reach(e.clientX, e.clientY, box)) / drag.from) });
            }}
            onPointerUp={(e) => {
              e.stopPropagation();

              if (drag?.kind === 'size' && drag.size !== size) keepSize(drag.size);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          />
        </span>
      )}
    </span>
  );
}

export const orDash = (s?: string) => (s && s.trim() ? s : DASH);
