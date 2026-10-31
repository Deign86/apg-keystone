import logo from '@keystone/ui/logo.png';
import { forwardRef, type ReactNode } from 'react';
import { peso, toCentavos, type Company, type LineItem } from '@keystone/core';

// Building blocks for printed documents, on white paper tokens. A module composes its
// own document from these (the voucher, the statement); the element on screen is the
// one that is printed and turned into a PDF, so the preview is exactly the output.

export const Sheet = forwardRef<HTMLDivElement, { children: ReactNode; label: string }>(function Sheet({ children, label }, ref) {
  return (
    <article ref={ref} data-ui="document" aria-label={label} className="min-h-[420px] overflow-x-auto border border-line bg-paper px-[30px] py-7 font-body text-[12.5px] leading-snug text-paper-ink">
      {children}
    </article>
  );
});

export function Letterhead({ company, title, no }: { company: Company; title: string; no: string }) {
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

export function Lines({ middle, lines, empty, middleOf, footer }: { middle: string; lines: LineItem[]; empty: string; middleOf: (l: LineItem) => string; footer: [string, string, boolean?][] }) {
  return (
    <table className="my-2 w-full border-collapse">
      <thead>
        <tr className="border-y border-paper-ink text-left text-[11px] tracking-[0.04em] uppercase">
          <th className="px-1.5 py-1 font-semibold">Description</th>
          <th className="px-1.5 py-1 font-semibold">{middle}</th>
          <th className="px-1.5 py-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr><td colSpan={3} className="px-1.5 py-1.5 text-paper-muted">{empty}</td></tr>
        )}
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-paper-rule align-top">
            <td className="px-1.5 py-1.5">{l.desc}</td>
            <td className="px-1.5 py-1.5 text-paper-muted">{middleOf(l)}</td>
            <td className="px-1.5 py-1.5 text-right whitespace-nowrap tabular-nums">{peso(toCentavos(l.amt))}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {footer.map(([k, v, grand]) => (
          <tr key={k} className={grand ? 'border-t-2 border-paper-gold text-[13.5px]' : ''}>
            <td colSpan={2} className="px-1.5 py-1 font-semibold">{k}</td>
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
