import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Field as BaseField } from '@base-ui/react/field';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { cn } from './primitives';

// Labelled controls. Base UI's Field wires the label, description and error to the
// control (aria-labelledby, aria-describedby, aria-invalid), so every input is named.

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <BaseField.Root invalid={!!error} className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <BaseField.Label className="text-[13px] font-medium text-ink">{label}</BaseField.Label>
      {children}
      {hint && !error && <BaseField.Description className="m-0 text-[13px] text-ink-2">{hint}</BaseField.Description>}
      {error && <BaseField.Error match className="m-0 text-[13px] text-bad">{error}</BaseField.Error>}
    </BaseField.Root>
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
  autoFocus?: boolean;
  /** What the browser may fill in: `new-password` keeps a saved password out of a field for someone else's. */
  autoComplete?: string;
  /** A name: each word starts with a capital as it is typed (`capitalizeWords`). */
  capitalize?: boolean;
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

export function TextInput({ value, onChange, placeholder, readOnly, figures, align = 'left', type = 'text', className, capitalize, ...rest }: InputProps) {
  const input = useRef<HTMLInputElement>(null);

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

    onChange(next);
  };

  return (
    <BaseField.Control
      ref={input}
      type={type}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onValueChange={(v) => change(String(v))}
      autoCapitalize={capitalize ? 'words' : undefined}
      className={cn('input-chrome', (figures || readOnly) && 'text-gold-bright', readOnly && 'font-medium', align === 'right' && 'text-right', className)}
      {...rest}
    />
  );
}

/** A bare input with its own name, for cells in a line editor. */
export function CellInput({ label, ...props }: InputProps & { label: string }) {
  return (
    <BaseField.Root className="min-w-0">
      <TextInput {...props} aria-label={label} />
    </BaseField.Root>
  );
}

export function TextArea({ value, onChange, rows = 3, readOnly }: { value: string; onChange: (v: string) => void; rows?: number; readOnly?: boolean }) {
  return (
    <BaseField.Control
      render={<textarea rows={rows} />}
      value={value}
      readOnly={readOnly}
      onValueChange={(v) => onChange(String(v))}
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
  return (
    <Select.Root value={value} onValueChange={(v) => v != null && onChange(String(v))} items={options}>
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
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={(v) => onChange(v)}
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

/** Fields that share a row equally, wrapping on narrow windows. */
export function FieldRow({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</div>;
}
