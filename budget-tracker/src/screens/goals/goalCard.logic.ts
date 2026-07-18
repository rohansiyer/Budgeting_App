/**
 * Pure copy/format helpers for the named-goal card (v0.3 handoff §3.10,
 * mockup "Named goal · the one Monarch feature worth taking"). No React, no
 * store reads — everything here is a deterministic function of already-read
 * values so it is trivially unit-testable (same style as billsForecast.logic
 * / searchLedger.logic).
 */
import { formatCents, type Cents } from '../../lib/money';
import type { GoalFunding } from '../../projections';
import type { ISODate } from '../../types/contracts';

/** Static tracked-uppercase label above every goal card (mockup hierarchy:
 * label line "GOAL", then a 20px/800 name line below it). */
export const GOAL_CARD_LABEL = 'GOAL';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Month name only (no day/year) for the "fully funded around X" pace line. */
export function monthNameOf(iso: ISODate): string {
  const m = Number(iso.slice(5, 7));
  return MONTHS_LONG[m - 1];
}

/** "$340.00" current (accent) + "of $1,200.00" target (muted), exact strings. */
export function goalAmountParts(
  currentCents: Cents,
  targetCents: Cents,
): { currentText: string; targetText: string } {
  return {
    currentText: formatCents(currentCents),
    targetText: `of ${formatCents(targetCents)}`,
  };
}

/**
 * Pace line under the meter — three states, never a fourth:
 *   - `fundedAroundISO` at/before today  => "Fully funded" (this includes an
 *     already-met/exceeded goal with zero trailing-month history: F4-1 —
 *     projectGoalFunding reports funded-as-of-today from the balance alone,
 *     independent of whether a pace could be derived).
 *   - `fundedAroundISO` null             => "Add to savings to start the
 *     clock" — genuinely no progress-with-history to project from (no
 *     history at all, or a known pace that never reaches the target).
 *   - otherwise                          => the computed month, never a
 *     fabricated one (handoff §3.9 house rule: never invent a number).
 */
export function goalPaceLine(funding: GoalFunding, today: ISODate): string {
  if (funding.fundedAroundISO === null) {
    return 'Add to savings to start the clock';
  }
  if (funding.fundedAroundISO <= today) {
    return 'Fully funded';
  }
  return `At your pace: fully funded around ${monthNameOf(funding.fundedAroundISO)}.`;
}
