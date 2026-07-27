/**
 * Team 4 (Insights) — internal rule-engine types (not part of the fixed
 * port.ts contract; these back the implementation behind getInsightPort()).
 */
import type { CategoryColorKey, DateRange, ISODate, StoreContract } from '../types/contracts';

/**
 * Everything a rule needs to evaluate, and nothing it can misuse: sync store
 * reads plus a date window. No network, no clock, no randomness — a rule is a
 * pure function of (store state as of the call, ctx).
 */
export interface RuleContext {
  /**
   * The reference ("as of") date for this evaluation: the real today for
   * getHomeInsight, or the recap period's `end` for getRecapInsights. Week
   * and month arithmetic ("last week", "last month") is always relative to
   * this, never to `new Date()`.
   */
  today: ISODate;
  /** The window this evaluation is scoped to: Home uses the trailing 7 days
   * ending `today`; Recap uses the caller's closed period as-is. */
  window: DateRange;
  /** Sync reads only (StoreContract's read surface is synchronous). */
  store: StoreContract;
}

/**
 * What a rule hands back when it fires. Mirrors InsightSentence's
 * prefix/amountText/suffix contract (the dollar figure travels separately so
 * surfaces can render it in the mono accent face) but omits the fields the
 * engine itself owns (`id`, `ruleKey`).
 */
export interface FiredInsight {
  prefix: string;
  /** A formatCents() string — never a raw number, never a percent. */
  amountText?: string;
  suffix?: string;
  categoryId?: string;
  colorKey?: CategoryColorKey;
  /**
   * The date the underlying event actually happened (a payday, a week close,
   * a milestone crossing...). Used ONLY for ranking ("priority then
   * recency") — not part of the public InsightSentence. Defaults to
   * ctx.today when a rule leaves it out.
   */
  eventDate?: ISODate;
}

export interface InsightRule {
  key: string;
  /** Static importance weight. HIGHER fires rank first when multiple rules
   * fire on the same day (ties broken by eventDate recency, then by key). */
  priority: number;
  trigger(ctx: RuleContext): FiredInsight | null;
}
