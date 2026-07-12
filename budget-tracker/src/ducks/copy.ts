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

/** Rotating celebration variants for earning a duck. Second person, no em dashes. */
const DUCK_ARRIVAL_VARIANTS = [
  'All three goals met. A new duck waddles into the pond.',
  'All three goals met. The flock grows by one today.',
  'All three goals met. A duck lands safely on the water.',
  'All three goals met. The pond welcomes a new friend.',
  'All three goals met. A new duck joins your flock.',
  'All three goals met. Another duck makes its way home.',
  'All three goals met. The flock gains a new member.',
  'All three goals met. A duck has arrived in your pond.',
];

/** Rotating celebration variants for winning a month with a big win. Second person, no em dashes. */
const MONTH_WON_VARIANTS = [
  'A huge month, under budget everywhere. The flock is dancing.',
  'Under budget in every envelope. The flock celebrates together.',
  'Perfect month, perfect control. The flock shines brightly.',
  'You crushed every goal this month. The flock is overjoyed.',
  'All targets met with room to spare. The flock dances on.',
  'Complete month, complete success. The entire flock is thriving.',
  'Flawless execution this month. The flock cheers loudly.',
  'Budget mastery achieved. The flock basks in the glow.',
];

/**
 * Deterministic variant picker: given a month key (YYYY-MM), returns a consistent
 * variant index based on the month number, ensuring the same month always gets
 * the same variant across sessions.
 */
export function celebrationVariantIndex(month: MonthKey, variants: readonly string[]): number {
  const [, m] = month.split('-');
  const monthNum = parseInt(m, 10); // 1..12
  return (monthNum - 1) % variants.length;
}

/**
 * Post-close outcome copy for a monthly verdict. Loss copy is the ratified v0.3
 * string; gain/hold/fancy read as earning a duck rather than avoiding a loss.
 */
export function outcomeCopy(outcome: DuckEvaluation['outcome'], bigWin: boolean, month?: MonthKey): string {
  if (bigWin) {
    if (month) {
      const idx = celebrationVariantIndex(month, MONTH_WON_VARIANTS);
      return MONTH_WON_VARIANTS[idx];
    }
    return 'A huge month, under budget everywhere. The flock is dancing.';
  }
  switch (outcome) {
    case 'gain':
      if (month) {
        const idx = celebrationVariantIndex(month, DUCK_ARRIVAL_VARIANTS);
        return DUCK_ARRIVAL_VARIANTS[idx];
      }
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
