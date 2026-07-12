/**
 * Pure recap-trend math for ResultsScreen (v0.3 handoff §3.6, mockup "Recap ·
 * every pay period, plus month-end": "Spend · last 6 months" SparkBlocks).
 * Split out of the .tsx so it is unit testable (this repo's Jest setup
 * cannot transform JSX — see DailyDetailScreen.logic.ts for the same split).
 */
import { Cents, ZERO, cents } from '../lib/money';
import type { MonthKey } from '../types/contracts';

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export interface TrendMonth {
  monthKey: MonthKey;
  /** Single-letter month initial, e.g. "J" for both January and June. */
  label: string;
}

/**
 * Chronological (oldest → newest) list of the 6 months ending at `endMonth`
 * (inclusive). Handles year rollover. Malformed input falls back to a
 * single-entry list rather than throwing, so a bad month key degrades the
 * trend gracefully instead of crashing the recap screen.
 */
export function lastSixMonths(endMonth: MonthKey): TrendMonth[] {
  const m = /^(\d{4})-(\d{2})$/.exec(endMonth);
  if (!m) return [{ monthKey: endMonth, label: '?' }];
  const endYear = parseInt(m[1], 10);
  const endMonthNum = parseInt(m[2], 10); // 1..12
  const out: TrendMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    let mm = endMonthNum - i;
    let yy = endYear;
    while (mm < 1) {
      mm += 12;
      yy -= 1;
    }
    out.push({
      monthKey: `${yy}-${String(mm).padStart(2, '0')}`,
      label: MONTH_INITIALS[mm - 1] ?? '?',
    });
  }
  return out;
}

export interface SpendTrendColumn {
  label: string;
  value: Cents;
}

/**
 * Builds the 6 SparkBlocks columns ending at `endMonth`, one per calendar
 * month, using `totalFor` (a sync store read the caller supplies, e.g.
 * summing expense transactions for that month's date range) for each
 * month's total spend.
 */
export function buildSpendTrend(
  endMonth: MonthKey,
  totalFor: (monthKey: MonthKey) => Cents,
): SpendTrendColumn[] {
  return lastSixMonths(endMonth).map((m) => ({ label: m.label, value: totalFor(m.monthKey) }));
}

const BLOCK_DENOMINATIONS = [500, 1000, 2500, 5000, 10000, 25000, 50000] as const;

/**
 * Picks a SparkBlocks blockValue denomination so the tallest column renders
 * roughly 6-8 blocks (mirrors format/moneyInput.ts's blockValueFor, which
 * targets a single budget rather than a multi-month max).
 */
export function trendBlockValue(values: readonly Cents[]): Cents {
  const max = values.reduce<Cents>((acc, v) => (v > acc ? v : acc), ZERO);
  for (const d of BLOCK_DENOMINATIONS) {
    if (max <= d * 8) return cents(d);
  }
  return cents(100000);
}

export type RecapOutcome = 'gain' | 'hold' | 'lose' | 'fancy_upgrade';

/** How many of the 3 goal results in an evaluation were met. */
export function goalsMetCount(results: readonly { met: boolean }[]): number {
  return results.filter((r) => r.met).length;
}

const OUTCOME_HEADER_PHRASE: Record<RecapOutcome, string> = {
  gain: 'a duck waddles in',
  fancy_upgrade: 'the flock gets fancier',
  hold: 'the flock holds steady',
  lose: 'a duck waddles off',
};

/**
 * Short recap header line under the month title, e.g. "3 of 3 goals, a duck
 * waddles in." (mockup "Recap · every pay period, plus month-end").
 */
export function recapHeaderLine(metCount: number, outcome: RecapOutcome): string {
  return `${metCount} of 3 goals, ${OUTCOME_HEADER_PHRASE[outcome]}.`;
}
