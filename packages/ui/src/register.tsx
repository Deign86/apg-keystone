import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Menu } from '@base-ui/react/menu';
import { Check, ChevronRight, Minus, MoreHorizontal } from 'lucide-react';
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, cn } from './primitives';

// A register: a real <table> with gold header capitals, rows on a 45px pitch split by
// 1px lines, figures right-aligned in tabular digits, one status per row and one menu
// at the far right. Clicking a row (or Enter on it) opens the record. A register that takes actions on several rows at
// once has a box at the end of each row, before its menu, and one over them all (at the end, so a row is still named
// by what it holds first); with any ticked, a bar over the table names how many
// and offers the actions for them. The row open elsewhere on the screen (in the form beside it) is marked, as the rail
// marks its screen, with a gold line at its edge. A long register shows a page of rows at a time, with Previous and
// Next under it.

export interface Column<T> {
  key: string;
  header: string;
  /** Fixed width in px; leave out for the identity column, which takes the spare width. */
  width?: number;
  align?: 'left' | 'right';
  /**
   * A breakdown the table can do without, such as the parts of a total shown beside it. Left out while the table is
   * too narrow to show every column whole, so the figures that stay are never cut short; show it elsewhere too.
   */
  detail?: boolean;
  cell: (row: T) => ReactNode;
}

/** What an identity column (one with no width) needs before a table counts as wide enough for every column: a name. */
const IDENTITY_ROOM = 160;

/** The ⋯ menu's column. */
const MENU_WIDTH = 40;

/**
 * Whether the box is at least `need` px wide, measured again whenever it changes size. Until it has a width (a hidden
 * screen, or no layout at all), it counts as wide enough.
 */
function useRoomFor(need: number) {
  const box = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(true);

  useLayoutEffect(() => {
    const b = box.current;

    if (!b) return;

    const measure = () => {
      if (b.clientWidth) setRoomy(b.clientWidth >= need);
    };

    const watch = new ResizeObserver(measure);
    watch.observe(b);
    measure();

    return () => watch.disconnect();
  }, [need]);

  return [box, roomy] as const;
}

/**
 * Rows that belong together, such as vouchers to the same payee. Two or more of a kind fold into one row that opens to
 * show them; a row alone stays a row. The kinds keep the order their first rows have.
 */
export interface RowGroup<T> {
  /** Rows with the same key fold together. */
  key: (row: T) => string;
  /** The folded row's name, for screen readers and the box that ticks the group: "MERALCO, 3 vouchers". */
  label: (rows: T[]) => string;
  /** What the folded row shows, across the columns. */
  summary: (rows: T[]) => ReactNode;
}

/** A row of the register, or a fold of rows that share a group. */
type Entry<T> = { key: string; rows: T[]; folded: boolean };

/** The rows as entries: in a group, two or more of a kind are one fold, at the place of the first. */
export function entriesOf<T>(rows: T[], rowKey: (row: T) => string, group?: Pick<RowGroup<T>, 'key'>): Entry<T>[] {
  if (!group) return rows.map((r) => ({ key: rowKey(r), rows: [r], folded: false }));
  const kinds = new Map<string, T[]>();

  for (const r of rows) {
    const k = group.key(r);
    const kind = kinds.get(k);

    if (kind) kind.push(r);
    else kinds.set(k, [r]);
  }

  return [...kinds].map(([k, rs]) => (rs.length > 1 ? { key: `group:${k}`, rows: rs, folded: true } : { key: rowKey(rs[0]), rows: rs, folded: false }));
}

export interface RowAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** A box to tick, named for screen readers, that never opens the row it sits in. */
function Tick({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      indeterminate={mixed}
      onCheckedChange={(v) => onChange(v)}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-[3px] border border-line-bright bg-input data-[checked]:border-gold data-[checked]:bg-gold data-[indeterminate]:border-gold data-[indeterminate]:bg-gold"
    >
      <BaseCheckbox.Indicator className="text-gold-ink">
        {mixed ? <Minus size={11} strokeWidth={3.5} aria-hidden="true" /> : <Check size={11} strokeWidth={3.5} aria-hidden="true" />}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

/** The box column. */
const TICK_WIDTH = 36;

/** Rows a page holds, for a register that shows its rows a page at a time. */
export const PAGE_SIZE = 10;

/**
 * Page `page` (counted from 0, kept within the pages there are) of `total` rows, `size` to a page: which page it is,
 * how many there are, and the rows it shows, from `first` up to but not including `end`.
 */
export function pageOf(total: number, size: number, page: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const at = Math.min(Math.max(0, page), pages - 1);

  return { page: at, pages, first: at * size, end: Math.min(total, (at + 1) * size) };
}

/** Previous or Next under a register. Kept in the tab order at either end, so a press there never loses focus. */
function PageButton({ children, off, onPress }: { children: ReactNode; off: boolean; onPress: () => void }) {
  return (
    <Button size="sm" aria-disabled={off || undefined} onClick={() => { if (!off) onPress(); }} className="aria-disabled:pointer-events-none aria-disabled:opacity-40">
      {children}
    </Button>
  );
}

export function Register<T>({
  label, columns, rows, rowKey, rowLabel = rowKey, onOpen, actions, bulk, empty, caption, current, pageSize, group,
}: {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** How a row is named to a screen reader ("Actions for …"), when its key means nothing to a person. Its key by default. */
  rowLabel?: (row: T) => string;
  onOpen?: (row: T) => void;
  /** The row's ⋯ menu. A row with none gets no menu. */
  actions?: (row: T) => RowAction[];
  /**
   * The actions on the rows ticked, shown over the table while any are. Given, each row gets a box to tick. `clear`
   * unticks them all: call it once an action is done (not when it is cancelled), so the rows stay ticked to try again.
   */
  bulk?: (selected: T[], clear: () => void) => RowAction[];
  empty: ReactNode;
  caption?: string;
  /** The key of the row open elsewhere on the screen, such as in the form beside the register: marked, and announced as current. */
  current?: string;
  /** Given, a register longer than this shows that many rows at a time, with Previous and Next under it (PAGE_SIZE suits most). */
  pageSize?: number;
  /** Given, rows of the same kind fold into one that opens to show them; a page then counts folds, not the rows in them. */
  group?: RowGroup<T>;
}) {
  const need = columns.reduce((sum, c) => sum + (c.width ?? IDENTITY_ROOM), (actions ? MENU_WIDTH : 0) + (bulk ? TICK_WIDTH : 0));
  const [box, roomy] = useRoomFor(need);
  const shown = roomy ? columns : columns.filter((c) => !c.detail);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  // Only rows still in the register count: one deleted or filtered away drops out of the selection.
  const selected = bulk ? rows.filter((r) => ticked.has(rowKey(r))) : [];
  const clear = () => setTicked(new Set());

  const entries = entriesOf(rows, rowKey, group);

  // A row opened from elsewhere (Home, Overview, another page) is brought into view: its page is shown, and the fold it is
  // in opened, when the register opens with it current, and whenever it becomes current.
  const entryWith = (key: string | undefined) => (key === undefined ? -1 : entries.findIndex((e) => e.rows.some((r) => rowKey(r) === key)));

  const pageWith = (key: string | undefined) => {
    const i = entryWith(key);

    return i >= 0 && pageSize ? Math.floor(i / pageSize) : null;
  };

  const foldWith = (key: string | undefined) => {
    const e = entries[entryWith(key)];

    return e?.folded ? e.key : null;
  };

  const [opened, setOpened] = useState<ReadonlySet<string>>(() => {
    const f = foldWith(current);

    return new Set(f ? [f] : []);
  });

  const unfold = (key: string, on: boolean) => setOpened((prev) => {
    const next = new Set(prev);

    if (on) next.add(key);
    else next.delete(key);

    return next;
  });

  const [page, setPage] = useState(() => pageWith(current) ?? 0);
  const [seen, setSeen] = useState(current);

  if (current !== seen) {
    setSeen(current);
    const p = pageWith(current);
    const f = foldWith(current);

    if (p !== null) setPage(p);

    if (f && !opened.has(f)) setOpened(new Set([...opened, f]));
  }

  const paged = pageSize !== undefined && entries.length > pageSize;
  const at = pageOf(entries.length, pageSize ?? Math.max(1, entries.length), page);

  const shownEntries = paged ? entries.slice(at.first, at.end) : entries;
  const visible = shownEntries.flatMap((e) => e.rows);
  // The box over the rows ticks those on view: the page shown, or every row when there is one page.
  const all = visible.length > 0 && visible.every((r) => ticked.has(rowKey(r)));
  const some = visible.some((r) => ticked.has(rowKey(r)));

  const tick = (keys: string[], on: boolean) => setTicked((prev) => {
    const next = new Set(prev);

    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }

    return next;
  });

  const bulkActions = bulk && selected.length ? bulk(selected, clear) : [];

  /** One record's row; `inFold` sets it in under the fold it is in. */
  const row = (r: T, inFold: boolean) => {
    const key = rowKey(r);
    const open = key === current;

    return (
      <tr
        key={key}
        tabIndex={onOpen ? 0 : undefined}
        aria-current={open || undefined}
        onClick={onOpen ? () => onOpen(r) : undefined}
        onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(r); } : undefined}
        className={cn('border-t border-line', onOpen && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2', open && 'bg-surface-2', ticked.has(key) && 'bg-gold-tint')}
      >
        {shown.map((c, i) => (
          <td key={c.key} className={cn('h-[45px] max-w-0 truncate px-2.5', c.align === 'right' && 'text-right tabular-nums', i === 0 && 'relative', i === 0 && inFold && 'pl-8')}>
            {i === 0 && open && <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-gold" />}
            {c.cell(r)}
          </td>
        ))}
        {bulk && (
          <td className="pl-3" onClick={(e) => e.stopPropagation()}>
            <Tick checked={ticked.has(key)} label={`Select ${rowLabel(r)}`} onChange={(on) => tick([key], on)} />
          </td>
        )}
        {actions && (
          <td className="px-1 text-right" onClick={(e) => e.stopPropagation()}>
            {actions(r).length > 0 && <RowMenu label={`Actions for ${rowLabel(r)}`} actions={actions(r)} />}
          </td>
        )}
      </tr>
    );
  };

  return (
    // Relative, so the screen-reader-only caption and header scroll with the table instead of widening a phone's page.
    <div ref={box} className="relative overflow-x-auto">
      {selected.length > 0 && (
        <div role="toolbar" aria-label={`${label}: selected`} className="mb-2 flex flex-wrap items-center gap-2 rounded-control border border-gold/40 bg-gold-tint px-3 py-2">
          <span className="mr-auto text-[13px] font-semibold text-gold-bright tabular-nums" aria-live="polite">{selected.length} selected</span>
          {bulkActions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={a.onSelect}
              className={cn(
                'h-7 rounded-control border px-2.5 text-[13px] font-semibold whitespace-nowrap disabled:pointer-events-none disabled:opacity-40',
                a.danger ? 'border-bad/50 text-bad hover:bg-bad/10' : 'border-line-bright text-ink hover:border-gold hover:text-gold-bright',
              )}
            >
              {a.label}
            </button>
          ))}
          <button type="button" onClick={clear} className="h-7 rounded-control px-2.5 text-[13px] text-ink-2 hover:text-ink">Clear</button>
        </div>
      )}
      <table className="w-full border-collapse text-[13px]" aria-label={label}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <colgroup>
          {shown.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
          {bulk && <col style={{ width: TICK_WIDTH }} />}
          {actions && <col style={{ width: 40 }} />}
        </colgroup>
        <thead>
          <tr>
            {shown.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('h-9 px-2.5 text-[11px] font-bold tracking-[0.06em] whitespace-nowrap text-gold uppercase', c.align === 'right' ? 'text-right' : 'text-left')}
              >
                {c.header}
              </th>
            ))}
            {bulk && (
              <th scope="col" className="pl-3">
                {rows.length > 0 && <Tick checked={all} mixed={!all && some} label={paged ? `Select every row on this page of ${label}` : `Select every row in ${label}`} onChange={(on) => tick(visible.map(rowKey), on)} />}
              </th>
            )}
            {actions && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {shownEntries.map((e) => {
            if (!e.folded || !group) return row(e.rows[0], false);
            const isOpen = opened.has(e.key);
            const keys = e.rows.map(rowKey);
            const allOn = keys.every((k) => ticked.has(k));
            const anyOn = keys.some((k) => ticked.has(k));

            return (
              <Fragment key={e.key}>
                <tr className={cn('border-t border-line', allOn && 'bg-gold-tint')}>
                  <td colSpan={shown.length} className="h-[45px] max-w-0 p-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => unfold(e.key, !isOpen)}
                      className="flex h-[45px] w-full min-w-0 items-center gap-1.5 px-2.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2"
                    >
                      <ChevronRight size={14} aria-hidden="true" className={cn('shrink-0 text-ink-2 transition-transform duration-150', isOpen && 'rotate-90')} />
                      <span className="sr-only">{group.label(e.rows)}</span>
                      <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-3">{group.summary(e.rows)}</span>
                    </button>
                  </td>
                  {bulk && (
                    <td className="pl-3">
                      <Tick checked={allOn} mixed={!allOn && anyOn} label={`Select ${group.label(e.rows)}`} onChange={(on) => tick(keys, on)} />
                    </td>
                  )}
                  {actions && <td />}
                </tr>
                {isOpen && e.rows.map((r) => row(r, true))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && empty}
      {paged && (
        <nav aria-label={`${label}, pages`} className="flex items-center justify-end gap-2 border-t border-line pt-2.5">
          <span aria-live="polite" className="mr-auto text-xs text-ink-2 tabular-nums">{at.first + 1}–{at.end} of {entries.length}</span>
          <PageButton off={at.page === 0} onPress={() => setPage(at.page - 1)}>Previous</PageButton>
          <PageButton off={at.page === at.pages - 1} onPress={() => setPage(at.page + 1)}>Next</PageButton>
        </nav>
      )}
    </div>
  );
}

export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-gold-bright data-[popup-open]:text-gold-bright"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-70 outline-none">
          <Menu.Popup className="min-w-48 rounded-control border border-line-bright bg-surface-2 p-1 shadow-[0_16px_48px_rgb(0_0_0/0.55)] outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0" // taste-skill-ignore: a menu is a real overlay
          >
            {actions.map((a) => (
              <Menu.Item
                key={a.label}
                disabled={a.disabled}
                onClick={a.onSelect}
                className={cn(
                  'flex cursor-default items-center rounded-[4px] px-2.5 py-1.5 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-gold-tint',
                  a.danger ? 'text-bad' : 'text-ink data-[highlighted]:text-gold-bright',
                )}
              >
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
