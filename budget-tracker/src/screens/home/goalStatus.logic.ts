/**
 * Shared pure goal-status derivation for the three monthly duck goals
 * (fixed bills, variable envelope budgets, savings rate). Extracted from
 * PondScreen's `GoalTrackerCard` (see src/screens/PondScreen.tsx) so Home's
 * new goal strip (v0.3 handoff §3.5) can derive the SAME statuses without
 * duplicating the thresholds. PondScreen itself is left untouched this wave;
 * a follow-up wave can point it at this helper too.
 *
 * Pure and synchronous: callers own the (possibly async) store reads and
 * pass plain data in. No floats touch money comparisons; the only float
 * math here is the human-readable warning percentage, matching
 * PondScreen's existing display-only rounding.
 */
import type { Cents } from '../../lib/money';

export type GoalStatus = 'on_track' | 'at_risk' | 'checking';

/** One enveloped category's plan vs actual for the current month. */
export interface VariableEnvelopeInput {
  categoryId: string;
  categoryName: string;
  planned: Cents;
  actual: Cents;
}

export interface GoalStatusInputs {
  /** Fixed-bill status for the month, or null while still loading (async read). */
  bills: { expected: number; paid: number } | null;
  /** Total saved this month, or null while still loading (async read). */
  savings: Cents | null;
  /** Enveloped (non-fixed, budgeted) categories only. */
  variable: readonly VariableEnvelopeInput[];
}

/** A still-under-budget category close enough to its cap to warn about. */
export interface NearThresholdWarning {
  categoryId: string;
  categoryName: string;
  /** Rounded percent of budget consumed (display only). */
  percent: number;
}

export interface VariableBudgetsResult {
  status: GoalStatus;
  /** Categories over budget (drive `at_risk` on their own). */
  overspent: ReadonlyArray<{ categoryId: string; categoryName: string }>;
  /** Categories at/above the near-threshold band but still under budget. */
  warnings: readonly NearThresholdWarning[];
}

export interface GoalStatusResult {
  fixedBills: GoalStatus;
  variableBudgets: VariableBudgetsResult;
  savingsRate: GoalStatus;
}

/** Matches PondScreen's GoalTrackerCard early-warning band. */
export const NEAR_THRESHOLD_PERCENT = 90;

/** GOAL 1 — fixed bills paid on time. */
export function deriveFixedBillsStatus(
  bills: { expected: number; paid: number } | null,
): GoalStatus {
  if (bills === null) return 'checking';
  return bills.paid >= bills.expected ? 'on_track' : 'at_risk';
}

/**
 * GOAL 2 — every enveloped category within its monthly plan. `at_risk` fires
 * either when a category is already over budget, OR when one is still under
 * but at/above the near-threshold band (still saveable, hence the separate
 * `warnings` list a caller can turn into an "ease off" sentence).
 */
export function deriveVariableBudgetsStatus(
  variable: readonly VariableEnvelopeInput[],
): VariableBudgetsResult {
  const overspent = variable.filter((c) => c.planned > 0 && c.actual > c.planned);
  const warnings: NearThresholdWarning[] = variable
    .filter(
      (c) =>
        c.planned > 0 &&
        c.actual <= c.planned &&
        (c.actual as number) * 100 >= (c.planned as number) * NEAR_THRESHOLD_PERCENT,
    )
    .map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      percent: Math.round(((c.actual as number) / (c.planned as number)) * 100),
    }));
  const status: GoalStatus = overspent.length > 0 || warnings.length > 0 ? 'at_risk' : 'on_track';
  return {
    status,
    overspent: overspent.map((c) => ({ categoryId: c.categoryId, categoryName: c.categoryName })),
    warnings,
  };
}

/** GOAL 3 — savings on target so far this month (live proxy: any savings > 0). */
export function deriveSavingsRateStatus(savings: Cents | null): GoalStatus {
  if (savings === null) return 'checking';
  return savings > 0 ? 'on_track' : 'at_risk';
}

export function deriveGoalStatus(inputs: GoalStatusInputs): GoalStatusResult {
  return {
    fixedBills: deriveFixedBillsStatus(inputs.bills),
    variableBudgets: deriveVariableBudgetsStatus(inputs.variable),
    savingsRate: deriveSavingsRateStatus(inputs.savings),
  };
}

/** Combined header word ("On track" / "At risk" / "Checking") for the strip. */
export function overallGoalStatus(result: GoalStatusResult): GoalStatus {
  if (
    result.fixedBills === 'at_risk' ||
    result.variableBudgets.status === 'at_risk' ||
    result.savingsRate === 'at_risk'
  ) {
    return 'at_risk';
  }
  if (result.fixedBills === 'checking' || result.savingsRate === 'checking') return 'checking';
  return 'on_track';
}

/**
 * The single most-urgent near-threshold warning (highest percent first), or
 * null when nothing is close enough to warn about. Only near-threshold
 * (still fixable) categories are candidates — an already-overspent category
 * has nothing left to "ease off", so it never produces this sentence.
 */
export function topWarning(result: VariableBudgetsResult): NearThresholdWarning | null {
  if (result.warnings.length === 0) return null;
  return [...result.warnings].sort((a, b) => b.percent - a.percent)[0];
}
