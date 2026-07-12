/**
 * Pure zero-state predicate for CalendarScreen, split out so it is unit
 * testable without rendering the screen (this repo's Jest setup cannot
 * transform JSX in .tsx files).
 */

/** The month has no recorded activity at all (income or expense). */
export function isCalendarMonthEmpty(monthTransactionCount: number): boolean {
  return monthTransactionCount === 0;
}
