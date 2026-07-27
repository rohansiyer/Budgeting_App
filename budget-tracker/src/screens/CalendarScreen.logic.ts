/**
 * Pure zero-state + month-navigation math for CalendarScreen, split out so
 * it is unit testable without rendering the screen (this repo's Jest setup
 * cannot transform JSX in .tsx files).
 *
 * Month-nav (F4-6): the calendar tracks a `viewedMonth` ('YYYY-MM') separate
 * from today, with prev/next clamped to [chapter start month, current
 * month] so the heatmap/rings/empty-state can never scroll into a month
 * before the active chapter began or ahead of the present.
 */
import type { MonthKey } from '../types/contracts';

/** The month has no recorded activity at all (income or expense). */
export function isCalendarMonthEmpty(monthTransactionCount: number): boolean {
  return monthTransactionCount === 0;
}

/** Shift a 'YYYY-MM' month key by `delta` whole months (may be negative). */
export function shiftMonthKey(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10));
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Clamp `month` into the inclusive ['YYYY-MM' string-comparable] range. */
export function clampMonthKey(month: MonthKey, minMonth: MonthKey, maxMonth: MonthKey): MonthKey {
  if (month < minMonth) return minMonth;
  if (month > maxMonth) return maxMonth;
  return month;
}

/** Whether the "Previous month" control should be enabled. */
export function canGoToPrevMonth(month: MonthKey, minMonth: MonthKey): boolean {
  return month > minMonth;
}

/** Whether the "Next month" control should be enabled. */
export function canGoToNextMonth(month: MonthKey, maxMonth: MonthKey): boolean {
  return month < maxMonth;
}
