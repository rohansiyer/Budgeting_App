/**
 * Pure period-navigation math behind EnvelopeLedgerScreen's prior/next period
 * chevrons (F3-4). The envelope's own cadence decides the step: a
 * weekly-cadence envelope moves ±7 days (Monday to Monday); a
 * monthly-cadence envelope moves ±1 calendar month (1st to 1st). "Next" is
 * disabled once the viewed period IS the period containing today — there is
 * no future period to look ahead into.
 */
import { addDaysISO, monthKeyOf, weekStartOf, toISO } from '../../format/dates';
import type { CadenceType, ISODate } from '../../types/contracts';

/** Normalize any date to its period's canonical start: the Monday (weekly) or the 1st (monthly). */
export function periodStartFor(dateISO: ISODate, cadence: CadenceType): ISODate {
  if (cadence === 'monthly') return `${monthKeyOf(dateISO)}-01`;
  return weekStartOf(dateISO);
}

/** Step `deltaPeriods` whole periods forward/back: ±7 days (weekly) or ±1 calendar month (monthly). */
export function shiftPeriod(periodStartISO: ISODate, cadence: CadenceType, deltaPeriods: number): ISODate {
  if (cadence === 'monthly') {
    const [y, m] = periodStartISO.split('-').map((n) => parseInt(n, 10));
    const total = y * 12 + (m - 1) + deltaPeriods;
    const ny = Math.floor(total / 12);
    const nm = total - ny * 12 + 1;
    return toISO(ny, nm, 1);
  }
  return addDaysISO(periodStartISO, deltaPeriods * 7);
}

/** Whether "Next period" should be enabled: the viewed period must be strictly before the current one. */
export function canGoToNextPeriod(
  viewedPeriodStart: ISODate,
  cadence: CadenceType,
  todayISODate: ISODate,
): boolean {
  return viewedPeriodStart < periodStartFor(todayISODate, cadence);
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-07-06" -> "Jul 6" (no weekday, no year — the ledger's compact period label). */
function shortMonthDay(iso: ISODate): string {
  const [, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/** "Week of Jul 6" (weekly) or "July 2026" (monthly) — the viewed-period label. */
export function periodLabel(periodStartISO: ISODate, cadence: CadenceType): string {
  if (cadence === 'monthly') {
    const [y, m] = periodStartISO.split('-').map((n) => parseInt(n, 10));
    const MONTHS_LONG = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${MONTHS_LONG[m - 1]} ${y}`;
  }
  return `Week of ${shortMonthDay(periodStartISO)}`;
}
