import { forwardRef, Fragment, useState, type ReactNode } from 'react';
import { DASH, longDate, peso, shortDate, sumCentavos, toCentavos, type Company } from '@keystone/core';
import {
  depositLines, dueOnSigning, EWT_RATE, leaseSchedule, monthlyRent, monthName, pdcSchedule, sqmFigure, topDetails, VAT_RATE, type Soa,
} from './rules';
import { Letterhead, orDash, paperHeading, paperLabel, paperStripe, paperValue, Sheet, usePaperPart } from '@keystone/kit';

// The company's Statement of Account, on an upright A4 page (the form it follows is drawn on its side). Under the
// letterhead every paper carries (docs/adr/0038): who and what the lease is for, then four parts, each worked out in
// the open so a lessee can follow it: (1) the monthly rent from the floor area and rate, with VAT and EWT, (2) the deposit and advance due on
// signing, less the reservation, (3) the rent in each lease year after escalation, (4) the postdated checks. Then notes.

const figure = sqmFigure;

/** A column of a part's table: its heading, and whether it holds figures (right-aligned, or centred for a quantity, in tabular digits). */
interface Column { header: string; figure?: boolean; centred?: boolean }

/**
 * A part's table, ruled as the statement's lines are: a firm line around it, light ones between columns and rows, the
 * headings on a pale gold band, the lines banded white and gold (docs/adr/0039), and its total, if it has one, on a
 * band.
 */
function Table({ label, columns, rows, total, empty }: { label: string; columns: Column[]; rows: ReactNode[][]; total?: [string, ReactNode]; empty: string }) {
  const cell = (i: number) => `px-2 py-1 ${i ? 'border-l border-paper-line' : ''} ${columns[i].figure ? `${columns[i].centred ? 'text-center' : 'text-right'} whitespace-nowrap tabular-nums` : ''}`;

  return (
    <table aria-label={label} className="mt-1.5 w-full border-collapse border border-paper-ink text-[11.5px]">
      <thead>
        <tr className={`border-b border-paper-line bg-paper-tint text-left ${paperHeading}`}>
          {columns.map((c, i) => <th key={c.header} className={`${cell(i)} font-semibold`}>{c.header}</th>)}
        </tr>
      </thead>
      <tbody>
        {!rows.length && <tr><td colSpan={columns.length} className="px-2 py-1 text-paper-muted">{empty}</td></tr>}
        {rows.map((r, i) => (
          <tr key={i} className={`border-b border-paper-rule align-top ${paperStripe(i)}`}>
            {r.map((v, j) => <td key={columns[j].header} className={cell(j)}>{v}</td>)}
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr className="border-t border-paper-ink bg-paper-tint">
            <td colSpan={columns.length - 1} className={`px-2 py-1 text-right ${paperHeading}`}>{total[0]}</td>
            <td className="border-l border-paper-line px-2 py-1 text-right text-[12.5px] font-bold whitespace-nowrap tabular-nums">{total[1]}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** One of the statement's four parts; `part` is also the part of the paper the form's fields for it fill. */
function Part({ n, title, part, children }: { n: number; title: string; part: string; children: ReactNode }) {
  const mark = usePaperPart();

  return (
    <section {...mark(part)} className="mt-4">
      <h2 className={`m-0 ${paperHeading}`}>{n}. {title}</h2>
      {children}
    </section>
  );
}

/** A taken-off amount, in brackets. */
const less = (c: number) => `(${peso(c)})`;

/**
 * A check's number where it is on the paper, changed by clicking it, for a checkbook that is not in order. It reads as
 * the number, with nothing to show it can be changed, so the paper prints and saves as it always has; the form says so.
 */
function CheckNumber({ no, value, onChange }: { no: number; value: string; onChange: (check: string) => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        aria-label={`Check ${no} number`}
        autoFocus
        defaultValue={value}
        className="w-full min-w-0 border-0 bg-paper p-0 font-[inherit] text-[length:inherit] text-paper-ink tabular-nums outline-1 outline-paper-gold outline-solid"
        onBlur={(e) => { onChange(e.currentTarget.value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();

          if (e.key === 'Escape') { e.currentTarget.value = value; e.currentTarget.blur(); }
        }}
      />
    );
  }

  return (
    // Named by the number it shows, so the row reads as it prints; what a click does is its description.
    <button type="button" title={`Change check ${no}’s number`} className="w-full cursor-text text-left hover:bg-paper-tint" onClick={() => setEditing(true)}>
      {orDash(value)}
    </button>
  );
}

export const SoaPaper = forwardRef<HTMLElement, { soa: Soa; company: Company; onCheckNumber?: (no: number, check: string) => void }>(function SoaPaper({ soa: a, company, onCheckNumber }, ref) {
  const rent = monthlyRent(a);
  const deposit = depositLines(a);
  const years = leaseSchedule(a);
  const checks = pdcSchedule(a);
  const base = peso(rent.base);
  const rate = peso(toCentavos(a.rate));
  const mark = usePaperPart();

  return (
    <Sheet ref={ref} label={`Statement of account ${a.no}`}>
      <Letterhead company={company} title="Statement of Account" no={a.no} date={`Prepared as of: ${a.date ? longDate(a.date) : DASH}`} />

      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {topDetails(a).map((d, i) => (
          <Fragment key={i}>
            <dt className={paperLabel}>{orDash(d.label)}</dt>
            <dd {...mark(d.part)} className={`m-0 ${paperValue}${d.figure ? ' tabular-nums' : ''}`}>{orDash(d.value)}</dd>
          </Fragment>
        ))}
      </dl>

      <Part n={1} title="Breakdown of the monthly rent" part="breakdown">
        <Table
          label="Breakdown"
          columns={[{ header: 'Particulars' }, { header: 'Sqm', figure: true }, { header: 'Rate', figure: true }, { header: 'Computation' }, { header: 'Amount', figure: true }]}
          rows={[
            ['Base rent', figure(a.sqm), rate, `${figure(a.sqm)} sqm × ${rate}`, base],
            [`${VAT_RATE}% VAT`, '', '', a.vat ? `${base} × ${VAT_RATE}%` : 'Not VAT-registered', a.vat ? peso(rent.vat) : DASH],
            [`Less: ${EWT_RATE}% EWT`, '', '', a.ewt ? `${base} × ${EWT_RATE}%` : 'Not withheld', a.ewt ? less(rent.ewt) : DASH],
          ]}
          total={['Monthly rent: base + VAT − EWT', peso(rent.net)]}
          empty=""
        />
      </Part>

      <Part n={2} title="Deposit and advance" part="deposit">
        <Table
          label="Deposit and advance"
          columns={[{ header: 'Description' }, { header: 'Amount', figure: true }, { header: 'Qty', figure: true, centred: true }, { header: 'Total amount', figure: true }, { header: 'Coverage' }, { header: 'Check no.' }]}
          rows={deposit.map((l) => [
            l.credit ? `Less: ${l.desc}` : l.desc, peso(l.amount), String(l.qty), l.credit ? less(l.total) : peso(l.total),
            <span key="coverage" className={paperValue}>{orDash(l.coverage)}</span>, <span key="check" className={paperValue}>{orDash(l.check)}</span>,
          ])}
          empty="No deposit or advance."
        />
        <p className="m-0 mt-1.5 flex justify-end gap-3 text-right">
          <span className={paperHeading}>Total due on signing</span>
          <span className="text-[12.5px] font-bold tabular-nums">{peso(dueOnSigning(a))}</span>
        </p>
      </Part>

      <Part n={3} title="Lease term and escalation" part="lease">
        <Table
          label="Lease term and escalation"
          columns={[{ header: 'Year' }, { header: 'Period' }, { header: 'Escalation', figure: true }, { header: 'Base rent', figure: true }, { header: 'VAT', figure: true }, { header: 'EWT', figure: true }, { header: 'Monthly rent', figure: true }]}
          rows={years.map((y) => [
            String(y.year), `${shortDate(y.from)} – ${shortDate(y.to)}`, y.escalation ? `${y.escalation}%` : DASH,
            peso(y.base), a.vat ? peso(y.vat) : DASH, a.ewt ? less(y.ewt) : DASH, peso(y.net),
          ])}
          empty="Enter the commencement date to see each lease year."
        />
      </Part>

      <Part n={4} title="Postdated checks (PDC): rental schedule" part="checks">
        <Table
          label="Postdated checks"
          columns={[{ header: 'No.', figure: true }, { header: 'Check date' }, { header: 'Bank' }, { header: 'Check number' }, { header: 'Amount', figure: true }, { header: 'Payment for' }]}
          rows={checks.map((c) => [
            String(c.no), longDate(c.date), <span key="bank" className={paperValue}>{orDash(c.bank)}</span>,
            onCheckNumber ? <CheckNumber no={c.no} value={c.check} onChange={(check) => onCheckNumber(c.no, check)} /> : orDash(c.check),
            peso(c.amount), `${monthName(c.month)} Rent`,
          ])}
          empty="Enter the commencement date to schedule the checks."
        />
        {checks.length > 0 && (
          <p className="m-0 mt-1.5 flex justify-end gap-3 text-right">
            <span className={paperHeading}>Total of {checks.length} checks</span>
            <span className="text-[12.5px] font-bold tabular-nums">{peso(sumCentavos(checks, (c) => c.amount))}</span>
          </p>
        )}
      </Part>

      {a.notes.trim() && (
        <section {...mark('notes')} className="mt-4">
          <h2 className={`m-0 ${paperHeading}`}>Notes</h2>
          <p className={`m-0 mt-1 text-[11px] whitespace-pre-line ${paperValue}`}>{a.notes}</p>
        </section>
      )}
    </Sheet>
  );
});
