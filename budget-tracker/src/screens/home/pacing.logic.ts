/**
 * Home screen pacing line (v0.3 handoff §3.5): "N days to payday, about
 * $X.XX a day keeps you green, tap for the math". Pure date/money math split
 * out of HomeScreen.tsx so it is unit-testable (jest cannot render .tsx —
 * see kit's StepTrack.logic.ts / SparkBlocks.logic.ts for the same split).
 *
 * No floats touch the per-day figure: the division is `allocate()` from
 * money.ts (largest-remainder, cent-conserving), same as income splits.
 */
import { allocate, type Cents } from '../../lib/money';
import { toEpochDay } from '../../lib/schedule';
import type { ISODate } from '../../types/contracts';

export interface PacingLineData {
  /** 0 when payday is today; otherwise whole days until the next payday. */
  daysToPayday: number;
  /** "About this much a day" figure, cent-exact. */
  perDay: Cents;
}

/**
 * Whole-day distance to the nearest payday on or after `today`. Paydays
 * strictly before `today` are ignored (a stale/past-only payday list reads
 * as "unknown", not a negative distance). Returns null when the caller's
 * lookahead window contained no future payday — the screen hides the
 * pacing line gracefully in that case (e.g. pre-setup, no income schedule
 * configured yet) rather than guessing.
 */
export function daysToPayday(today: ISODate, paydays: readonly ISODate[]): number | null {
  const upcoming = paydays.filter((d) => d >= today);
  if (upcoming.length === 0) return null;
  const next = upcoming.reduce((a, b) => (a < b ? a : b));
  return toEpochDay(next) - toEpochDay(today);
}

/**
 * Cent-exact "about $X a day" figure. `days` is floored to a minimum of 1
 * (payday today, days === 0, still means "today's the day this has to
 * cover" rather than a division by zero). Negative `remaining` (already
 * over pace) and zero `remaining` both fall out of `allocate` naturally —
 * no special-casing needed, no floats.
 */
export function perDayAmount(remaining: Cents, days: number): Cents {
  const buckets = Math.max(1, Math.floor(days));
  const shares = allocate(remaining, new Array(buckets).fill(1));
  return shares[0];
}

/** Combines the two into the data the pacing line renders, or null to hide it. */
export function computePacingLine(params: {
  today: ISODate;
  paydays: readonly ISODate[];
  remaining: Cents;
}): PacingLineData | null {
  const days = daysToPayday(params.today, params.paydays);
  if (days === null) return null;
  return { daysToPayday: days, perDay: perDayAmount(params.remaining, days) };
}

/** "4 days to payday" / "1 day to payday" / "Payday today". */
export function daysToPaydayPhrase(days: number): string {
  if (days <= 0) return 'Payday today';
  return `${days} day${days === 1 ? '' : 's'} to payday`;
}
