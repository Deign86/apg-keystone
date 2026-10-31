import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

// ---------- buttons ----------

const BUTTON = {
  primary: 'bg-gold text-gold-ink hover:bg-gold-bright border-transparent',
  secondary: 'bg-input text-gold-bright border-line-bright hover:border-gold hover:bg-surface-2',
  quiet: 'bg-transparent text-gold-bright border-transparent hover:bg-surface-2',
  danger: 'bg-transparent text-bad border-bad/50 hover:bg-bad-soft',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: keyof typeof BUTTON;
  size?: 'md' | 'sm';
}

/** Flat buttons: one gold primary per screen, outlined secondary, quiet and danger. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { kind = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-control border font-semibold whitespace-nowrap select-none',
        'transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'md' ? 'h-9 px-3.5 text-[13px]' : 'h-7 px-2.5 text-xs',
        BUTTON[kind],
        className,
      )}
      {...rest}
    />
  );
});

// ---------- type pieces ----------

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow m-0', className)}>{children}</p>;
}

/** The gold heading inside a card ("Voucher register"). */
export function SectionLabel({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn('eyebrow m-0 text-[11px]', className)}>
      {children}
    </h2>
  );
}

/** Eyebrow, the screen's title, the one line that says what matters, actions on the right. */
export function ScreenHeader({ eyebrow, title, line, actions }: { eyebrow: string; title: string; line: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0 max-w-[68ch]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-1.5 font-body text-[34px] leading-tight font-bold text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-2" aria-live="polite">{line}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** A card: one tone up from the ground with a 1px line. No shadow. */
export function Panel({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'form' } & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  return (
    <As className={cn('rounded-card border border-line bg-surface p-[18px]', className)} {...rest}>
      {children}
    </As>
  );
}

/** The numbered square for keyboard shortcuts, filled gold when active, as in the attendance tracker. */
export function KeyBadge({ n, active = false }: { n: number | string; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[22px] shrink-0 place-items-center rounded-pill border font-display text-[11px] font-bold',
        active ? 'border-gold bg-gold text-gold-ink' : 'border-line bg-surface-2 text-ink-2',
      )}
    >
      {n}
    </span>
  );
}

const PILL: Record<Tone, string> = {
  good: 'text-good border-good/55',
  warn: 'text-warn border-warn/55',
  bad: 'text-bad border-bad/55',
  neutral: 'text-ink-2 border-line-bright',
};

/** Outlined status capsule in Orbitron capitals, as in the attendance tracker. */
export function StatusPill({ status, tone }: { status: string; tone: Tone }) {
  return (
    <span className={cn('inline-block rounded-full border px-2.5 py-0.5 font-display text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase', PILL[tone])}>
      {status}
    </span>
  );
}

/** A module tag in the activity log ("CV"). */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block min-w-[38px] rounded-[3px] bg-gold-tint px-1.5 py-0.5 text-center font-display text-[11px] font-bold text-gold-bright">
      {children}
    </span>
  );
}

/** One sentence and the one action that fixes it. */
export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-2.5 py-3.5 text-[13px] text-ink-2">
      <p className="m-0">{text}</p>
      {action}
    </div>
  );
}

export interface Figure {
  label: string;
  value: string;
  caption: string;
}

/** One container split by 1px lines: label, figure, and what the figure counts. No icons. */
export function FigureStrip({ figures, lead }: { figures: Figure[]; lead?: number }) {
  return (
    // The lead figure is drawn larger, so its column is wider: a peso amount must never be cut off.
    <dl className="m-0 grid rounded-card border border-line bg-surface" style={{ gridTemplateColumns: figures.map((_, i) => `minmax(0, ${i === lead ? 1.6 : 1}fr)`).join(' ') }}>
      {figures.map((f, i) => (
        <div key={f.label} className={cn('min-w-0 p-[18px]', i > 0 && 'border-l border-line')}>
          <dt className="text-[12.5px] font-medium text-ink-2">{f.label}</dt>
          <dd title={f.value} className={cn('m-0 mt-1.5 truncate font-display tabular-nums text-ink', i === lead ? 'text-[30px]' : 'text-[24px]')}>{f.value}</dd>
          <dd className="m-0 mt-1 text-xs text-ink-3">{f.caption}</dd>
        </div>
      ))}
    </dl>
  );
}
