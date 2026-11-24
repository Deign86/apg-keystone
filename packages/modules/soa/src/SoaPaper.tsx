import { forwardRef, type ReactNode } from 'react';
import { DASH, longDate, peso, shortDate, sumCentavos, toCentavos, type Company } from '@keystone/core';
import {
  depositLines, dueOnSigning, EWT_RATE, leaseSchedule, leaseTermsOf, monthlyRent, monthName, pdcSchedule, VAT_RATE, type Soa,
} from './rules';
import { Letterhead, orDash, paperHeading, paperLabel, Sheet } from '@keystone/kit';

// The company's Statement of Account, on an upright A4 page (the form it follows is drawn on its side). Under the
// letterhead every paper carries (docs/adr/0038): who and what the lease is for, then four parts, each worked out in
// the open so a lessee can follow it: (1) the monthly rent from the floor area and rate, with VAT and EWT, (2) the deposit and advance due on
// signing, less the reservation, (3) the rent in each lease year after escalation, (4) the postdated checks. Then notes.

/** A number of square metres or a rate, with its decimals only when it has them. */
const figure = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

/** A column of a part's table: its heading, and whether it holds figures (right-aligned, in tabular digits). */
interface Column { header: string; figure?: boolean }

/**
 * A part's table, ruled as the statement's lines are: a firm line around it, light ones between columns and rows, the
 * headings on a pale gold band, and its total, if it has one, on another.
 */
function Table({ label, columns, rows, total, empty }: { label: string; columns: Column[]; rows: ReactNode[][]; total?: [string, ReactNode]; empty: string }) {
  const cell = (i: number) => `px-2 py-1 ${i ? 'border-l border-paper-line' : ''} ${columns[i].figure ? 'text-right whitespace-nowrap tabular-nums' : ''}`;

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
          <tr key={i} className="border-b border-paper-rule align-top">
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

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className={`m-0 ${paperHeading}`}>{n}. {title}</h2>
      {children}
    </section>
  );
}

/** A taken-off amount, in brackets. */
const less = (c: number) => `(${peso(c)})`;

export const SoaPaper = forwardRef<HTMLElement, { soa: Soa; company: Company }>(function SoaPaper({ soa: a, company }, ref) {
  const rent = monthlyRent(a);
  const deposit = depositLines(a);
  const years = leaseSchedule(a);
  const checks = pdcSchedule(a);
  const base = peso(rent.base);
  const rate = peso(toCentavos(a.rate));

  return (
    <Sheet ref={ref} label={`Statement of account ${a.no}`}>
      <Letterhead company={company} title="Statement of Account" no={a.no} date={`Prepared as of: ${a.date ? longDate(a.date) : DASH}`} />

      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className={paperLabel}>Client</dt>
        <dd className="m-0 font-bold uppercase">{orDash(a.client)}</dd>
        <dt className={paperLabel}>Property address</dt>
        <dd className="m-0 font-medium">{orDash(a.property)}</dd>
        <dt className={paperLabel}>Lease terms</dt>
        <dd className="m-0 font-medium">{orDash(leaseTermsOf(a))}</dd>
        <dt className={paperLabel}>Payee</dt>
        <dd className="m-0 font-medium">{orDash(a.payee)}</dd>
        <dt className={paperLabel}>Contract commencement</dt>
        <dd className="m-0 font-medium tabular-nums">{a.commencement ? longDate(a.commencement) : DASH}</dd>
      </dl>

      <Part n={1} title="Breakdown of the monthly rent">
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

      <Part n={2} title="Deposit and advance">
        <Table
          label="Deposit and advance"
          columns={[{ header: 'Description' }, { header: 'Amount', figure: true }, { header: 'Qty', figure: true }, { header: 'Total amount', figure: true }, { header: 'Coverage' }, { header: 'Check no.' }]}
          rows={deposit.map((l) => [
            l.credit ? `Less: ${l.desc}` : l.desc, peso(l.amount), String(l.qty), l.credit ? less(l.total) : peso(l.total), orDash(l.coverage), orDash(l.check),
          ])}
          empty="No deposit or advance."
        />
        <p className="m-0 mt-1.5 flex justify-end gap-3 text-right">
          <span className={paperHeading}>Total due on signing</span>
          <span className="text-[12.5px] font-bold tabular-nums">{peso(dueOnSigning(a))}</span>
        </p>
      </Part>

      <Part n={3} title="Lease term and escalation">
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

      <Part n={4} title="Postdated checks (PDC): rental schedule">
        <Table
          label="Postdated checks"
          columns={[{ header: 'No.', figure: true }, { header: 'Check date' }, { header: 'Bank' }, { header: 'Check number' }, { header: 'Amount', figure: true }, { header: 'Payment for' }]}
          rows={checks.map((c) => [String(c.no), longDate(c.date), orDash(c.bank), orDash(c.check), peso(c.amount), `${monthName(c.month)} Rent`])}
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
        <section className="mt-4">
          <h2 className={`m-0 ${paperHeading}`}>Notes</h2>
          <p className="m-0 mt-1 text-[11px] whitespace-pre-line">{a.notes}</p>
        </section>
      )}
    </Sheet>
  );
});
