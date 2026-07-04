/** Presentation-only date formatting for ISO `YYYY-MM-DD` strings (TZ-safe). */
import type { ISODate } from '../types/contracts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function utc(isoDate: ISODate): Date {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

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
