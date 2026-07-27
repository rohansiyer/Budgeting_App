/**
 * Median math for stepped projections (handoff §3.9).
 *
 * The projection engine forecasts from the median of trailing per-envelope
 * spend and income. Median (not mean) resists a single blow-out month; the
 * "lower median on an even count" rule keeps the result an EXACT existing cent
 * value (never a fractional average) and biases conservative — a projection
 * should never over-promise. No floats touch these paths.
 *
 * These are PURE functions: they take plain cent arrays and month keys and
 * accept a reference month, never reading a clock. The store-facing assembly
 * lives in project.ts.
 */
import { type Cents } from '../lib/money';

/** 'YYYY-MM' */
export type MonthKey = string;

/**
 * Lower median of a list of integer-cent values.
 *
 * - Empty list => `null` (no history => no projection basis).
 * - Odd count => the single middle value.
 * - Even count => the LOWER of the two central values (index n/2 − 1 of the
 *   ascending sort). This keeps the result an integer cent that actually
 *   occurred and stays conservative (never rounds a projection upward).
 *
 * The returned value is always one of the inputs, so it is already a valid
 * `Cents` with no arithmetic performed on it.
 */
export function lowerMedianCents(values: readonly Cents[]): Cents | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const idx = n % 2 === 1 ? (n - 1) / 2 : n / 2 - 1;
  return sorted[idx];
}

/**
 * The `count` calendar months immediately BEFORE `refMonth`, oldest-first.
 * Pure integer month arithmetic (no Date, so DST/timezone-immune). e.g.
 * refMonth '2026-07', count 3 => ['2026-04','2026-05','2026-06']. These are the
 * COMPLETED months a trailing-median reads; the current (partial) month is
 * excluded so an in-progress month never drags the median down.
 */
export function trailingCalendarMonths(refMonth: MonthKey, count: number): MonthKey[] {
  const [y, m] = refMonth.split('-').map(Number);
  const out: MonthKey[] = [];
  for (let back = count; back >= 1; back--) {
    // Convert to a zero-based absolute month index, subtract, convert back.
    const abs = y * 12 + (m - 1) - back;
    const yy = Math.floor(abs / 12);
    const mm = (abs % 12) + 1;
    out.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return out;
}
