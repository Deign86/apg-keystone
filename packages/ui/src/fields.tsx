import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Field as BaseField } from '@base-ui/react/field';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './primitives';

// Labelled controls. Base UI's Field wires the label, description and error to the
// control (aria-labelledby, aria-describedby, aria-invalid), so every input is named.

/** A refused save: the sentence, and the fields it is about, each by the `name` its Field or CellInput was given. */
export interface Refusal {
  error: string;
  fields?: readonly string[];
}

/** The refusal a form's fields are marked by, and what a marked field reports back. */
interface Marks {
  error: string;
  /** The id of the refusal's sentence on screen, for a cell too small to show it under itself. */
  describedBy?: string;
  marked: (name: string) => boolean;
  edited: (name: string) => void;
  place: (name: string, at: HTMLElement | null) => void;
}

const MarksContext = createContext<Marks | null>(null);

/** The name of the field a control is in, so editing the control clears that field's mark. */
const NameContext = createContext<string | undefined>(undefined);

const FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button, [tabindex]:not([tabindex="-1"])';

/**
 * Marks the fields a refusal names: each turns red, says why and is announced as invalid until it is edited. The first
 * one in the form takes the focus and scrolls into view. A refusal that names no field marks nothing. Each new refusal
 * marks its fields afresh, even when it is the same sentence again.
 */
export function FieldMarks({ refusal, describedBy, children }: { refusal: Refusal | null | undefined; describedBy?: string; children: ReactNode }) {
  const named = refusal ?? null;
  // The fields edited since this refusal: their marks are cleared.
  const [edits, setEdits] = useState<{ of: Refusal | null; names: readonly string[] }>({ of: null, names: [] });
  const places = useRef(new Map<string, HTMLElement>());
  const done = edits.of === named ? edits.names : [];
  const marked = useCallback((name: string) => !!named?.fields?.includes(name) && !done.includes(name), [named, done]);
  const edited = useCallback((name: string) => { if (marked(name)) setEdits({ of: named, names: [...done, name] }); }, [marked, named, done]);
  const place = useCallback((name: string, at: HTMLElement | null) => { if (at) places.current.set(name, at); else places.current.delete(name); }, []);

  useEffect(() => {
    const first = (named?.fields ?? [])
      .map((name) => places.current.get(name))
      .filter((at): at is HTMLElement => !!at)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];

    const control = first?.matches(FOCUSABLE) ? first : first?.querySelector<HTMLElement>(FOCUSABLE);

    if (!control) return;
    control.focus({ preventScroll: true });
    control.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [named]);

  return <MarksContext.Provider value={named ? { error: named.error, describedBy, marked, edited, place } : null}>{children}</MarksContext.Provider>;
}

/** Whether the field named `name` is marked by a refusal, and a ref that says where it is on screen. */
function useMark(name: string | undefined) {
  const marks = useContext(MarksContext);
  const refused = name !== undefined && !!marks?.marked(name);
  const place = useCallback((at: HTMLElement | null) => { if (name !== undefined) marks?.place(name, at); }, [marks, name]);

  return { refused, error: refused ? marks?.error : undefined, describedBy: refused ? marks?.describedBy : undefined, place };
}

/** Called when a control is edited: clears the mark on the field it is in. */
function useEdited() {
  const marks = useContext(MarksContext);
  const name = useContext(NameContext);

  return () => { if (name !== undefined) marks?.edited(name); };
}

/**
 * A labelled field. `name` is how a refusal names it (KeystoneError's fields): inside FieldMarks, a refusal that names
 * it marks it until it is edited. `error` marks it from the screen itself.
 */
/** Whether a field is in a FieldRow, which lines up the labels and boxes of the fields beside each other. */
const InRow = createContext(false);

export function Field({ label, hint, error, name, children, className }: { label: string; hint?: string; error?: string; name?: string; children: ReactNode; className?: string }) {
  const mark = useMark(name);
  const said = error ?? mark.error;
  const inRow = useContext(InRow);

  return (
    <NameContext.Provider value={name}>
      {/* In a FieldRow: three rows of the row's grid, label, box and hint, shared with the fields beside it. */}
      <BaseField.Root ref={mark.place} invalid={!!said} className={cn(inRow ? 'row-span-3 grid min-w-0 grid-rows-subgrid gap-1.5' : 'flex min-w-0 flex-col gap-1.5', className)}>
        <BaseField.Label className="text-[13px] font-medium text-ink">{label}</BaseField.Label>
        {inRow ? <div className="flex min-w-0 flex-col gap-1.5">{children}</div> : children}
        {hint && !said && <BaseField.Description className="m-0 text-[13px] text-ink-2">{hint}</BaseField.Description>}
        {said && <BaseField.Error match className="m-0 text-[13px] text-pretty text-bad">{said}</BaseField.Error>}
      </BaseField.Root>
    </NameContext.Provider>
  );
}

type InputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  figures?: boolean;
  align?: 'left' | 'right';
  type?: 'text' | 'date' | 'email' | 'tel' | 'url' | 'password';
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  autoFocus?: boolean;
  /** What the browser may fill in: `new-password` keeps a saved password out of a field for someone else's. */
  autoComplete?: string;
  /** A name: each word starts with a capital as it is typed (`capitalizeWords`). */
  capitalize?: boolean;
  /**
   * Earlier entries the field offers as it is typed, the browser's own list under it; picking one types it in. A field
   * given it is a combobox to assistive technology, with or without entries yet, so it is always found the same way.
   */
  suggestions?: readonly string[];
};

/** Words that join a name and stay in small letters inside it: "Alpha Premier Group of Companies". */
const JOINING = ['of', 'and', 'the', 'for', 'in', 'on', 'at', 'by', 'to', 'or'];

/**
 * Each word's first letter in capitals, the rest as typed: "juan dela cruz" is "Juan Dela Cruz", and "OPC" or
 * "McDonald" stay as they are. A word starts the text or follows a space, a hyphen, a slash or an opening bracket. A
 * joining word (of, and, the…) stays small after the first word, and so does the word still being typed while it could
 * become one: "o" waits, since it may be "of", until the next letter says otherwise.
 */
export function capitalizeWords(text: string): string {
  let first = true;

  return text.replace(/[^\s(/-]+/g, (word, at: number) => {
    const lower = word.toLowerCase();
    const typing = at + word.length === text.length;
    const joining = JOINING.includes(lower) || (typing && JOINING.some((j) => j.startsWith(lower)));
    const keep = !first && joining;

    first = false;

    return keep ? word : word.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
  });
}

export function TextInput({ value, onChange, placeholder, readOnly, figures, align = 'left', type = 'text', className, capitalize, suggestions, ...rest }: InputProps) {
  const input = useRef<HTMLInputElement>(null);
  const edited = useEdited();
  const listId = useId();
  const offered = !readOnly && suggestions ? suggestions : null;

  const change = (typed: string) => {
    const next = capitalize ? capitalizeWords(typed) : typed;
    const field = input.current;

    // The capitals go into the field where they were typed and the caret stays put, so the field already shows the
    // new value and React has nothing to reset (which would send the caret to the end of a name being corrected).
    if (field && next !== typed) {
      const { selectionStart, selectionEnd } = field;
      field.value = next;
      field.setSelectionRange(selectionStart, selectionEnd);
    }

    edited();
    onChange(next);
  };

  return (
    <>
      <BaseField.Control
        ref={input}
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onValueChange={(v) => change(String(v))}
        autoCapitalize={capitalize ? 'words' : undefined}
        list={offered ? listId : undefined}
        className={cn('input-chrome', (figures || readOnly) && 'text-gold-bright', readOnly && 'font-medium', align === 'right' && 'text-right', className)}
        {...rest}
      />
      {offered && <datalist id={listId}>{offered.map((v) => <option key={v} value={v} />)}</datalist>}
    </>
  );
}

/**
 * Earlier entries of a longer text (notes, a purpose), a few at most, to put one back in with a tap. Shown only while
 * the field is blank, so it never covers what is being written; nothing shows when there are none.
 */
export function EarlierPicks({ values, value, onPick, most = 3 }: { values: readonly string[]; value: string; onPick: (v: string) => void; most?: number }) {
  const picks = value.trim() ? [] : values.slice(0, most);

  if (!picks.length) return null;

  return (
    <div role="group" aria-label="Earlier entries" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-2">
      <span>Earlier:</span>
      {picks.map((v) => (
        <button
          key={v}
          type="button"
          title={v}
          aria-label={`Use earlier: ${v}`}
          onClick={() => onPick(v)}
          className="min-h-7 max-w-full truncate rounded-control border border-line px-2 py-0.5 text-left text-ink hover:border-line-bright"
        >
          {v.split('\n')[0]}
        </button>
      ))}
    </div>
  );
}

/**
 * A bare input with its own label, for cells in a line editor. `name` is how a refusal names it, as a Field's is; too
 * small to say why under itself, a marked cell points at the refusal's sentence instead.
 */
export function CellInput({ label, name, ...props }: InputProps & { label: string; name?: string }) {
  const mark = useMark(name);

  return (
    <NameContext.Provider value={name}>
      <BaseField.Root ref={mark.place} invalid={mark.refused} className="min-w-0">
        <TextInput {...props} aria-label={label} aria-describedby={mark.describedBy} />
      </BaseField.Root>
    </NameContext.Provider>
  );
}

export function TextArea({ value, onChange, rows = 3, readOnly }: { value: string; onChange: (v: string) => void; rows?: number; readOnly?: boolean }) {
  const edited = useEdited();

  return (
    <BaseField.Control
      render={<textarea rows={rows} />}
      value={value}
      readOnly={readOnly}
      onValueChange={(v) => { edited(); onChange(String(v)); }}
      className={cn('input-chrome min-h-16 resize-y py-2 leading-relaxed', readOnly && 'font-medium text-gold-bright')}
    />
  );
}

export interface Option {
  value: string;
  label: string;
}

/** A dropdown in the same chrome as the text fields. */
export function SelectInput({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: Option[]; label?: string }) {
  const edited = useEdited();

  return (
    <Select.Root value={value} onValueChange={(v) => { if (v != null) { edited(); onChange(String(v)); } }} items={options}>
      <Select.Trigger aria-label={label} className="input-chrome flex cursor-default items-center justify-between gap-2 text-left">
        <Select.Value className="truncate" placeholder="—" />
        <Select.Icon className="text-ink-2">
          <ChevronDown size={14} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-70 outline-none">
          <Select.Popup className="max-h-[min(360px,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-control border border-line-bright bg-surface-2 p-1 shadow-[0_16px_48px_rgb(0_0_0/0.55)] outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0" // taste-skill-ignore: a dropdown is a real overlay
          >
            <Select.List>
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className="grid cursor-default grid-cols-[16px_1fr] items-center gap-2 rounded-[4px] py-1.5 pr-3 pl-2 text-[13px] text-ink outline-none select-none data-[highlighted]:bg-gold-tint data-[highlighted]:text-gold-bright"
                >
                  <Select.ItemIndicator className="col-start-1">
                    <Check size={13} aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 truncate">{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** Gold square checkbox with its label. */
export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const edited = useEdited();

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={(v) => { edited(); onChange(v); }}
        className="grid size-4 shrink-0 place-items-center rounded-[3px] border border-line-bright bg-input data-[checked]:border-gold data-[checked]:bg-gold"
      >
        <BaseCheckbox.Indicator className="text-gold-ink">
          <Check size={11} strokeWidth={3.5} aria-hidden="true" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {children}
    </label>
  );
}

/**
 * Fields that share a row equally, wrapping on narrow windows. A field in a row lays its label, box and hint on the
 * row's own grid (a subgrid), so a label that runs to two lines moves its neighbours' boxes down with it, and the boxes
 * of a row always line up.
 */
export function FieldRow({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return (
    <InRow.Provider value>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</div>
    </InRow.Provider>
  );
}
