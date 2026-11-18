// Amounts are stored in JSON as pesos (48230.55), the same as the prototype, and
// computed in whole centavos so totals never drift.

/** Whole centavos. */
export type Centavos = number;

export const toCentavos = (pesos: number): Centavos => Math.round((Number(pesos) || 0) * 100);
export const toPesos = (c: Centavos): number => c / 100;

/** This amount times a whole-number percentage, rounded half away from zero to the centavo. */
export function percent(c: Centavos, rate: number): Centavos {
  const scaled = c * rate;

  return Math.sign(scaled) * Math.floor((Math.abs(scaled) + 50) / 100);
}

/** "₱48,230.55" */
export function peso(c: Centavos): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(Math.round(c));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${sign}₱${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** Parses what a person types: "12,500", "₱ 650.5". Null when there is no number. */
export function parseAmount(text: string): Centavos | null {
  const cleaned = text.replace(/[^\d.-]/g, '');

  if (!cleaned) return null;
  const n = Number(cleaned);

  return Number.isFinite(n) ? toCentavos(n) : null;
}

export const sumCentavos = <T>(items: readonly T[], f: (t: T) => Centavos): Centavos =>
  items.reduce((a, t) => a + f(t), 0);
