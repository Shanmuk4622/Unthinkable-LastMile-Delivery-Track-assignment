/**
 * Money helpers.
 * ---------------------------------------------------------------------------
 * Currency is stored as a float column for ergonomics, but *arithmetic* is
 * always performed on integer minor units (paise). Accumulating 18% GST on a
 * float subtotal is exactly how invoices end up off by a rupee, so every
 * intermediate result in the rate engine is snapped back to paise.
 */

/** Rupees -> paise (integer). */
export function toMinor(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

/** Paise -> rupees, always exactly 2 decimals. */
export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

/** Round a rupee amount to 2 decimal places without float drift. */
export function round2(amount: number): number {
  return toMajor(toMinor(amount));
}

/** Apply a percentage to a rupee amount, returning a 2-decimal rupee amount. */
export function percentOf(amount: number, pct: number): number {
  return toMajor(Math.round((toMinor(amount) * pct) / 100));
}

/** Sum rupee amounts without accumulating float error. */
export function sumMoney(...amounts: number[]): number {
  return toMajor(amounts.reduce((acc, a) => acc + toMinor(a), 0));
}

/** Clamp a rupee amount into [min, max]; max === null|undefined means unbounded. */
export function clampMoney(amount: number, min: number, max?: number | null): number {
  let value = Math.max(amount, min);
  if (max !== null && max !== undefined) value = Math.min(value, max);
  return round2(value);
}

/** Locale-aware display string, e.g. "₹ 1,240.50". */
export function formatMoney(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(amount));
}
