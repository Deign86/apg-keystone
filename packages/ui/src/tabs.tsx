import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './primitives';

export interface TabDef<T extends string> {
  value: T;
  /** The tab's name, as read out and as tests find it. */
  label: string;
  /** A short muted note after the name (a count, the record open), read as part of it. */
  note?: ReactNode;
  panel: ReactNode;
}

/**
 * One screen split into views, one shown at a time: a row of tabs under a 1px line, the shown one marked with a gold
 * line under it, as the rail marks its screen. The arrow keys move between tabs. Every panel stays mounted while
 * hidden, so what is half done in one (a page of a register, a folded month) is as it was on coming back. When the
 * tab shown changes while the page is scrolled past the tabs (a record opened from far down a register), the tabs are
 * brought back into view, so the new panel is seen from its top.
 */
export function Tabs<T extends string>({ label, value, onChange, tabs, className }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  tabs: TabDef<T>[];
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const shown = useRef(value);

  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    const tabs = list.current;

    if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
  }, [value]);

  return (
    // SAFETY: every tab's value is one of `tabs`' values, all of type T, so the value a tab hands back is a T.
    <BaseTabs.Root value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <BaseTabs.List ref={list} aria-label={label} className="mb-4 flex scroll-mt-4 gap-1 border-b border-line">
        {tabs.map((t) => (
          <BaseTabs.Tab
            key={t.value}
            value={t.value}
            className={cn(
              'relative -mb-px flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-[13px] font-semibold whitespace-nowrap text-ink-2',
              'transition-colors duration-150 ease-out hover:text-ink',
              'data-[active]:border-gold data-[active]:text-ink',
            )}
          >
            {t.label}
            {t.note !== undefined && <span className="text-xs font-medium text-ink-3 tabular-nums">{t.note}</span>}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {tabs.map((t) => (
        <BaseTabs.Panel key={t.value} value={t.value} keepMounted className="outline-none">
          {t.panel}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
