/**
 * Presentation + calendar helpers for ISO `YYYY-MM-DD` strings (TZ-safe;
 * everything routes through Date.UTC so device timezone never shifts a date).
 * Display-only logic — money never passes through here.
 */
import type { ISODate, MonthKey, WeekStart, DateRange } from '../types/contracts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function utc(isoDate: ISODate): Date {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(y: number, m: number, d: number): ISODate {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Device-local current date as an ISODate. */
export function todayISO(): ISODate {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDaysISO(isoDate: ISODate, n: number): ISODate {
  const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
  return toISO(y, m, d + n);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(isoDate: ISODate): number {
  return utc(isoDate).getUTCDay();
}

/** Monday starting the budget week that contains `isoDate`. */
export function weekStartOf(isoDate: ISODate): WeekStart {
  const wd = dayOfWeek(isoDate);
  return addDaysISO(isoDate, -(wd === 0 ? 6 : wd - 1));
}

export function monthKeyOf(isoDate: ISODate): MonthKey {
  return isoDate.slice(0, 7);
}

export function daysInMonth(isoDate: ISODate): number {
  const [y, m] = isoDate.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Inclusive range covering the whole calendar month of `isoDate`. */
export function monthRange(isoDate: ISODate): DateRange {
  const [y, m] = isoDate.split('-').map((n) => parseInt(n, 10));
  return { from: toISO(y, m, 1), to: toISO(y, m, daysInMonth(isoDate)) };
}

/** Inclusive Monday..Sunday range for the week starting `week`. */
export function weekRange(week: WeekStart): DateRange {
  return { from: week, to: addDaysISO(week, 6) };
}

export function eachDay(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  let d = range.from;
  while (d <= range.to) {
    out.push(d);
    d = addDaysISO(d, 1);
  }
  return out;
}

// --- labels ----------------------------------------------------------------
export function weekdayShort(isoDate: ISODate): string {
  return WEEKDAYS[utc(isoDate).getUTCDay()];
}

export function dayNumber(isoDate: ISODate): number {
  return utc(isoDate).getUTCDate();
}

/** "Sat, Jul 4" */
export function shortDate(isoDate: ISODate): string {
  const d = utc(isoDate);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Saturday, July 4" */
export function longDate(isoDate: ISODate): string {
  const d = utc(isoDate);
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "July 2026" */
export function monthTitle(isoDate: ISODate): string {
  const d = utc(isoDate);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
