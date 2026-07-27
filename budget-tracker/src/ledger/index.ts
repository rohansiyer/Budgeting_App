/**
 * Ledger selectors (v0.3 handoff §3.7 "Every number is a door"). Pure, sync,
 * read-only decompositions of figures the store already computes. Screens
 * import from here; there is no other consumption path.
 */
export {
  safeToSpendBreakdown,
  type SafeToSpendBreakdown,
  type SafeToSpendLine,
  type LedgerDirection,
} from './safeToSpend';
export {
  envelopeLedger,
  type EnvelopeLedger,
  type EnvelopeLedgerRow,
  type EnvelopeLedgerRowKind,
} from './envelopeLedger';
export { insightBacking, type InsightBacking, type InsightRef } from './insightBacking';
