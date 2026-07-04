/**
 * Team 2 (New Chapter) implementation of the Wave-0 `PaydaysBetween`
 * contract (src/types/contracts.ts).
 *
 * Pure, deterministic date arithmetic — no `new Date()`/"now" dependence,
 * and (critically) no *local-timezone* Date math. Every date in this
 * module is a plain 'YYYY-MM-DD' calendar date; all arithmetic happens on
 * UTC epoch-day integers, so a date like 2024-03-10 (US spring-forward)
 * or 2024-11-03 (US fall-back) is just another day — there is no wall
 * clock, and therefore no DST bucket for a bug to hide in. Do not
 * introduce `new Date(isoString)` (local-tz parse) or `.getDate()`
 * (local-tz read) here; use the `toEpochDay`/`fromEpochDay` helpers.
 */
import type { DateRange, IncomeSchedule, ISODate, PaydaysBetween } from '../types/contracts';

const MS_PER_DAY = 86_400_000;

interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseISODate(iso: ISODate): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`schedule: not an ISODate ("YYYY-MM-DD"): "${iso}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) throw new Error(`schedule: invalid month in "${iso}"`);
  // Reject impossible-but-well-shaped dates ("2024-02-31") instead of
  // letting Date.UTC roll them into the next month, which would silently
  // shift a weekly/biweekly anchor's pay phase.
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`schedule: invalid day in "${iso}"`);
  }
  return { year, month, day };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function formatISODate(y: number, m: number, d: number): ISODate {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** ISODate -> integer day number since the Unix epoch, via UTC (no DST). */
export function toEpochDay(iso: ISODate): number {
  const { year, month, day } = parseISODate(iso);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Integer epoch day -> ISODate, via UTC (no DST). */
export function fromEpochDay(epochDay: number): ISODate {
  const d = new Date(epochDay * MS_PER_DAY);
  return formatISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Number of days in `month` (1-12) of `year`, leap-year aware. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of "next month" (0-indexed month === `month`) is the last day
  // of `month` itself.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Clamp a day-of-month into [1, daysInMonth(year, month)]. */
export function clampDayToMonth(day: number, year: number, month: number): number {
  const max = daysInMonth(year, month);
  return Math.min(Math.max(day, 1), max);
}

/** Inclusive list of {year, month} the [fromIso, toIso] range touches. */
function monthsBetween(fromIso: ISODate, toIso: ISODate): Array<{ year: number; month: number }> {
  const from = parseISODate(fromIso);
  const to = parseISODate(toIso);
  const out: Array<{ year: number; month: number }> = [];
  let y = from.year;
  let m = from.month;
  // Bound the loop generously; a legitimate query range should never
  // approach this, it only guards against pathological/malformed input.
  for (let i = 0; i < 1_000_000; i++) {
    if (y > to.year || (y === to.year && m > to.month)) break;
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Every `periodDays`-th day from `anchor`, extended infinitely in both
 * directions (an anchor "in the future" relative to the queried range
 * still yields the correctly-phased past occurrences). */
function periodicPaydays(anchor: ISODate, periodDays: number, range: DateRange): ISODate[] {
  const anchorDay = toEpochDay(anchor);
  const fromDay = toEpochDay(range.from);
  const toDay = toEpochDay(range.to);
  if (fromDay > toDay) return [];

  // Smallest k such that anchorDay + k*periodDays >= fromDay (k may be
  // negative when the range precedes the anchor).
  const k = Math.ceil((fromDay - anchorDay) / periodDays);
  const out: ISODate[] = [];
  for (let day = anchorDay + k * periodDays; day <= toDay; day += periodDays) {
    if (day >= fromDay) out.push(fromEpochDay(day));
  }
  return out;
}

/** One payday per month, on `anchor`'s day-of-month, clamped to each
 * visited month's length (e.g. anchor day 31 -> April 30, Feb 28/29). */
function monthlyPaydays(anchor: ISODate, range: DateRange): ISODate[] {
  const fromDay = toEpochDay(range.from);
  const toDay = toEpochDay(range.to);
  if (fromDay > toDay) return [];

  const anchorDom = parseISODate(anchor).day;
  const out: ISODate[] = [];
  for (const { year, month } of monthsBetween(range.from, range.to)) {
    const day = clampDayToMonth(anchorDom, year, month);
    const epoch = toEpochDay(formatISODate(year, month, day));
    if (epoch >= fromDay && epoch <= toDay) out.push(fromEpochDay(epoch));
  }
  return out;
}

/** Up to two paydays per month, each of `days` independently clamped to
 * that month's length (e.g. [1, 30] in Feb -> [1, 28]). If both days
 * clamp to the same date (e.g. [30, 31] in Feb), only one payday is
 * emitted for that month — two "paydays" cannot land on one date. */
function semimonthlyPaydays(days: readonly [number, number], range: DateRange): ISODate[] {
  const fromDay = toEpochDay(range.from);
  const toDay = toEpochDay(range.to);
  if (fromDay > toDay) return [];

  const out: ISODate[] = [];
  for (const { year, month } of monthsBetween(range.from, range.to)) {
    const clampedDays = Array.from(new Set(days.map((d) => clampDayToMonth(d, year, month)))).sort(
      (a, b) => a - b,
    );
    for (const day of clampedDays) {
      const epoch = toEpochDay(formatISODate(year, month, day));
      if (epoch >= fromDay && epoch <= toDay) out.push(fromEpochDay(epoch));
    }
  }
  return out;
}

/**
 * Project every payday of `schedule` falling within `range` (inclusive
 * on both ends). Returned dates are sorted ascending with no duplicates.
 */
export const paydaysBetween: PaydaysBetween = (
  schedule: IncomeSchedule,
  range: DateRange,
): ISODate[] => {
  switch (schedule.kind) {
    case 'weekly':
      return periodicPaydays(schedule.anchorDate, 7, range);
    case 'biweekly':
      return periodicPaydays(schedule.anchorDate, 14, range);
    case 'monthly':
      return monthlyPaydays(schedule.anchorDate, range);
    case 'semimonthly': {
      if (!schedule.semimonthlyDays) {
        throw new Error('schedule: semimonthly IncomeSchedule requires semimonthlyDays');
      }
      return semimonthlyPaydays(schedule.semimonthlyDays, range);
    }
    default: {
      const exhaustive: never = schedule.kind;
      throw new Error(`schedule: unknown IncomeScheduleKind "${exhaustive as string}"`);
    }
  }
};
