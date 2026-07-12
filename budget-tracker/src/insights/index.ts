/**
 * Insight module entry. `getInsightPort()` is the only consumption path —
 * screens must not reach into rule internals. Lazily builds the real
 * deterministic rule engine (src/insights/engine.ts, src/insights/rules.ts)
 * over the live store; one engine per app session.
 */
import type { InsightPort } from './port';
import { createInsightEngine } from './engine';
import { useBudgetStore } from '../store';

let port: InsightPort | null = null;

export function getInsightPort(): InsightPort {
  if (!port) {
    port = createInsightEngine({ getStore: () => useBudgetStore.getState() });
  }
  return port;
}

export type { InsightPort, InsightSentence } from './port';
