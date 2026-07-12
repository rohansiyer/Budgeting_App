/**
 * Engine-level tests: ranking, per-day stability, and silence. Ranking and
 * stability use dummy rules (pure, ignore ctx.store) so they don't depend on
 * real data; the silence test seeds a real (empty) store, mirroring the
 * money-path harness.
 */
import { createInsightEngine } from '../engine';
import type { FiredInsight, InsightRule } from '../types';
import type { StoreContract } from '../../types/contracts';
import { freshChapter, makeAccount, store } from './harness';

function dummyRule(key: string, priority: number, fired: FiredInsight | null, eventDate?: string): InsightRule {
  return {
    key,
    priority,
    trigger: () => (fired ? { ...fired, eventDate } : null),
  };
}

const FAKE_STORE = {} as StoreContract; // dummy rules never touch ctx.store

describe('ranking', () => {
  it('picks the highest-priority firing rule for Home', () => {
    const low = dummyRule('low', 10, { prefix: 'Low priority insight', suffix: 'here.' });
    const high = dummyRule('high', 90, { prefix: 'High priority insight', suffix: 'here.' });
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules: [low, high] });
    const sentence = engine.getHomeInsight('2026-01-20');
    expect(sentence).not.toBeNull();
    expect(sentence!.ruleKey).toBe('high');
  });

  it('breaks equal-priority ties by eventDate recency', () => {
    const older = dummyRule('older', 50, { prefix: 'Older', suffix: 'insight.' }, '2026-01-01');
    const newer = dummyRule('newer', 50, { prefix: 'Newer', suffix: 'insight.' }, '2026-01-15');
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules: [older, newer] });
    const sentence = engine.getHomeInsight('2026-01-20');
    expect(sentence!.ruleKey).toBe('newer');
  });

  it('falls back to rule key ascending as the final deterministic tiebreak', () => {
    const zebra = dummyRule('zebra', 50, { prefix: 'Zebra', suffix: 'insight.' });
    const alpha = dummyRule('alpha', 50, { prefix: 'Alpha', suffix: 'insight.' });
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules: [zebra, alpha] });
    const sentence = engine.getHomeInsight('2026-01-20');
    expect(sentence!.ruleKey).toBe('alpha');
  });

  it('returns the top 3 fired rules, ranked, for a recap', () => {
    const rules = [
      dummyRule('r1', 10, { prefix: 'One', suffix: 'insight.' }),
      dummyRule('r2', 90, { prefix: 'Two', suffix: 'insight.' }),
      dummyRule('r3', 50, { prefix: 'Three', suffix: 'insight.' }),
      dummyRule('r4', 70, { prefix: 'Four', suffix: 'insight.' }),
      dummyRule('r5', 30, null), // never fires
    ];
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules });
    const sentences = engine.getRecapInsights({ start: '2026-01-01', end: '2026-01-31' });
    expect(sentences.map((s) => s.ruleKey)).toEqual(['r2', 'r4', 'r3']);
  });
});

describe('per-day stability', () => {
  it('returns the identical sentence for repeated same-day calls', () => {
    const a = dummyRule('a', 60, { prefix: 'A fires', suffix: 'today.' });
    const b = dummyRule('b', 40, { prefix: 'B fires', suffix: 'today.' });
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules: [a, b] });
    const first = engine.getHomeInsight('2026-01-20');
    const second = engine.getHomeInsight('2026-01-20');
    expect(second).toEqual(first);
  });

  it('derives the sentence id from (rule, date), not from call count', () => {
    const rule = dummyRule('stable-rule', 60, { prefix: 'Stable', suffix: 'insight.', categoryId: 'cat-1' });
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules: [rule] });
    const s1 = engine.getHomeInsight('2026-01-20');
    const s2 = engine.getHomeInsight('2026-01-20');
    expect(s1!.id).toBe('stable-rule:cat-1:2026-01-20');
    expect(s1!.id).toBe(s2!.id);
  });
});

describe('silence', () => {
  it('returns null / [] against a real, freshly-created empty store', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 0);
    const engine = createInsightEngine({ getStore: () => store() });
    expect(engine.getHomeInsight('2026-01-20')).toBeNull();
    expect(engine.getRecapInsights({ start: '2026-01-01', end: '2026-01-31' })).toEqual([]);
  });

  it('returns null / [] with no rules at all', () => {
    const engine = createInsightEngine({ getStore: () => FAKE_STORE, rules: [] });
    expect(engine.getHomeInsight('2026-01-20')).toBeNull();
    expect(engine.getRecapInsights({ start: '2026-01-01', end: '2026-01-31' })).toEqual([]);
  });
});
