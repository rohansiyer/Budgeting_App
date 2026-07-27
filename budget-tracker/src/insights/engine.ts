/**
 * Team 4 (Insights) — createInsightEngine(deps): InsightPort (v0.3 §3.6).
 *
 * Ranks the fired rules and returns the top match(es); never generates
 * prose, never touches the network, never reaches for Date.now()/Math.random
 * in the ranking itself. Stability is a consequence of purity: every rule is
 * a pure function of (store state at call time, ctx), so two calls on the
 * same day against unchanged store state always return the same sentence.
 */
import type { InsightPort, InsightSentence } from './port';
import type { StoreContract } from '../types/contracts';
import { addDaysISO } from '../format/dates';
import { ALL_RULES } from './rules';
import type { FiredInsight, InsightRule, RuleContext } from './types';

export interface InsightEngineDeps {
  /** Composes useBudgetStore.getState() in the app (see index.ts / src/ducks/appEngine.ts). */
  getStore: () => StoreContract;
  /** Override point for tests; defaults to the shipped rule set. */
  rules?: readonly InsightRule[];
}

function homeContext(store: StoreContract, todayISO: string): RuleContext {
  return { today: todayISO, window: { from: addDaysISO(todayISO, -6), to: todayISO }, store };
}

function recapContext(store: StoreContract, period: { start: string; end: string }): RuleContext {
  return { today: period.end, window: { from: period.start, to: period.end }, store };
}

interface Ranked {
  rule: InsightRule;
  fired: FiredInsight;
}

/**
 * Fire every rule against `ctx` and rank the survivors: priority (higher
 * first), then eventDate recency (more recent first), then rule key
 * (ascending) as a final deterministic tiebreak so ranking never depends on
 * iteration order or randomness.
 */
function rankFired(rules: readonly InsightRule[], ctx: RuleContext): Ranked[] {
  const out: Ranked[] = [];
  for (const rule of rules) {
    const fired = rule.trigger(ctx);
    if (fired) out.push({ rule, fired });
  }
  out.sort((a, b) => {
    if (a.rule.priority !== b.rule.priority) return b.rule.priority - a.rule.priority;
    const aDate = a.fired.eventDate ?? ctx.today;
    const bDate = b.fired.eventDate ?? ctx.today;
    if (aDate !== bDate) return aDate > bDate ? -1 : 1;
    return a.rule.key < b.rule.key ? -1 : a.rule.key > b.rule.key ? 1 : 0;
  });
  return out;
}

/** Stable per-day identity per port.ts: ruleKey + subject + date. */
function toSentence(entry: Ranked, dateForId: string): InsightSentence {
  const { rule, fired } = entry;
  return {
    id: `${rule.key}:${fired.categoryId ?? 'global'}:${dateForId}`,
    ruleKey: rule.key,
    categoryId: fired.categoryId,
    colorKey: fired.colorKey,
    prefix: fired.prefix,
    amountText: fired.amountText,
    suffix: fired.suffix,
  };
}

export function createInsightEngine(deps: InsightEngineDeps): InsightPort {
  const rules = deps.rules ?? ALL_RULES;

  return {
    getHomeInsight(todayISO) {
      const ctx = homeContext(deps.getStore(), todayISO);
      const ranked = rankFired(rules, ctx);
      if (ranked.length === 0) return null;
      return toSentence(ranked[0], todayISO);
    },

    getRecapInsights(period) {
      const ctx = recapContext(deps.getStore(), period);
      return rankFired(rules, ctx)
        .slice(0, 3)
        .map((entry) => toSentence(entry, period.end));
    },
  };
}
