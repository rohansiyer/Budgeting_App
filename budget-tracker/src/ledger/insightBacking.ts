/**
 * Ledger selector — the numbers behind an insight (v0.3 handoff §3.7: "Tap an
 * insight -> the numbers behind it"). Deliberately THIN: it routes an insight
 * to one of the two real selectors and adds no math of its own, so an insight
 * drill-down shows the exact same reconciled rows the rest of the app does.
 *
 * Routing:
 *   - an insight carrying a categoryId is backed by that envelope's ledger
 *   - any other insight is backed by the safe-to-spend breakdown
 *
 * READ-ONLY composition over the store (via the two selectors).
 */
import type { InsightSentence } from '../insights/port';
import type { ISODate } from '../types/contracts';
import { safeToSpendBreakdown, type SafeToSpendBreakdown } from './safeToSpend';
import { envelopeLedger, type EnvelopeLedger } from './envelopeLedger';

/** The subset of an InsightSentence needed to find its backing rows. */
export type InsightRef = Pick<InsightSentence, 'ruleKey' | 'categoryId'>;

export interface InsightBacking {
  ruleKey: string;
  categoryId?: string;
  /** Present for category-scoped insights. */
  envelope?: EnvelopeLedger;
  /** Present for non-category insights (safe-to-spend and its relatives). */
  safeToSpend?: SafeToSpendBreakdown;
}

/**
 * Return the reconciled row set that backs `insight` for the period starting
 * `periodStartISO` (a week start, or a month's first budget week for monthly
 * envelopes). No prose, no recomputation — just the underlying ledger.
 */
export function insightBacking(
  insight: InsightRef,
  periodStartISO: ISODate,
): InsightBacking {
  if (insight.categoryId != null) {
    return {
      ruleKey: insight.ruleKey,
      categoryId: insight.categoryId,
      envelope: envelopeLedger(insight.categoryId, periodStartISO),
    };
  }
  return {
    ruleKey: insight.ruleKey,
    safeToSpend: safeToSpendBreakdown(periodStartISO),
  };
}
