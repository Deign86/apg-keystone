import logo from '@keystone/ui/logo.png';
import { forwardRef, type ReactNode } from 'react';
import {
  amountInWords, longDate, peso, shortDate, statementTotals, toCentavos, verificationCells, verificationSeed, voucherTotal,
  VERIFICATION_SIZE, type Company, type DirectoryRecord, type IDRecord, type LineItem, type Statement, type Voucher,
} from '@keystone/core';

// The printed documents, on white paper tokens. The element on screen is the one that
// is printed and turned into a PDF, so the preview is exactly the output.

const Sheet = forwardRef<HTMLDivElement, { children: ReactNode; label: string }>(function Sheet({ children, label }, ref) {
  return (
    <article ref={ref} data-ui="document" aria-label={label} className="min-h-[420px] overflow-x-auto border border-line bg-paper px-[30px] py-7 font-body text-[12.5px] leading-snug text-paper-ink">
      {children}
    </article>
  );
});

function Letterhead({ company, title, no }: { company: Company; title: string; no: string }) {
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

function Meta({ rows }: { rows: [string, ReactNode, boolean?][] }) {
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

function Lines({ middle, lines, empty, middleOf, footer }: { middle: string; lines: LineItem[]; empty: string; middleOf: (l: LineItem) => string; footer: [string, string, boolean?][] }) {
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

function Signatures({ names, className = '' }: { names: [string, string][]; className?: string }) {
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

const orDash = (s?: string) => (s && s.trim() ? s : '—');

export const VoucherPaper = forwardRef<HTMLDivElement, { voucher: Voucher; payee?: DirectoryRecord; company: Company }>(function VoucherPaper({ voucher: v, payee, company }, ref) {
  const total = voucherTotal(v);
  return (
    <Sheet ref={ref} label={`Check voucher ${v.no}`}>
      <Letterhead company={company} title="Check Voucher" no={v.no} />
      <Meta rows={[
        ['Payee', payee?.name ?? '—', true], ['Date', longDate(v.date)],
        ['Address', orDash(payee?.detail)], ['TIN', orDash(payee?.tin)],
        ['Bank', v.bank], ['Check No.', v.check || '________'],
      ]} />
      <Lines middle="Account" lines={v.lines} empty="No particulars yet." middleOf={(l) => l.acct ?? ''} footer={[['Total', peso(total), true]]} />
      <p className="my-2.5 border border-paper-line px-2.5 py-2 italic"><b className="not-italic">Amount in words:</b> {amountInWords(total)}</p>
      <Signatures names={[[v.prepared, 'Prepared by'], [v.checked, 'Checked by'], [v.approved, 'Approved by'], ['', 'Received by / Date']]} />
      <p className="mt-5 mb-0 border-t border-dashed border-paper-line pt-2.5 text-[11px] text-paper-muted">
        Received from Alpha Premier Group the amount of {peso(total)} in full payment of the above. Signature over printed name: ____________________ Date: __________
      </p>
    </Sheet>
  );
});

export const StatementPaper = forwardRef<HTMLDivElement, { statement: Statement; client?: DirectoryRecord; company: Company; terms: string }>(function StatementPaper({ statement: b, client, company, terms }, ref) {
  const t = statementTotals(b);
  const footer: [string, string, boolean?][] = [['Subtotal', peso(t.subtotal)]];
  if (b.vat) footer.push(['Add: 12% VAT', peso(t.vat)]);
  if (b.ewt) footer.push(['Less: 5% expanded withholding tax (BIR Form 2307 to follow)', `(${peso(t.ewt)})`]);
  footer.push(['Total amount due', peso(t.due), true]);
  return (
    <Sheet ref={ref} label={`Billing statement ${b.no}`}>
      <Letterhead company={company} title="Billing Statement" no={b.no} />
      <Meta rows={[
        ['Bill to', client?.name ?? '—', true], ['Statement date', longDate(b.date)],
        ['Address', orDash(client?.detail)], ['Due date', longDate(b.due), true],
        ['TIN', orDash(client?.tin)], ['Period', orDash(b.period)],
        ['Reference', orDash(b.ref)], ['Terms', terms],
      ]} />
      <Lines middle="Reference" lines={b.lines} empty="No charges yet." middleOf={(l) => l.ref ?? ''} footer={footer} />
      {b.notes && <p className="mt-3 mb-0 text-[11px] text-paper-muted">{b.notes}</p>}
      <Signatures className="max-w-[420px]" names={[['Accounting', 'Prepared by'], ['', 'Received by / Date']]} />
    </Sheet>
  );
});

function Pattern({ text }: { text: string }) {
  const cells = verificationCells(text);
  const n = VERIFICATION_SIZE;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="block size-16 rounded-[3px] border-[3px] border-white bg-white" role="img" aria-label="Verification pattern" shapeRendering="crispEdges">
      {cells.flatMap((row, y) => row.map((dark, x) => (dark ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#111" /> : null)))}
    </svg>
  );
}

const CARD = 'relative h-[var(--size-card-h)] w-[var(--size-card-w)] shrink-0 overflow-hidden rounded-id-card border border-line text-ink';

/** Front and back of a CR80 card. The foil stripe is flat gold: no gradients anywhere. */
export const IDCardSheet = forwardRef<HTMLDivElement, { card: IDRecord; photo: string | null; company: Company }>(function IDCardSheet({ card, photo, company }, ref) {
  return (
    <div ref={ref} data-ui="document" className="flex flex-wrap justify-center gap-4 bg-surface p-4">
      <div className={`${CARD} bg-card-bg`} aria-label={`ID card front for ${card.name || 'a new employee'}`}>
        <div className="flex items-center gap-2 border-b border-line px-3.5 pt-3.5 pb-2.5">
          <img src={logo} alt="" className="size-[26px] object-contain" />
          <div>
            <p className="m-0 font-display text-[8.5px] leading-tight font-bold">ALPHA PREMIER <span className="text-gold-bright">GROUP</span></p>
            <p className="m-0 text-[7.5px] tracking-[0.12em] text-ink-2 uppercase">Employee identification</p>
          </div>
        </div>
        <div className="mx-auto mt-4 mb-2.5 grid size-[118px] place-items-center overflow-hidden rounded-[8px] border-2 border-gold bg-surface-2 text-[10.5px] text-ink-3">
          {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <span className="text-ink-2">2×2 photo</span>}
        </div>
        <p className="m-0 px-2.5 text-center font-display text-xs leading-tight font-semibold break-words">{card.name || 'Employee name'}</p>
        <p className="mt-1 mb-0 px-2.5 text-center text-[10.5px] font-semibold text-gold-bright">{card.pos || 'Position'}</p>
        <p className="m-0 text-center text-[9.5px] text-ink-2">{card.dept}</p>
        <div className="absolute right-3.5 bottom-3.5 left-3.5 flex items-end justify-between text-[10px] text-gold-bright tabular-nums">
          <div><p className="m-0 text-[7.5px] tracking-[0.1em] text-ink-3 uppercase">ID No.</p>{card.no}</div>
          <div className="text-right"><p className="m-0 text-[7.5px] tracking-[0.1em] text-ink-3 uppercase">Valid until</p>{shortDate(card.valid)}</div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[5px] bg-gold" />
      </div>
      <div className={`${CARD} bg-card-back`} aria-label="ID card back">
        <div className="mt-[18px] h-[34px] bg-black" />
        <div className="px-3.5 pt-2.5 text-[8.5px] leading-snug text-ink-2">
          <p className="m-0 mb-0.5 text-[8px] tracking-[0.1em] text-gold uppercase">Emergency contact</p>
          <p className="m-0 mb-2 text-ink">{card.iceName || '—'}{card.iceNo ? ` · ${card.iceNo}` : ''}<br />Blood type: {card.blood}</p>
          <p className="m-0 mb-0.5 text-[8px] tracking-[0.1em] text-gold uppercase">If found</p>
          <p className="m-0 mb-1.5 text-ink">Please return to Alpha Premier Group, {company.shortAddress}, or call {company.phone}. This card is company property and must be surrendered upon separation.</p>
          <div className="flex justify-center"><Pattern text={verificationSeed(card.no, card.name)} /></div>
        </div>
        <div className="mx-3.5 mt-2 border-t border-gold pt-0.5 text-center text-[8px] text-ink-2">
          <p className="m-0 text-[9px] font-semibold text-ink">{card.signatory}</p>
          Authorized signature
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[5px] bg-gold" />
      </div>
    </div>
  );
});
