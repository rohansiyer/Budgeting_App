/**
 * Tests for the thin insight-backing router. A category-scoped insight is
 * backed by that envelope's ledger; any other insight is backed by the
 * safe-to-spend breakdown. The router must add no math of its own — it returns
 * exactly what the underlying selectors return.
 */
import { useBudgetStore } from '../../store';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { cents } from '../../lib/money';
import { insightBacking } from '../insightBacking';
import { safeToSpendBreakdown } from '../safeToSpend';
import { envelopeLedger } from '../envelopeLedger';

const store = () => useBudgetStore.getState();
const WEEK = '2026-01-05';

async function freshChapter() {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  await store().createChapter({ name: 'Test', startedAt: '2026-01-01' });
}

async function makeWeeklyEnvelope(name: string, budget: number) {
  const c = await store().createCategory({
    name,
    colorKey: 'mint',
    fixed: false,
    envelope: { period: 'weekly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}

describe('insightBacking', () => {
  it('backs a category insight with that envelope ledger', async () => {
    await freshChapter();
    const food = await makeWeeklyEnvelope('Food', 10000);

    const backing = insightBacking({ ruleKey: 'envelope_under_budget', categoryId: food }, WEEK);
    expect(backing.ruleKey).toBe('envelope_under_budget');
    expect(backing.categoryId).toBe(food);
    expect(backing.safeToSpend).toBeUndefined();
    expect(backing.envelope).toEqual(envelopeLedger(food, WEEK));
  });

  it('backs a non-category insight with the safe-to-spend breakdown', async () => {
    await freshChapter();
    await makeWeeklyEnvelope('Food', 10000);

    const backing = insightBacking({ ruleKey: 'safe_to_spend_pace' }, WEEK);
    expect(backing.ruleKey).toBe('safe_to_spend_pace');
    expect(backing.envelope).toBeUndefined();
    expect(backing.safeToSpend).toEqual(safeToSpendBreakdown(WEEK));
  });
});
