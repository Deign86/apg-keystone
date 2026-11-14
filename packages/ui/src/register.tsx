import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './primitives';

// A register: a real <table> with gold header capitals, rows on a 45px pitch split by
// 1px lines, figures right-aligned in tabular digits, one status per row and one menu
// at the far right. Clicking a row (or Enter on it) opens the record.

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

export interface RowAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function Register<T>({
  label, columns, rows, rowKey, rowLabel = rowKey, onOpen, actions, empty, caption,
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
  empty: ReactNode;
  caption?: string;
}) {
  const need = columns.reduce((sum, c) => sum + (c.width ?? IDENTITY_ROOM), actions ? MENU_WIDTH : 0);
  const [box, roomy] = useRoomFor(need);
  const shown = roomy ? columns : columns.filter((c) => !c.detail);

  return (
    // Relative, so the screen-reader-only caption and header scroll with the table instead of widening a phone's page.
    <div ref={box} className="relative overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" aria-label={label}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <colgroup>
          {shown.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
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
            {actions && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              tabIndex={onOpen ? 0 : undefined}
              onClick={onOpen ? () => onOpen(row) : undefined}
              onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(row); } : undefined}
              className={cn('border-t border-line', onOpen && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2')}
            >
              {shown.map((c) => (
                <td key={c.key} className={cn('h-[45px] max-w-0 truncate px-2.5', c.align === 'right' && 'text-right tabular-nums')}>
                  {c.cell(row)}
                </td>
              ))}
              {actions && (
                <td className="px-1 text-right" onClick={(e) => e.stopPropagation()}>
                  {actions(row).length > 0 && <RowMenu label={`Actions for ${rowLabel(row)}`} actions={actions(row)} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && empty}
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
          {/* taste-skill-ignore: a menu is a real overlay */}
          <Menu.Popup className="min-w-48 rounded-control border border-line-bright bg-surface-2 p-1 shadow-[0_16px_48px_rgb(0_0_0/0.55)] outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0">
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
