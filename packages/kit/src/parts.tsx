import { createContext, useContext, type ReactNode } from 'react';
import { MARKS } from './paper';

// Where on the paper the field being typed in lands. A form's fields say which part of the paper they fill (`Fills`),
// a paper's parts say which part they are (`usePaperPart`), and Workspace, between the two, marks the part the field
// with focus fills, so a person sees where on the document they are typing. The mark is an attribute the paper's part
// carries only while its field has focus: a paper outside a Workspace, or printed, or drawn into a PDF, never has it,
// and its markup is the same as it was. The stylesheet draws it (packages/ui/src/styles.css), on screen only.

/** The part the field with focus fills, or null: what Workspace hands its preview. */
export const ActivePart = createContext<string | null>(null);

/** The attribute a form's wrapper carries to name the part its fields fill. */
export const FILLS = 'data-fills';

/**
 * Says that the fields inside fill `part` of the paper beside the form: focus in any of them marks that part. It takes
 * no room of its own (`display: contents`), so it can wrap a field in a row, or a group of them, without moving them.
 */
export function Fills({ part, children }: { part: string; children: ReactNode }) {
  return <div {...{ [FILLS]: part }} className="contents">{children}</div>;
}

/**
 * For a paper: `part(name)` gives the element that shows `name` its mark while a field that fills it has focus, and
 * nothing otherwise, so the paper is unchanged when nobody is typing. One element or several may share a name.
 */
export function usePaperPart() {
  const active = useContext(ActivePart);

  return (part?: string) => (part && part === active ? { [MARKS.active]: '' } : {});
}
