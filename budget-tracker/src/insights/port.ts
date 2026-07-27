/**
 * WAVE-B CONTRACT — Insight port (v0.3 handoff §3.6 "delivered, never fetched").
 *
 * Insights are deterministic template rules computed on-device, never prose
 * generation and never fetched from a server. Consumers render whatever this
 * port returns and render NOTHING when it returns null/empty: silence beats
 * filler, and each surface shows at most one insight per day (the friction
 * rule). Producers rank fired rules and return the top matches only.
 */
import type { CategoryColorKey } from '../types/contracts';

/**
 * One rendered insight sentence. The dollar figure travels separately from
 * the words so surfaces can render it in the mono accent face (InsightRow's
 * prefix / amountText / suffix contract). `amountText` is a display string
 * from formatCents — no float math anywhere near this type.
 */
export interface InsightSentence {
  /** Stable per-day identity: ruleKey + subject + date. */
  id: string;
  /** The deterministic rule that fired (for drill-down and dedupe). */
  ruleKey: string;
  categoryId?: string;
  colorKey?: CategoryColorKey;
  prefix: string;
  amountText?: string;
  suffix?: string;
}

export interface InsightPort {
  /**
   * The single "Today's answer" sentence for the Home screen, or null for
   * silence. At most one per calendar day; repeated calls on the same day
   * return the same sentence.
   */
  getHomeInsight(todayISO: string): InsightSentence | null;
  /**
   * Top insights (max 3, ranked) for a recap covering [start, end] ISO dates.
   * Empty array when nothing fired.
   */
  getRecapInsights(period: { start: string; end: string }): InsightSentence[];
}
