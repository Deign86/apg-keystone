import { Button, CellInput, EmptyState, Field, FieldMarks, FieldRow, Panel, SectionLabel, SelectInput, Tag, TextInput, cn, useConfirm, type Refusal } from '@keystone/ui';
import { Pin, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent as KeyEvent, type ReactNode } from 'react';
import { companyOf, lineDraft, SERVICES, shortDate, signatoryNames, signedNames, type BankAccount, type Connector, type LineDraft, type LinePricing, type LogEntry } from '@keystone/core';
import { useChangedElsewhere, useConnectorUpdate, useDraft, useKeystone, useModuleApp, useOpenConnector, type HeldRecord } from './context';
import { MARKS } from './paper';
import { ActivePart, FILLS } from './parts';

// The module kit: building blocks any module may use. Everything here belongs to the
// kernel, so a module that uses it can be removed without touching another module.

/**
 * Description · amount · remove; or, priced by unit, description · quantity · unit price · remove. A refusal names a
 * cell as `<name>.<line index>.<desc|qty|amount>` (`lines.0.amount`). Enter in a line that is filled in moves to the
 * next line, adding one after the last; in a line that is not, it moves to its empty box. Either way it never submits
 * the form around it.
 */
export function LineEditor({ title, lines, onChange, pricing = 'amount', name = 'lines' }: { title: string; lines: LineDraft[]; onChange: (l: LineDraft[]) => void; pricing?: LinePricing; name?: string }) {
  const set = (id: string, patch: Partial<LineDraft>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const unit = pricing === 'unit';
  const box = useRef<HTMLFieldSetElement>(null);
  // The line whose description takes the caret once it is drawn (counted from 1), after Enter moved on.
  const [focusLine, setFocusLine] = useState<number | null>(null);

  useEffect(() => {
    if (focusLine === null) return;
    box.current?.querySelector<HTMLInputElement>(`input[aria-label="Line ${focusLine} description"]`)?.focus();
    setFocusLine(null);
  }, [focusLine, lines.length]);

  const filled = (l: LineDraft) => !!(l.desc.trim() && l.amount.trim() && (!unit || l.qty.trim()));

  const enter = (e: KeyEvent<HTMLDivElement>, i: number) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
    e.preventDefault();

    if (!filled(lines[i])) {
      [...e.currentTarget.querySelectorAll('input')].find((cell) => !cell.value.trim())?.focus();

      return;
    }

    if (i === lines.length - 1) onChange([...lines, lineDraft()]);
    setFocusLine(i + 2);
  };

  return (
    <fieldset ref={box} className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <div className="flex items-center justify-between">
        <legend className="text-[12.5px] font-medium">{title}</legend>
        <Button size="sm" onClick={() => onChange([...lines, lineDraft()])}>Add line</Button>
      </div>
      {lines.map((l, i) => (
        <div
          key={l.id}
          role="group"
          aria-label={`Line ${i + 1}`}
          onKeyDown={(e) => enter(e, i)}
          className={cn('grid items-center gap-1.5', unit ? 'grid-cols-[minmax(0,1fr)_64px_112px_32px]' : 'grid-cols-[minmax(0,1fr)_112px_32px]')}
        >
          <CellInput name={`${name}.${i}.desc`} label={`Line ${i + 1} description`} placeholder="Description" value={l.desc} onChange={(v) => set(l.id, { desc: v })} />
          {unit && <CellInput name={`${name}.${i}.qty`} label={`Line ${i + 1} quantity`} placeholder="Qty" align="right" value={l.qty} onChange={(v) => set(l.id, { qty: v })} />}
          <CellInput name={`${name}.${i}.amount`} label={unit ? `Line ${i + 1} unit price` : `Line ${i + 1} amount`} placeholder={unit ? 'Unit price' : '0.00'} align="right" value={l.amount} onChange={(v) => set(l.id, { amount: v })} />
          <button
            type="button"
            aria-label={`Remove line ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
            className="grid size-8 place-items-center rounded-control text-ink-3 hover:text-bad disabled:opacity-30"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </fieldset>
  );
}

/** Where Workspace keeps whether the preview is pinned: one choice for every screen's preview, for as long as Keystone is open. */
const PINNED = 'workspace.pinned';

/**
 * The form on the left, the document it produces on the right; stacked under 1100px. Stacked, the one column is as wide
 * as the screen, never as wide as the paper, so the paper scales down to fit a phone.
 *
 * Side by side, the preview is pinned by default: it stays in view at the right while the form scrolls, and is never
 * taller than the window, so a paper taller than that (a full A4 statement, a two-up voucher in a wide or short window)
 * scrolls inside its own box and its foot can be read without scrolling to the end of the form. That box can be
 * scrolled from the keyboard too. Unpinned, the preview scrolls with the page and shows the whole paper at once.
 *
 * While a field the form wraps in `Fills` has focus, the part of the paper it fills is marked (parts.tsx), and the
 * pinned preview scrolls, at once, to bring that part into view. Leaving the field clears the mark.
 */
export function Workspace({ form, preview, previewTitle, previewNote = 'Updates as you type' }: { form: ReactNode; preview: ReactNode; previewTitle: string; previewNote?: string }) {
  const [pinned, setPinned] = useDraft(PINNED, () => true);
  const [active, setActive] = useState<string | null>(null);
  const fields = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement>(null);
  // The part the last field in the form filled. A picker's list opens outside the form, on top of the page, but its
  // focus still comes through the form: while the list is open, the part its field fills stays marked.
  const filled = useRef<string | null>(null);

  const onFocus = (e: FocusEvent) => {
    if (fields.current?.contains(e.target)) filled.current = e.target.closest(`[${FILLS}]`)?.getAttribute(FILLS) ?? null;
    setActive(filled.current);
  };

  useEffect(() => {
    const b = box.current;
    const part = active ? b?.querySelector(`[${MARKS.active}]`) : null;

    // Only a pinned preview that scrolls in its own box: stacked or unpinned, scrolling would take the page, and the
    // field with it, out of view.
    if (!b || !part || b.scrollHeight <= b.clientHeight) return;

    const r = part.getBoundingClientRect();
    const view = b.getBoundingClientRect();

    // In the middle of the box, or its top at the top when it is taller than the box. No smooth scroll: no motion.
    if (r.top < view.top || r.bottom > view.bottom) b.scrollTop += r.top - view.top - Math.max(0, (view.height - r.height) / 2);
  }, [active]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[1100px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Takes no room, so the form is still the grid's first column. */}
      <div ref={fields} className="contents" onFocus={onFocus} onBlur={() => setActive(null)}>{form}</div>
      <section
        ref={box}
        aria-label={previewTitle}
        // A box that scrolls on its own takes focus, so the arrow keys scroll it.
        tabIndex={pinned ? 0 : undefined}
        // The scrollbar's room is kept even when the paper fits, so its coming and going never rescales the paper.
        className={cn('rounded-control', pinned && 'min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:max-h-[calc(100dvh-2rem)] min-[1100px]:overflow-y-auto min-[1100px]:[scrollbar-gutter:stable]')}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionLabel>{previewTitle}</SectionLabel>
          <span className="ml-auto text-xs text-ink-2">{previewNote}</span>
          {/* Pinning only means something side by side; stacked, the preview is under the form either way. */}
          <Button
            size="sm"
            kind="quiet"
            aria-pressed={pinned}
            title={pinned ? 'Pinned: stays in view while the form scrolls' : 'Not pinned: scrolls with the page'}
            onClick={() => setPinned(!pinned)}
            className={cn('hidden min-[1100px]:inline-flex', pinned ? 'border-line-bright bg-surface-2' : 'text-ink-2')}
          >
            <Pin size={14} aria-hidden="true" />
            Pin preview
          </Button>
        </div>
        <ActivePart.Provider value={active}>{preview}</ActivePart.Provider>
      </section>
    </div>
  );
}

/**
 * A form card: its heading, the fields, and the save row. ⌘/Ctrl+S saves. The refusal, when there is one, is written
 * next to the save button as well as in a toast. A refusal that names fields (a refused run's outcome) also marks them
 * until each is edited, and the first takes the focus (FieldMarks).
 */
export function FormCard({
  id, eyebrow, title, children, actions, onSubmit, error, holds,
}: {
  id?: string; eyebrow: string; title: string; children: ReactNode; actions: ReactNode; onSubmit: () => void; error?: Refusal | null;
  /** The saved record the form holds, if any: the form says so when someone else changes it meanwhile (docs/adr/0047). */
  holds?: HeldRecord;
}) {
  const said = useId();
  const sentence = error?.error;
  const elsewhere = useChangedElsewhere(holds);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSubmit(); }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onSubmit]);

  return (
    <Panel as="form" id={id} aria-label={title} className="flex flex-col gap-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
      <div>
        <p className="eyebrow m-0">{eyebrow}</p>{/* taste-skill-ignore: the APG brand eyebrow (docs/DESIGN.md) */}
        <h2 className="mt-1 mb-0 font-display text-[15px] font-semibold">{title}</h2>
      </div>
      <FieldMarks refusal={error} describedBy={said}>{children}</FieldMarks>
      {/* By the save button, where it is read before saving over their change. */}
      {elsewhere && <p role="status" className="m-0 rounded-control bg-warn-soft px-3 py-2 text-[13px] text-pretty text-warn">{elsewhere}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {sentence && <p id={said} role="alert" className="m-0 mr-auto max-w-[44ch] text-[13px] text-bad">{sentence}</p>}
        {actions}
      </div>
    </Panel>
  );
}

/**
 * A connected system's shortcut: its app's logo, which opens the app, or fetches its installer when the app is not
 * on this computer. Under it, the newer version to install when one is out, asked when it shows and every hour after
 * (docs/adr/0007, 0029, 0035). A group named for the system, so "Update to …" is heard as that app's. Works for any
 * connector.
 */
export function ConnectorShortcut({ connector }: { connector: Connector }) {
  const open = useOpenConnector();
  const update = useConnectorUpdate(connector);
  const [doing, setDoing] = useState<string | null>(null);
  const busy = doing !== null;
  const run = (work: (say: (what: string) => void) => Promise<void>) => { setDoing(''); void work(setDoing).finally(() => setDoing(null)); };

  return (
    <div role="group" aria-label={connector.name} className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-label={`Open ${connector.name}`}
        aria-busy={busy}
        disabled={busy}
        onClick={() => run((say) => open(connector, say))}
        className="group flex aspect-[16/9] w-full flex-col items-center gap-2.5 overflow-hidden rounded-tile border border-line bg-surface px-4 pt-5 pb-3.5 transition-[border-color,background-color,transform] duration-200 ease-out hover:border-gold hover:bg-surface-2 disabled:cursor-progress motion-safe:hover:-translate-y-0.5"
      >
        <img
          src={connector.logo}
          alt=""
          draggable={false}
          className="pointer-events-none min-h-0 w-full flex-1 object-contain transition-transform duration-300 ease-out select-none motion-safe:group-hover:scale-[1.04]"
        />
        <span className="font-display text-[13px] font-semibold text-ink" role={doing ? 'status' : undefined}>{doing || connector.name}</span>
      </button>
      {update && !busy && (
        <button
          type="button"
          onClick={() => run((say) => update.install(say))}
          className="self-center rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-2 transition-colors duration-200 hover:border-gold hover:text-ink"
        >
          Update to {update.version}
        </button>
      )}
    </div>
  );
}

/** Time, tag and what happened, one entry per line. */
export function Feed({ entries, compact = false }: { entries: LogEntry[]; compact?: boolean }) {
  if (!entries.length) return <EmptyState text="No activity yet." />;

  return (
    <ol className="m-0 list-none p-0">
      {entries.map((e, i) => (
        <li key={`${e.when}-${i}`} className={cn('grid items-baseline gap-x-3 border-t border-line py-2.5 text-[13px]', compact ? 'grid-cols-[46px_1fr]' : 'grid-cols-[140px_46px_1fr]', i === 0 && !compact && 'border-t-0')}>
          {!compact && <time className="text-xs text-ink-3 tabular-nums">{e.when}</time>}
          <Tag>{e.mod}</Tag>
          <span className="text-pretty">
            {e.text}
            {compact && <time className="ml-2 text-xs text-ink-3 tabular-nums">{shortDate(e.when.slice(0, 10))}</time>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The last choice in a signatory list, for a name not listed. No name is this: names are trimmed and have no "…". */
const OTHER_NAME = 'Other…';

/**
 * A signatory's name, picked from a list or typed under Other…, the same on every document that is signed. Once Company
 * Details keeps signatures, the list is whose they are, as kept, so whoever is picked signs the paper. Before then, and
 * with `anyone`, it is every employee in the directory, the names Company Details keeps, whoever is signed in, and
 * `names` (those the module's own documents were signed by), each once. `value` is shown as saved: a name not listed stays a choice.
 * Other… clears the name and shows a field to type it in.
 */
export function SignatoryPicker({ label, value, onChange, names = [], hint, anyone, name }: {
  label: string; value: string; onChange: (name: string) => void;
  /** How a refusal names this field (KeystoneError's fields). */
  name?: string;
  /** Names the module's own saved documents were signed by. */
  names?: Iterable<string>;
  hint?: string;
  /** List everyone who could sign, not only those with a signature: for picking whose signature to add. */
  anyone?: boolean;
}) {
  const { state, ctx } = useKeystone();
  // The name as last typed under Other…, or null. The field stays while the value is still that name (in any capitals:
  // a voucher keeps them in capitals); a new value from elsewhere, such as the next document, shows in the list again.
  const [typed, setTyped] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const d = companyOf(state);
  const signed = anyone ? [] : signedNames(d);
  const listed = signed.length ? signed : signatoryNames(state, [d.preparedBy, d.checkedBy, d.approvedBy, d.signatory, ctx.who?.name ?? '', ...names]);
  // A name shows as the choice it matches, whatever its capitals: a voucher keeps names in capitals.
  const match = listed.find((n) => n.toUpperCase() === value.trim().toUpperCase());
  const options = [...(value.trim() && !match ? [value] : []), ...listed];
  // A typed name that is now listed (it was saved on a document) shows as listed once the field is left.
  const typing = typed !== null && typed.toUpperCase() === value.toUpperCase() && (!match || focused);

  const pick = (choice: string) => {
    setTyped(choice === OTHER_NAME ? '' : null);
    onChange(choice === OTHER_NAME ? '' : choice);
  };

  const type = (typedName: string) => {
    setTyped(typedName);
    onChange(typedName);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Field label={label} hint={hint} name={name}>
        <SelectInput
          value={typing ? OTHER_NAME : match ?? value}
          onChange={pick}
          options={[...options, OTHER_NAME].map((n) => ({ value: n, label: n }))}
        />
      </Field>
      {typing && (
        <div onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
          <CellInput capitalize name={name} label={`${label}, name`} placeholder="Type the name" autoFocus value={value} onChange={type} />
        </div>
      )}
    </div>
  );
}

/** The last choice in a bank account list, for an account not kept yet. No account's label is this: each has " · ". */
const OTHERS = 'others';

/** An account typed under Others, before Bank Accounts keeps it. */
type TypedAccount = { bank: string; branch: string; name: string; number: string };

/**
 * A company bank account picked from Bank Accounts (SERVICES.bankAccounts), the same on every form that names one: the
 * bank a check is drawn on, the account a client pays into. `value` is the account as printed ("BPI · 4011 0258 68");
 * one no longer kept, or typed by hand, stays listed as it was saved. The list ends with Others…, a small form whose
 * account is saved to Bank Accounts and picked, so every form after lists it too; Remove… takes the picked one off.
 * `onChange` gets the account's label and the account, or "" when none is left. Nothing without the service.
 */
export function BankAccountPicker({ label, value, onChange, hint, noneHint, after, kept, name }: {
  label: string; value: string; onChange: (label: string, account?: BankAccount) => void;
  /** How a refusal names this field (KeystoneError's fields). */
  name?: string;
  /** Under the list when it has accounts, and when it has none. */
  hint: string; noneHint: string;
  /** Who else lists an account saved here: "every voucher after this one". */
  after: string;
  /** What happens to papers that named a removed account: "Vouchers already saved keep the bank written on them." */
  kept: string;
}) {
  const { state, run } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const banks = app.service(SERVICES.bankAccounts);
  // The account's name starts as the company's: these are its own accounts.
  const blank = (): TypedAccount => ({ bank: '', branch: '', name: companyOf(state).name, number: '' });
  const [adding, setAdding] = useState<TypedAccount | null>(null);
  const [error, setError] = useState<Refusal | null>(null);
  const said = useId();

  if (!banks) return null;
  const accounts = banks.accounts(state);
  const labels = accounts.map((a) => banks.label(a));
  const picked = accounts.find((a) => banks.label(a) === value);
  const options = [...(value && !labels.includes(value) ? [value] : []), ...labels, OTHERS];

  const pick = (choice: string) => {
    setError(null);
    setAdding(choice === OTHERS ? blank() : null);

    if (choice !== OTHERS) onChange(choice, accounts.find((a) => banks.label(a) === choice));
  };

  const save = () => {
    if (!adding) return;
    const r = run((s, c) => banks.add(s, adding, c));

    if (!r.ok) return setError(r);
    onChange(banks.label(r.record), r.record);
    setAdding(null);
    setError(null);
  };

  const remove = (id: string) => {
    const r = run((s, c) => banks.remove(s, id, c));

    if (!r.ok) return;
    // The form then names the first account still kept, if any.
    const next = banks.accounts(r.state)[0];

    onChange(next ? banks.label(next) : '', next);
  };

  const field = (key: keyof TypedAccount) => ({ value: adding?.[key] ?? '', onChange: (v: string) => adding && setAdding({ ...adding, [key]: v }) });

  return (
    <div className="flex flex-col gap-2.5">
      <Field label={label} hint={accounts.length ? hint : noneHint} name={name}>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SelectInput
              value={adding ? OTHERS : value}
              onChange={pick}
              options={options.map((l) => ({ value: l, label: l === OTHERS ? 'Others…' : l }))}
            />
          </div>
          {picked && !adding && (
            <Button
              onClick={() => confirm({
                title: `Remove ${picked.id}?`,
                body: `${banks.label(picked)}, in the name of ${picked.name}, is removed from Bank Accounts and from this list. ${kept}`,
                confirm: 'Remove account',
                danger: true,
                onConfirm: () => remove(picked.id),
              })}
            >
              Remove…
            </Button>
          )}
        </div>
      </Field>
      {adding && (
        // Inside the form that names it, so Enter saves the account here, not the form.
        <div
          role="group"
          aria-label="New bank account"
          className="flex flex-col gap-2.5 rounded-control border border-line p-3"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        >
          <FieldMarks refusal={error} describedBy={said}>
            <FieldRow>
              <Field label="Bank name" name="bank"><TextInput autoFocus placeholder="BDO" {...field('bank')} /></Field>
              <Field label="Account number" name="number"><TextInput figures placeholder="0012 3456 7890" {...field('number')} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Account name" hint="As the bank holds it." name="name"><TextInput capitalize {...field('name')} /></Field>
              <Field label="Branch" name="branch"><TextInput placeholder="Optional" {...field('branch')} /></Field>
            </FieldRow>
          </FieldMarks>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error
              ? <p id={said} role="alert" className="m-0 mr-auto max-w-[36ch] text-[13px] text-pretty text-bad">{error.error}</p>
              : <span className="mr-auto text-[13px] text-pretty text-ink-2">Saved to Bank Accounts, for {after}.</span>}
            {accounts.length > 0 && <Button size="sm" onClick={() => { setAdding(null); setError(null); }}>Cancel</Button>}
            <Button size="sm" onClick={save}>Save account</Button>
          </div>
        </div>
      )}
    </div>
  );
}
