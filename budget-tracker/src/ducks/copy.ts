/**
 * Team 4 (Pond) — duck-facing copy (v0.3 §1.1, §4 copy rules).
 *
 * Single source for the strings the ducks module owns. Framing is EARNING, not
 * losing: warnings say "earn July's duck", never "don't lose your duck". Loss
 * copy stays warm. Second person throughout; zero em dashes; no emoji. Home and
 * other screens should read the warning helpers from here rather than hand-roll
 * their own duck phrasing.
 */

import type { DuckEvaluation, MonthKey } from '../types/contracts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' -> "July 2025". Falls back to the raw key for malformed input. */
export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-');
  const idx = parseInt(m, 10) - 1;
  const name = MONTHS[idx];
  return name ? `${name} ${y}` : month;
}

/** Possessive month for duck phrasing: 'YYYY-MM' -> "July's duck". */
export function monthDuckLabel(month: MonthKey): string {
  const [, m] = month.split('-');
  const idx = parseInt(m, 10) - 1;
  const name = MONTHS[idx];
  return name ? `${name}'s duck` : "this month's duck";
}

/**
 * Goal-strip warning while a month is still open, phrased as earning (§1.1).
 * e.g. "Ease off to earn July's duck." The screen decides WHEN to show it; the
 * words live here.
 */
export function earnDuckWarning(month: MonthKey): string {
  return `Ease off to earn ${monthDuckLabel(month)}.`;
}

/** Neutral prompt toward the current month's duck (no alarm), earning-framed. */
export function earnDuckPrompt(month: MonthKey): string {
  return `Hit all three goals to earn ${monthDuckLabel(month)}.`;
}

/**
 * Post-close outcome copy for a monthly verdict. Loss copy is the ratified v0.3
 * string; gain/hold/fancy read as earning a duck rather than avoiding a loss.
 */
export function outcomeCopy(outcome: DuckEvaluation['outcome'], bigWin: boolean): string {
  if (bigWin) return 'A huge month, under budget everywhere. The flock is dancing.';
  switch (outcome) {
    case 'gain':
      return 'All three goals met. A new duck waddles into the pond.';
    case 'fancy_upgrade':
      return 'A perfect month at full flock. Everyone got a little fancier.';
    case 'hold':
      return 'Some goals met. The flock holds steady, and next month is a fresh chance to earn one.';
    case 'lose':
      return 'A tough month. One duck waddles off, but the pond is still here for you.';
  }
}

/** Mid-month pay-period recap frame. NOT "Time to count ducks!" (month-end only). */
export const PAY_PERIOD_RECAP_EYEBROW = 'Pay period wrapped';
export const MONTH_END_RECAP_EYEBROW = 'Time to count ducks!';
