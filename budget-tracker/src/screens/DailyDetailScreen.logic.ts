/**
 * Pure zero-state predicate for DailyDetailScreen, split out so it is unit
 * testable without rendering the screen (this repo's Jest setup cannot
 * transform JSX in .tsx files).
 */

/** The day has no logged transactions of any kind. */
export function isDayEmpty(dayTransactionCount: number): boolean {
  return dayTransactionCount === 0;
}
