/**
 * Pure logic for the redrawn Pond screen (handoff v3 §2.2 "The Pond, redrawn").
 * Split out so it is unit testable without rendering the screen (this repo's
 * Jest setup cannot transform JSX in .tsx files).
 *
 * Two concerns live here:
 *
 *   1. PERIOD-WINDOW SELECTION — which cycle (this budget week, or this
 *      calendar month) an envelope's live ring/legend numbers should read
 *      from, dispatching on the category's OWN cadence (CLAUDE.md: "monthly
 *      envelopes use month-to-date, weekly use week-to-date"). Pure date
 *      math only; PondScreen.tsx does the actual store reads for whichever
 *      window comes back.
 *
 *   2. RING/LEGEND ASSEMBLY — turning a flat list of already-resolved
 *      per-category period reads (screen-supplied, cadence-correct) into the
 *      EnvelopeRing input list (envelope categories only) and the legend rows
 *      (every category, fixed or not, matching the existing PondScreen
 *      legend). Pure, float-free aggregation.
 */

import { monthKeyOf, weekStartOf } from '../format/dates';
import { cents, sumCents, type Cents } from '../lib/money';
import type { CadenceType, CategoryColorKey, ISODate, MonthKey, WeekStart } from '../types/contracts';
import type { RingEnvelopeInput } from './pond/envelopeRing.logic';

/**
 * Day one is exactly the window the STARTER DUCK INVARIANT describes
 * (src/ducks/engine.ts): the flock holds only the starter duck AND no month
 * has ever been evaluated for the active chapter. A flock that dropped back
 * to 1 duck after a later 3/3-then-0/3 history is NOT day one, even though
 * the duck count matches, because evaluations exist.
 */
export function isDayOnePond(duckCount: number, evaluationsCount: number): boolean {
  return duckCount === 1 && evaluationsCount === 0;
}

// ---------------------------------------------------------------------------
// 1. Period-window selection
// ---------------------------------------------------------------------------

export type PondPeriodWindow =
  | { cadence: 'weekly'; weekStart: WeekStart }
  | { cadence: 'monthly'; month: MonthKey };

/**
 * Which cycle an envelope's live numbers come from, given its own configured
 * cadence and today's date. Weekly envelopes read the Mon..Sun week
 * containing today; monthly envelopes read the calendar month containing
 * today. Normalization (Monday-of, first-of-month) is delegated to
 * format/dates so this stays a single source of truth with the rest of the
 * app's week/month attribution.
 */
export function envelopePeriodWindow(cadence: CadenceType, todayISO: ISODate): PondPeriodWindow {
  if (cadence === 'monthly') {
    return { cadence: 'monthly', month: monthKeyOf(todayISO) };
  }
  return { cadence: 'weekly', weekStart: weekStartOf(todayISO) };
}

// ---------------------------------------------------------------------------
// 2. Ring + legend assembly
// ---------------------------------------------------------------------------

/**
 * One category's already-resolved current-period read. The screen is
 * responsible for picking configuredBudget/spent from `getEnvelopeWeekState`
 * (weekly) or `getPlanVsActual` (monthly, and always for fixed categories,
 * which carry no envelope budget) per `envelopePeriodWindow` above — this
 * module only aggregates the result.
 */
export interface CategoryPeriodRead {
  categoryId: string;
  categoryName: string;
  colorKey: CategoryColorKey;
  /** false for fixed categories (envelope === null); budgetCents is then 0. */
  hasEnvelope: boolean;
  budgetCents: number;
  spentCents: number;
}

/** One legend row: every category (fixed included), matching today's PondScreen legend. */
export interface PondLegendRow {
  categoryId: string;
  categoryName: string;
  colorKey: CategoryColorKey;
  planned: Cents;
  actual: Cents;
}

export interface PondRingAssembly {
  /** Envelope categories only (fixed categories own no ring arc). */
  ringEnvelopes: RingEnvelopeInput[];
  /** Every category, fixed or enveloped, for the legend RuledList. */
  legend: PondLegendRow[];
  /** Sum of ring envelope budgets — the "of $X.XX spent" denominator. */
  totalBudgetCents: Cents;
  /** Sum of ring envelope spend — the "$X.XX of" numerator. */
  totalSpentCents: Cents;
}

/**
 * Assemble the ring's envelope inputs and the legend rows from resolved
 * per-category period reads. Ring totals are scoped to enveloped categories
 * only (what the ring itself actually draws), consistent with the mockup's
 * period-spend line sitting directly under the ring.
 */
export function assemblePondRing(reads: readonly CategoryPeriodRead[]): PondRingAssembly {
  const ringEnvelopes: RingEnvelopeInput[] = reads
    .filter((r) => r.hasEnvelope)
    .map((r) => ({
      categoryId: r.categoryId,
      colorKey: r.colorKey,
      budgetCents: r.budgetCents,
      spentCents: r.spentCents,
    }));

  const legend: PondLegendRow[] = reads.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    colorKey: r.colorKey,
    planned: cents(r.budgetCents),
    actual: cents(r.spentCents),
  }));

  const totalBudgetCents = sumCents(ringEnvelopes.map((e) => cents(e.budgetCents)));
  const totalSpentCents = sumCents(ringEnvelopes.map((e) => cents(e.spentCents)));

  return { ringEnvelopes, legend, totalBudgetCents, totalSpentCents };
}

/** Flock count line ("8 of 12 ducks") — fixed display cap, matching DuckChipSlot's convention. */
export const FLOCK_DISPLAY_CAP = 12;

export function flockCountLabel(duckCount: number): string {
  return `${duckCount} of ${FLOCK_DISPLAY_CAP} ducks`;
}
