/**
 * Team 4 (Insights) — small pure date/month helpers used by the rule engine.
 *
 * Kept self-contained rather than reaching into src/ducks (a different team's
 * module, under concurrent edit this wave) — mirrors the existing pattern of
 * src/ducks/engine.ts defining its own `monthOf` rather than importing one.
 * Day-level ISO math is delegated to src/format/dates.ts (a stable, generic
 * lib both this module and screens already depend on) where useful; month-key
 * ('YYYY-MM') arithmetic that lib doesn't provide lives here.
 *
 * Pure and deterministic: no `new Date()`/"now" dependence beyond the ISODate
 * arguments callers pass in, and all math runs via Date.UTC so device
 * timezone never shifts a date.
 */
import type { ISODate, MonthKey, WeekStart } from '../types/contracts';
import { addDaysISO, weekStartOf } from '../format/dates';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' shifted by `delta` calendar months (may be negative). */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [yStr, mStr] = month.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

/** Day-of-month as an integer (1-31) from an ISODate. */
export function dayNum(iso: ISODate): number {
  return parseInt(iso.slice(8, 10), 10);
}

/** 'YYYY-MM' -> "July 2026". Falls back to the raw key for malformed input. */
export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-');
  const name = MONTHS_LONG[parseInt(m, 10) - 1];
  return name ? `${name} ${y}` : month;
}

/** The most recently CLOSED week relative to `today` (the week before the
 * one `today` falls in). Used by "last week" rules so a still-in-progress
 * week is never scored as if it were finished. */
export function prevWeekOf(today: ISODate): WeekStart {
  return addDaysISO(weekStartOf(today), -7);
}

/** Integer day count from `a` to `b` (b - a), via UTC epoch math (no DST). */
export function daysBetweenISO(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map((n) => parseInt(n, 10));
  const [by, bm, bd] = b.split('-').map((n) => parseInt(n, 10));
  const MS_PER_DAY = 86_400_000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** All week-starts (Mondays) whose own month equals `month`, in order.
 * Mirrors src/store/index.ts's private `weeksInMonth` (a week belongs to the
 * month of its Monday, matching the duck-guard attribution convention). */
export function weeksInMonth(month: MonthKey): WeekStart[] {
  let wk = weekStartOf(`${month}-01`);
  if (wk.slice(0, 7) !== month) wk = addDaysISO(wk, 7);
  const out: WeekStart[] = [];
  let guard = 0;
  while (wk.slice(0, 7) === month && guard < 6) {
    out.push(wk);
    wk = addDaysISO(wk, 7);
    guard += 1;
  }
  return out;
}
