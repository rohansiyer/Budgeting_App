/**
 * Team 4 (Pond) — pay-period boundary math (v0.3 §1.4 "Recap cadence").
 *
 * A pay period runs from one payday (inclusive) up to the day before the next
 * payday. It CLOSES on the next payday: that is when the finished period can be
 * recapped (you review the period you just lived as the new one begins). Given
 * the sorted paydays of the active income schedule(s), this module derives the
 * closed periods and tags each as a mid-month close or a month-end close.
 *
 * Pure and deterministic: no `new Date()`/"now" dependence beyond the `now`
 * argument, and all date arithmetic runs on UTC epoch days (see schedule.ts) so
 * there is no local-timezone/DST bucket for a bug to hide in. No money here.
 */

import type { ISODate, MonthKey } from '../types/contracts';
import { fromEpochDay, toEpochDay } from '../lib/schedule';

/**
 * 'month_end' — the calendar month changed between the period's opening payday
 * and its closing payday, so a month completed within this period and the recap
 * additionally carries that month's duck verdict (the "Time to count ducks!"
 * frame lives here). 'pay_period' — a mid-month close that carries no verdict
 * (verdicts stay FINAL and monthly; see engine.ts).
 */
export type PayPeriodKind = 'pay_period' | 'month_end';

export interface PayPeriod {
  /** Payday that opened the period (inclusive). */
  start: ISODate;
  /** Last day of the period (inclusive) = the day before `closedOn`. */
  end: ISODate;
  /** The payday that closes the period; the recap becomes due on this date. */
  closedOn: ISODate;
  kind: PayPeriodKind;
  /**
   * For 'month_end', the completed calendar month whose duck verdict this recap
   * carries (the month the period opened in). Null for mid-month closes.
   */
  verdictMonth: MonthKey | null;
}

function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}
function addDays(date: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(date) + n);
}

/**
 * Build the closed pay periods from a payday list. One period closes at each
 * payday AFTER the first (the first payday only opens the earliest period — a
 * partial stub before it is never recapped, mirroring the engine's partial
 * first-month skip). Input must be ascending and unique; duplicates and
 * out-of-order dates are defended against so a noisy port never mis-pairs
 * boundaries.
 */
export function payPeriodsFromPaydays(paydays: readonly ISODate[]): PayPeriod[] {
  const sorted = Array.from(new Set(paydays)).sort();
  const out: PayPeriod[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1];
    const closedOn = sorted[i];
    const crosses = monthOf(closedOn) !== monthOf(start);
    out.push({
      start,
      end: addDays(closedOn, -1),
      closedOn,
      kind: crosses ? 'month_end' : 'pay_period',
      verdictMonth: crosses ? monthOf(start) : null,
    });
  }
  return out;
}

export interface PendingRecapQuery {
  /** Paydays across the window of interest (e.g. chapter start .. now). */
  paydays: readonly ISODate[];
  /** Today ('YYYY-MM-DD'); a period is eligible only once its close has arrived. */
  now: ISODate;
  /** `closedOn` of the most recently acknowledged recap; null if none yet. */
  lastAcknowledged: ISODate | null;
}

/**
 * The pay-period closes still awaiting a recap: closed on or before `now` and
 * strictly after the last acknowledged close, oldest-first. String comparison
 * is exact for 'YYYY-MM-DD' dates, so no Date parsing is needed.
 */
export function pendingRecaps(query: PendingRecapQuery): PayPeriod[] {
  const { now, lastAcknowledged } = query;
  return payPeriodsFromPaydays(query.paydays).filter(
    (p) =>
      p.closedOn <= now &&
      (lastAcknowledged === null || p.closedOn > lastAcknowledged),
  );
}
