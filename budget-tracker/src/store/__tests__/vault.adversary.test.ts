/**
 * TEAM 1 ADVERSARY (Opus) — attacks on the Vault money engine.
 *
 * Every claim is proven by a test that RUNS against the real in-memory SQLite
 * (node:sqlite via the expo-sqlite mock). Failing tests = confirmed bugs left
 * committed-failing; passing tests = verified-safe.
 *
 * Attack surfaces: conservation, borrow caps, atomicity, undo, duck-guard
 * attribution, allocate() income splits.
 */
import { useBudgetStore } from '../index';
import { initDatabase, resetDatabaseForTests, getRawDb } from '../../db/client';
import { cents, sumCents, type Cents } from '../../lib/money';
import { UNDO_WINDOW_MS } from '../../types/contracts';
import * as ids from '../../lib/ids';

const store = () => useBudgetStore.getState();

async function freshChapter() {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  await store().createChapter({ name: 'Test', startedAt: '2026-01-01' });
}
async function makeAccount(name: string, balance = 0, kind: 'spending' | 'savings' = 'spending') {
  const a = await store().createAccount({
    name, institution: null, kind, startingBalance: cents(balance), openedOn: '2026-01-01',
  });
  return a.id;
}
async function weeklyEnv(name: string, budget: number) {
  const c = await store().createCategory({
    name, colorKey: 'mint', fixed: false,
    envelope: { period: 'weekly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}
async function monthlyEnv(name: string, budget: number) {
  const c = await store().createCategory({
    name, colorKey: 'blue', fixed: false,
    cadence: 'monthly', // borrow dispatch keys off category cadence, not envelope.period
    envelope: { period: 'monthly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}

// Consecutive Mondays. 2026-01-05 is a Monday.
const W = (i: number): string => {
  const base = new Date(2026, 0, 5); // Jan 5 2026 (Mon)
  base.setDate(base.getDate() + i * 7);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Total in-envelope budget across the given weeks: sum of (remaining + spent). */
function systemBudget(cat: string, weeks: string[]): number {
  return weeks.reduce((acc, wk) => {
    const s = store().getEnvelopeWeekState(cat, wk);
    return acc + s.remaining + s.spent;
  }, 0);
}

// ===========================================================================
// 1. CONSERVATION — budget moves, it is never created or destroyed.
// ===========================================================================
describe('conservation across long chains', () => {
  it('multi-week rollForward chain: total budget = configured×weeks (no drift)', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Food', 10000);
    const weeks = [W(0), W(1), W(2), W(3), W(4), W(5)];
    // Roll every week forward into the next (chain). No spend.
    for (let i = 0; i < 5; i++) await store().rollForward(cat, weeks[i]);
    // All budget accumulates in the last week; nothing lost/created.
    expect(systemBudget(cat, weeks)).toBe(10000 * 6);
    expect(store().getEnvelopeWeekState(cat, W(5)).remaining).toBe(60000);
    for (let i = 0; i < 5; i++) {
      expect(store().getEnvelopeWeekState(cat, weeks[i]).remaining).toBe(0);
    }
  });

  it('roll THEN borrow the same week: conserved', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    const weeks = [W(0), W(1), W(2)];
    await store().rollForward(cat, W(0));          // W0 leftover 10000 -> W1
    await store().borrowFromNextWeek(cat, W(0), cents(3000)); // borrow 3000 from W1 into W0
    expect(systemBudget(cat, weeks)).toBe(10000 * 3);
  });

  it('borrow THEN roll the leftover of a borrowed-against week: conserved', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    const weeks = [W(0), W(1), W(2)];
    await store().borrowFromNextWeek(cat, W(0), cents(4000)); // W1 owes repay 4000
    await store().rollForward(cat, W(1));  // W1 remaining (10000-4000=6000) rolls to W2
    expect(store().getEnvelopeWeekState(cat, W(1)).remaining).toBe(0);
    expect(store().getEnvelopeWeekState(cat, W(2)).remaining).toBe(16000);
    expect(systemBudget(cat, weeks)).toBe(10000 * 3);
  });

  it('sweep a week that was rolled into: total = configured×weeks − sweeps', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Fun', 10000);
    // Sweeps move real cash (v0.2): a spending source funds the transfer.
    await makeAccount('Chk', 100000, 'spending');
    const savings = await makeAccount('Sav', 0, 'savings');
    const weeks = [W(0), W(1), W(2)];
    await store().rollForward(cat, W(0));             // W0 10000 -> W1 (W1 now 20000)
    await store().sweepToSavings(cat, W(1), savings); // sweep all 20000 out of the system
    expect(store().getEnvelopeWeekState(cat, W(1)).remaining).toBe(0);
    const swept = 20000;
    expect(systemBudget(cat, weeks)).toBe(10000 * 3 - swept);
    const savingsTotal = await store().evaluation.getMonthSavingsTotal('2026-01');
    expect(savingsTotal).toBe(swept);
  });

  it('chained borrow where the borrowed-against week itself repays a prior borrow: conserved', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    const weeks = [W(0), W(1), W(2), W(3)];
    await store().borrowFromNextWeek(cat, W(0), cents(3000)); // W1 repays 3000
    await store().borrowFromNextWeek(cat, W(1), cents(4000)); // borrow from W2 into W1 (W1 already repaying)
    expect(systemBudget(cat, weeks)).toBe(10000 * 4);
    // W1: 10000 + 4000(borrowed in) − 3000(repay) = 11000
    expect(store().getEnvelopeWeekState(cat, W(1)).remaining).toBe(11000);
  });

  it('conservation holds with spend interleaved (remaining+spent basis)', async () => {
    await freshChapter();
    const a = await makeAccount('A', 1000000);
    const cat = await weeklyEnv('Food', 10000);
    const weeks = [W(0), W(1), W(2)];
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(2500), date: W(0) });
    await store().rollForward(cat, W(0));            // rolls remaining 7500
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(6000), date: W(1) });
    await store().borrowFromNextWeek(cat, W(1), cents(2000));
    expect(systemBudget(cat, weeks)).toBe(10000 * 3);
  });

  it('monthly-envelope weekly split conserves the month budget exactly (allocate)', async () => {
    await freshChapter();
    // 10001¢ over the 4 Mondays of Jan 2026 must sum back to 10001 (no cent lost).
    const cat = await monthlyEnv('Groc', 10001);
    const janWeeks = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'];
    const parts = janWeeks.map((wk) => store().getEnvelopeWeekState(cat, wk).configuredBudget);
    expect(sumCents(parts as Cents[])).toBe(10001);
  });
});

// ===========================================================================
// 2. BORROW — v0.3: uncapped, cadence-aware. The guardrail is honest math, not
//    a cap. Attacks try to invent/destroy money via large or repeated borrows,
//    confuse the two cadences, or borrow-then-switch-cadence.
// ===========================================================================
describe('borrow (uncapped, cadence-aware)', () => {
  /** Sum of the two legs of every borrow pair for a category (pair-equality proof). */
  async function borrowPairs(cat: string): Promise<Map<string, number[]>> {
    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const pairs = new Map<string, number[]>();
    for (const e of entries) {
      if (e.kind !== 'borrow_in' && e.kind !== 'borrow_repay') continue;
      if (!e.pairId) continue;
      pairs.set(e.pairId, [...(pairs.get(e.pairId) ?? []), e.amount]);
    }
    return pairs;
  }

  it('no cap: borrowing 150% of next week is allowed and conserves budget', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    await store().borrowFromNextWeek(cat, W(0), cents(15000)); // 150% — was impossible under the old cap
    expect(store().getEnvelopeWeekState(cat, W(0)).borrowedIn).toBe(15000);
    // Next week goes honestly negative; nothing is blocked.
    expect(store().getEnvelopeWeekState(cat, W(1)).remaining).toBe(-5000);
    // Budget only moved: W0 + W1 still sum to configured × 2.
    expect(systemBudget(cat, [W(0), W(1)])).toBe(20000);
  });

  it('repeated max borrows never create or destroy a cent (conservation invariant)', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    const weeks = [W(0), W(1), W(2), W(3), W(4)];
    // Hammer arbitrary, sometimes-huge borrows across several weeks.
    await store().borrowFromNextWeek(cat, W(0), cents(9999));
    await store().borrowFromNextWeek(cat, W(0), cents(40000));
    await store().borrowFromNextWeek(cat, W(1), cents(1));
    await store().borrowFromNextWeek(cat, W(2), cents(25000));
    await store().borrowFromNextWeek(cat, W(3), cents(3));
    // Total in-envelope budget across all touched weeks is exactly configured × weeks.
    expect(systemBudget(cat, weeks)).toBe(10000 * 5);
    // Every pair has two equal legs (no cents invented on either side).
    for (const legs of (await borrowPairs(cat)).values()) {
      expect(legs).toHaveLength(2);
      expect(legs[0]).toBe(legs[1]);
    }
  });

  it('monthly-cadence envelope borrows from next CALENDAR month, both legs attribute to the origin month', async () => {
    await freshChapter();
    const cat = await monthlyEnv('Fun', 20000);
    // Borrow from July into July's own overspend: repay leg sits in August.
    await store().borrowFromNextCycle(cat, '2026-07-15', cents(30000)); // 150% of monthly budget, allowed
    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const bin = entries.find((e) => e.kind === 'borrow_in')!;
    const rep = entries.find((e) => e.kind === 'borrow_repay')!;
    expect(bin.weekStart).toBe('2026-07-01');
    expect(rep.weekStart).toBe('2026-08-01');
    expect(bin.amount).toBe(30000);
    expect(rep.amount).toBe(30000);
    expect(bin.pairId).toBe(rep.pairId);
    // Origin (July) owns BOTH legs — you cannot borrow from August to dodge July's duck.
    const jul = await store().evaluation.getCarryoverEntries({ month: '2026-07' });
    const aug = await store().evaluation.getCarryoverEntries({ month: '2026-08' });
    expect(jul.map((e) => e.kind).sort()).toEqual(['borrow_in', 'borrow_repay']);
    expect(aug).toHaveLength(0);
  });

  it('cross-cadence confusion: the weekly delegate refuses a monthly envelope, and a monthly borrow leaves weekly reads untouched', async () => {
    await freshChapter();
    const monthly = await monthlyEnv('Fun', 20000);
    // The legacy delegate must not silently borrow "next week" from a monthly envelope.
    await expect(store().borrowFromNextWeek(monthly, '2026-01-05', cents(1000))).rejects.toThrow(
      /monthly-cadence/,
    );
    // A proper monthly borrow writes month-boundary legs that the week-keyed
    // reads (Monday weekStarts) never pick up — no accidental double-counting.
    await store().borrowFromNextCycle(monthly, '2026-01-15', cents(4000));
    expect(store().getEnvelopeWeekState(monthly, W(0)).borrowedIn).toBe(0);
    expect(store().getEnvelopeWeekState(monthly, W(1)).repaying).toBe(0);
  });

  it('borrow-then-switch-cadence: frozen legs plus a fresh monthly pair, all conserved', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    await store().borrowFromNextWeek(cat, W(0), cents(6000)); // weekly repay at W(1)
    await store().updateCategory(cat, { cadence: 'monthly' });
    await store().borrowFromNextCycle(cat, W(0), cents(2500)); // monthly legs now

    const pairs = await borrowPairs(cat);
    expect(pairs.size).toBe(2); // one frozen weekly pair + one new monthly pair
    for (const legs of pairs.values()) {
      expect(legs).toHaveLength(2);
      expect(legs[0]).toBe(legs[1]); // each pair still internally equal
    }
    // The original weekly repay leg kept its Monday period math.
    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    expect(entries.some((e) => e.kind === 'borrow_repay' && e.weekStart === W(1))).toBe(true);
    // The new monthly repay landed at the next month boundary (W(0) is in Jan 2026).
    expect(entries.some((e) => e.kind === 'borrow_repay' && e.weekStart === '2026-02-01')).toBe(true);
  });

  it('a phantom category throws before any write (atomic reject)', async () => {
    await freshChapter();
    await expect(store().borrowFromNextCycle('ghost', W(0), cents(1000))).rejects.toThrow(
      /unknown category/i,
    );
    const rows = getRawDb().getAllSync(`SELECT id FROM carryover_entries`);
    expect(rows).toHaveLength(0);
  });

  it('a throw mid-borrow rolls back both legs (no orphan carryover row)', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    // Force a PK collision: every generated id (pairId + both leg ids) is 'dup',
    // so the second insert collides and the whole borrow must roll back.
    const spy = jest.spyOn(ids, 'generateId').mockReturnValue('dup');
    await expect(store().borrowFromNextCycle(cat, W(0), cents(3000))).rejects.toThrow();
    spy.mockRestore();
    // DB carries no partial write; the week is exactly its configured budget.
    const rows = getRawDb().getAllSync(`SELECT id FROM carryover_entries`);
    expect(rows).toHaveLength(0);
    expect((await store().evaluation.getCarryoverEntries({ categoryId: cat }))).toHaveLength(0);
    expect(store().getEnvelopeWeekState(cat, W(0)).remaining).toBe(10000);
  });
});

// ===========================================================================
// 3. ATOMICITY — throw mid-mutation leaves DB + Zustand consistent.
// ===========================================================================
describe('atomicity', () => {
  it('CONFIRMED BUG: transfer to a non-existent account silently destroys money (no throw, orphan row)', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const before = store().getTotalBalance('2026-01-31');

    // A transfer to an id that is not a real account must be rejected atomically —
    // money may never leave the system. Currently it resolves, the debit persists,
    // and the credit lands on a phantom account that getTotalBalance cannot see.
    await expect(
      store().transfer({ fromAccountId: a, toAccountId: 'ghost-does-not-exist', amount: cents(5000), date: '2026-01-06' }),
    ).rejects.toThrow();

    // Money conserved (fails today: total drops from 100000 to 95000).
    expect(store().getTotalBalance('2026-01-31')).toBe(before);
    // No orphan transfer_in row to a non-existent account (fails today).
    const orphans = getRawDb().getAllSync(
      `SELECT id FROM transactions WHERE account_id = 'ghost-does-not-exist'`,
    );
    expect(orphans).toHaveLength(0);
  });

  it('PK collision mid-transfer rolls back both legs (real atomicity)', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const b = await makeAccount('B', 0);
    const spy = jest.spyOn(ids, 'generateId').mockReturnValue('dup-id');
    await expect(
      store().transfer({ fromAccountId: a, toAccountId: b, amount: cents(5000), date: '2026-01-06' }),
    ).rejects.toThrow();
    spy.mockRestore();
    // DB unchanged.
    const rows = getRawDb().getAllSync(`SELECT id FROM transactions`);
    expect(rows).toHaveLength(0);
    // Zustand state matches DB (no optimistic drift).
    expect(store().getAccountBalance(a, '2026-01-31')).toBe(100000);
    expect(store().getAccountBalance(b, '2026-01-31')).toBe(0);
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(0);
  });

  it('duckPersistence.commit rolls back inserts when a later evaluation collides (verdict finality guard)', async () => {
    await freshChapter();
    const chapterId = store().getActiveChapter().id;
    const mkEval = (id: string, month: string) => ({
      id, chapterId, month, evaluatedAt: '2026-02-01T00:00:00Z',
      goalFixedBills: { met: true, detail: '' },
      goalVariableBudgets: { met: true, detail: '' },
      goalSavingsRate: { met: true, detail: '' },
      outcome: 'gain' as const, duckCountAfter: 1, accessoryTierAfter: 0,
      final: true as const,
    });
    // Seed one evaluation.
    await store().duckPersistence.commit(chapterId, {
      newEvaluations: [mkEval('ev-jan', '2026-01')], ducks: [], accessoryTier: 0,
    });
    const afterFirst = getRawDb().getAllSync(`SELECT id FROM duck_evaluations`).length;
    expect(afterFirst).toBe(1);

    // Batch whose FIRST eval is new (would insert) but SECOND duplicates an issued one → throw.
    await expect(
      store().duckPersistence.commit(chapterId, {
        newEvaluations: [mkEval('ev-feb', '2026-02'), mkEval('ev-jan', '2026-01')],
        ducks: [], accessoryTier: 0,
      }),
    ).rejects.toThrow();

    // The new 'ev-feb' insert must have rolled back — nothing partially persisted.
    const rows = getRawDb().getAllSync<{ id: string }>(`SELECT id FROM duck_evaluations`);
    expect(rows.map((r) => r.id).sort()).toEqual(['ev-jan']);
    // Zustand cache matches DB.
    expect(store()._evaluations.map((e) => e.id).sort()).toEqual(['ev-jan']);
  });

  it('a store cache reflects only committed state after a failed mutation (no optimistic write)', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const spy = jest.spyOn(ids, 'generateId').mockReturnValue('dup-id2');
    await expect(
      store().transfer({ fromAccountId: a, toAccountId: await makeAccount('B', 0), amount: cents(1000), date: '2026-01-06' }),
    ).rejects.toThrow();
    spy.mockRestore();
    expect(store()._txnRows.filter((t) => t.deletedAt == null)).toHaveLength(0);
  });
});

// ===========================================================================
// 4. UNDO — window semantics.
// ===========================================================================
describe('undo window', () => {
  async function spend() {
    const a = await makeAccount('A', 100000);
    const cat = await weeklyEnv('Food', 10000);
    const id = await store().addExpense({ accountId: a, categoryId: cat, amount: cents(2500), date: '2026-01-06' });
    return { a, cat, id };
  }

  it('undo within window restores identically incl. envelope week state', async () => {
    await freshChapter();
    const { cat, id } = await spend();
    const before = store().getEnvelopeWeekState(cat, '2026-01-05');
    expect(before.spent).toBe(2500);
    const { undo } = await store().deleteTransaction(id);
    expect(store().getEnvelopeWeekState(cat, '2026-01-05').spent).toBe(0);
    expect(await undo()).toBe(true);
    const after = store().getEnvelopeWeekState(cat, '2026-01-05');
    expect(after.spent).toBe(2500);
    expect(after.remaining).toBe(before.remaining);
  });

  it('undo after expiry resolves false and stays deleted', async () => {
    await freshChapter();
    const { id } = await spend();
    const { undo, expiresAt } = await store().deleteTransaction(id);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(expiresAt + UNDO_WINDOW_MS + 1);
    expect(await undo()).toBe(false);
    nowSpy.mockRestore();
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(0);
  });

  it('double-undo is idempotent (second undo does not error, row stays restored)', async () => {
    await freshChapter();
    const { id } = await spend();
    const { undo } = await store().deleteTransaction(id);
    expect(await undo()).toBe(true);
    // second call within window — must not throw or re-delete.
    await undo();
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(1);
  });

  it('delete → new spend in same envelope → undo: week state accounts for both', async () => {
    await freshChapter();
    const { a, cat, id } = await spend();
    const { undo } = await store().deleteTransaction(id); // remove the 2500
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(1000), date: '2026-01-07' });
    expect(store().getEnvelopeWeekState(cat, '2026-01-05').spent).toBe(1000);
    expect(await undo()).toBe(true);
    // Both the restored 2500 and the new 1000 count.
    expect(store().getEnvelopeWeekState(cat, '2026-01-05').spent).toBe(3500);
  });
});

// ===========================================================================
// 5. DUCK-GUARD ATTRIBUTION — basis excludes borrow/sweeps; week belongs to Monday's month.
// ===========================================================================
describe('duck-guard attribution', () => {
  it('last-week-of-month overspend covered by next-month borrow: origin month punished on un-inflated basis; next month not double-punished', async () => {
    await freshChapter();
    const a = await makeAccount('A', 1000000);
    const cat = await weeklyEnv('Gas', 10000);
    // Last budget week of July 2026 starts Mon 2026-07-27 (extends into Aug 1-2).
    const julyLastWeek = '2026-07-27';
    const augFirstWeek = '2026-08-03';
    // Overspend the week: borrow 5000 from August to cover a 14000 spend.
    await store().borrowFromNextWeek(cat, julyLastWeek, cents(5000));
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(14000), date: '2026-07-28' });

    const july = (await store().evaluation.getMonthCategoryTotals('2026-07')).find((t) => t.categoryId === cat)!;
    const aug = (await store().evaluation.getMonthCategoryTotals('2026-08')).find((t) => t.categoryId === cat)!;

    // July basis = 4 configured weeks (Jul 6/13/20/27) × 10000, NOT inflated by the 5000 borrow_in.
    expect(july.budget).toBe(40000);
    expect(july.spent).toBe(14000); // overspend visible against the real basis
    // August basis = 5 weeks (Aug 3/10/17/24/31) × 10000, NOT reduced by the borrow_repay (not double-punished).
    expect(aug.budget).toBe(50000);
    expect(aug.spent).toBe(0);
    // Both carryover legs attribute to July (origin).
    const augCarry = await store().evaluation.getCarryoverEntries({ month: '2026-08' });
    expect(augCarry).toHaveLength(0);
    const julCarry = await store().evaluation.getCarryoverEntries({ month: '2026-07' });
    expect(julCarry.map((e) => e.kind).sort()).toEqual(['borrow_in', 'borrow_repay']);
  });

  it('roll_in/roll_out DO adjust the monthly basis (included per ruling)', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Food', 10000);
    // Cross-month roll: last July week -> first Aug week.
    await store().rollForward(cat, '2026-07-27'); // rolls 10000 from July into Aug
    const july = (await store().evaluation.getMonthCategoryTotals('2026-07')).find((t) => t.categoryId === cat)!;
    const aug = (await store().evaluation.getMonthCategoryTotals('2026-08')).find((t) => t.categoryId === cat)!;
    expect(july.budget).toBe(40000 - 10000); // 4 weeks basis reduced by roll_out
    expect(aug.budget).toBe(50000 + 10000);  // 5 weeks basis increased by roll_in
  });

  it('DOCUMENTED INCONSISTENCY: a straddling-week spend attributes to Monday-month in getMonthCategoryTotals but to the calendar day-month in getDaySpendTotals', async () => {
    await freshChapter();
    const a = await makeAccount('A', 1000000);
    const cat = await weeklyEnv('Gas', 10000);
    // Spend Aug 1 2026 (Sat) — inside the budget week starting Mon 2026-07-27.
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(5000), date: '2026-08-01' });

    const julyCat = (await store().evaluation.getMonthCategoryTotals('2026-07')).find((t) => t.categoryId === cat)!;
    const augCat = (await store().evaluation.getMonthCategoryTotals('2026-08')).find((t) => t.categoryId === cat)!;
    // Month-category attribution: week belongs to its Monday's month (July).
    expect(julyCat.spent).toBe(5000);
    expect(augCat.spent).toBe(0);

    // Day totals are keyed purely by calendar date → the SAME spend appears in August.
    const dayAug = store().getDaySpendTotals({ from: '2026-08-01', to: '2026-08-31' });
    const dayJul = store().getDaySpendTotals({ from: '2026-07-01', to: '2026-07-31' });
    const augDaySum = [...dayAug.values()].reduce((x, y) => x + y, 0);
    const julDaySum = [...dayJul.values()].reduce((x, y) => x + y, 0);
    // This asserts the CURRENT (inconsistent) behavior — flagged for orchestrator ruling.
    expect(augDaySum).toBe(5000);
    expect(julDaySum).toBe(0);
  });

  it('DOCUMENTED INCONSISTENCY: income is attributed by calendar month, spend by week month', async () => {
    await freshChapter();
    const a = await makeAccount('A', 0);
    const cat = await weeklyEnv('Gas', 10000);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(20000),
      schedule: { kind: 'monthly', anchorDate: '2026-08-01' },
      splits: [{ accountId: a, ratio: 1 }],
    });
    // Income Aug 1 (in the July-Monday budget week) but attributed to calendar August.
    await store().addIncome({ sourceId: src.id, date: '2026-08-01' });
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(5000), date: '2026-08-01' });

    const julyIncome = await store().evaluation.getMonthIncomeTotal('2026-07');
    const augIncome = await store().evaluation.getMonthIncomeTotal('2026-08');
    const julySpent = (await store().evaluation.getMonthCategoryTotals('2026-07')).find((t) => t.categoryId === cat)!.spent;
    // Income → August (calendar); spend on the same day → July (week). Mismatched months.
    expect(augIncome).toBe(20000);
    expect(julyIncome).toBe(0);
    expect(julySpent).toBe(5000);
  });
});

// ===========================================================================
// 7. allocate() INTEGRATION — persisted split rows sum EXACTLY to income.
// ===========================================================================
describe('allocate income splits', () => {
  it('[65,35] on odd cents sums exactly', async () => {
    await freshChapter();
    const a = await makeAccount('A', 0);
    const b = await makeAccount('B', 0);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(10001), // 100.01
      schedule: { kind: 'weekly', anchorDate: '2026-01-07' },
      splits: [{ accountId: a, ratio: 65 }, { accountId: b, ratio: 35 }],
    });
    await store().addIncome({ sourceId: src.id, date: '2026-01-07' });
    const balA = store().getAccountBalance(a, '2026-01-31');
    const balB = store().getAccountBalance(b, '2026-01-31');
    expect(balA + balB).toBe(10001);
    // Persisted rows also sum exactly.
    const rows = getRawDb().getAllSync<{ amount: number }>(`SELECT amount FROM transactions WHERE kind='income'`);
    expect(rows.reduce((x, r) => x + r.amount, 0)).toBe(10001);
  });

  it('[1,1,1] on odd cents sums exactly (largest-remainder)', async () => {
    await freshChapter();
    const a = await makeAccount('A', 0);
    const b = await makeAccount('B', 0);
    const c = await makeAccount('C', 0);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(10000), // 100.00 / 3
      schedule: { kind: 'weekly', anchorDate: '2026-01-07' },
      splits: [{ accountId: a, ratio: 1 }, { accountId: b, ratio: 1 }, { accountId: c, ratio: 1 }],
    });
    await store().addIncome({ sourceId: src.id, date: '2026-01-07' });
    const bals = [a, b, c].map((id) => store().getAccountBalance(id, '2026-01-31'));
    expect(bals.reduce((x, y) => x + y, 0)).toBe(10000);
    // Fair spread: 3334/3333/3333 in some order.
    expect([...bals].sort((x, y) => x - y)).toEqual([3333, 3333, 3334]);
    const income = await store().evaluation.getMonthIncomeTotal('2026-01');
    expect(income).toBe(10000);
  });

  it('override amount also conserves across splits', async () => {
    await freshChapter();
    const a = await makeAccount('A', 0);
    const b = await makeAccount('B', 0);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(10000),
      schedule: { kind: 'weekly', anchorDate: '2026-01-07' },
      splits: [{ accountId: a, ratio: 1 }, { accountId: b, ratio: 2 }],
    });
    await store().addIncome({ sourceId: src.id, date: '2026-01-07', amount: cents(9999) });
    const total = store().getAccountBalance(a, '2026-01-31') + store().getAccountBalance(b, '2026-01-31');
    expect(total).toBe(9999);
  });
});
