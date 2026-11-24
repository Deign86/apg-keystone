import type { Locator, Screen } from 'e2e';

// A signatory is picked from a list (SignatoryPicker in @keystone/kit): the directory's employees and the names already
// signing. A name not listed is typed under Other….

/** Picks `name` from the signatory list `label` on `form`. */
export async function pickSignatory(screen: Screen, form: Locator, label: string, name: string) {
  await form.getByRole('combobox', label).tap();
  await screen.getByRole('option', name).tap();
}

/** Types `name` under Other… in the signatory list `label` on `form`. */
export async function typeSignatory(screen: Screen, form: Locator, label: string, name: string) {
  await pickSignatory(screen, form, label, 'Other…');
  await form.getByRole('textbox', `${label}, name`).fill(name);
}
