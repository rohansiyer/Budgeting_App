/**
 * Money-path integration tests (Team 1). Exercise the real store against a
 * real in-memory SQLite (node:sqlite via the expo-sqlite mock):
 *  - conservation: rolls/borrows/sweeps move budget, never create cents
 *  - transfer atomicity: a throw mid-transfer leaves both accounts unchanged
 *  - allocate-based income split writes (cent-conserving across accounts)
 *  - undo window semantics (UNDO_WINDOW_MS expiry)
 *  - EvaluationReadPort attribution (cross-month borrow → origin month)
 */
import { useBudgetStore } from '../index';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
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
    name,
    institution: null,
    kind,
    startingBalance: cents(balance),
    openedOn: '2026-01-01',
  });
  return a.id;
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

async function makeMonthlyEnvelope(name: string, budget: number) {
  const c = await store().createCategory({
    name,
    colorKey: 'pink',
    fixed: false,
    cadence: 'monthly',
    envelope: { period: 'monthly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}

const WEEK = '2026-01-05'; // a Monday
const NEXT = '2026-01-12';

describe('conservation law', () => {
  it('rollForward: paired roll_out/roll_in share a pairId and equal amounts', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Food', 10000);
    await makeAccount('Checking', 100000);

    // No spend → full 10000 leftover rolls forward.
    await store().rollForward(cat, WEEK);

    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const out = entries.find((e) => e.kind === 'roll_out')!;
    const rin = entries.find((e) => e.kind === 'roll_in')!;
    expect(out).toBeDefined();
    expect(rin).toBeDefined();
    expect(out.amount).toBe(10000);
    expect(rin.amount).toBe(10000); // EQUAL — no cents created
    expect(out.pairId).toBe(rin.pairId);
    expect(out.weekStart).toBe(WEEK);
    expect(rin.weekStart).toBe(NEXT);
    expect(out.counterpartWeekStart).toBe(NEXT);
    expect(rin.counterpartWeekStart).toBe(WEEK);

    // Budget conserved: source week loses 10000, dest week gains 10000.
    expect(store().getEnvelopeWeekState(cat, WEEK).remaining).toBe(0);
    expect(store().getEnvelopeWeekState(cat, NEXT).remaining).toBe(20000);
  });

  it('borrow: paired borrow_in/borrow_repay share a pairId and equal amounts', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000);

    await store().borrowFromNextWeek(cat, WEEK, cents(3000));

    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const bin = entries.find((e) => e.kind === 'borrow_in')!;
    const rep = entries.find((e) => e.kind === 'borrow_repay')!;
    expect(bin.amount).toBe(3000);
    expect(rep.amount).toBe(3000); // EQUAL — no cents created
    expect(bin.pairId).toBe(rep.pairId);
    expect(bin.weekStart).toBe(WEEK);
    expect(rep.weekStart).toBe(NEXT);

    // This week +3000 available, next week −3000.
    expect(store().getEnvelopeWeekState(cat, WEEK).remaining).toBe(13000);
    expect(store().getEnvelopeWeekState(cat, NEXT).remaining).toBe(7000);
  });

  it('borrow uncapped: 100% and 150% of next week budget are both allowed and conserved', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000); // no cap in v0.3

    // 100% of next week's budget: allowed (was rejected under the old 50% cap).
    await store().borrowFromNextWeek(cat, WEEK, cents(10000));
    expect(store().getEnvelopeWeekState(cat, WEEK).borrowedIn).toBe(10000);
    expect(store().getEnvelopeWeekState(cat, WEEK).remaining).toBe(20000);
    // Next week goes negative — honest math, not an error.
    expect(store().getEnvelopeWeekState(cat, NEXT).remaining).toBe(0);

    // A further 5000 (now 150% total) also lands.
    await store().borrowFromNextWeek(cat, WEEK, cents(5000));
    expect(store().getEnvelopeWeekState(cat, WEEK).borrowedIn).toBe(15000);
    expect(store().getEnvelopeWeekState(cat, NEXT).remaining).toBe(-5000);

    // Budget only moved: this week + next week still sum to configured × 2.
    const wk = store().getEnvelopeWeekState(cat, WEEK);
    const nx = store().getEnvelopeWeekState(cat, NEXT);
    expect(wk.remaining + wk.spent + (nx.remaining + nx.spent)).toBe(20000);
  });

  it('borrowFromNextCycle (weekly cadence) matches the delegate: paired equal legs, origin-month attribution', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000);

    await store().borrowFromNextCycle(cat, WEEK, cents(3000));
    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const bin = entries.find((e) => e.kind === 'borrow_in')!;
    const rep = entries.find((e) => e.kind === 'borrow_repay')!;
    expect(bin.amount).toBe(3000);
    expect(rep.amount).toBe(3000);
    expect(bin.pairId).toBe(rep.pairId);
    expect(bin.weekStart).toBe(WEEK);
    expect(rep.weekStart).toBe(NEXT);
    expect(bin.attributionMonth).toBe('2026-01');
    expect(rep.attributionMonth).toBe('2026-01');
  });

  it('monthly-envelope borrow round-trip: next month debited, current month credited, pair integrity', async () => {
    await freshChapter();
    const cat = await makeMonthlyEnvelope('Fun', 20000);

    // Any date inside January is a valid current-period start for a monthly envelope.
    await store().borrowFromNextCycle(cat, '2026-01-15', cents(5000));

    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const bin = entries.find((e) => e.kind === 'borrow_in')!;
    const rep = entries.find((e) => e.kind === 'borrow_repay')!;
    // Legs live at the first-of-month of the current and next month.
    expect(bin.weekStart).toBe('2026-01-01'); // credited into January (current cycle)
    expect(rep.weekStart).toBe('2026-02-01'); // debited from February (next cycle)
    expect(bin.counterpartWeekStart).toBe('2026-02-01');
    expect(rep.counterpartWeekStart).toBe('2026-01-01');
    // Conservation: equal amounts, shared pair.
    expect(bin.amount).toBe(5000);
    expect(rep.amount).toBe(5000);
    expect(bin.pairId).toBe(rep.pairId);
    // Both legs attribute to the ORIGIN (January) month — the spend belongs there.
    expect(bin.attributionMonth).toBe('2026-01');
    expect(rep.attributionMonth).toBe('2026-01');
    const jan = await store().evaluation.getCarryoverEntries({ month: '2026-01' });
    const feb = await store().evaluation.getCarryoverEntries({ month: '2026-02' });
    expect(jan.map((e) => e.kind).sort()).toEqual(['borrow_in', 'borrow_repay']);
    expect(feb).toHaveLength(0);
  });

  it('borrowFromNextWeek delegate rejects a monthly-cadence envelope', async () => {
    await freshChapter();
    const cat = await makeMonthlyEnvelope('Fun', 20000);
    await expect(store().borrowFromNextWeek(cat, '2026-01-05', cents(1000))).rejects.toThrow(
      /monthly-cadence/,
    );
    // No partial write from the rejected delegate.
    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    expect(entries).toHaveLength(0);
  });

  it('borrow rejects a phantom category before any write', async () => {
    await freshChapter();
    await expect(
      store().borrowFromNextCycle('ghost-cat', WEEK, cents(1000)),
    ).rejects.toThrow(/unknown category/i);
    await expect(store().borrowFromNextWeek('ghost-cat', WEEK, cents(1000))).rejects.toThrow(
      /unknown category/i,
    );
  });

  it('borrow rejects a non-positive or non-integer amount', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000);
    await expect(store().borrowFromNextCycle(cat, WEEK, cents(0))).rejects.toThrow(/positive/);
    await expect(store().borrowFromNextCycle(cat, WEEK, -100 as never)).rejects.toThrow(/positive/);
    await expect(store().borrowFromNextCycle(cat, WEEK, 12.5 as never)).rejects.toThrow(/whole/);
  });

  it('borrow rejects a category with no configured envelope budget', async () => {
    await freshChapter();
    const fixed = await store().createCategory({
      name: 'Rent',
      colorKey: 'violet',
      fixed: true,
      envelope: null,
    });
    await expect(store().borrowFromNextCycle(fixed.id, WEEK, cents(1000))).rejects.toThrow(
      /no configured envelope/,
    );
  });

  it('nextCycleStartState (weekly): budget minus stacked borrow repayments', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000);

    let s = store().nextCycleStartState(cat, WEEK);
    expect(s.cycleStart).toBe(NEXT);
    expect(s.budget).toBe(10000);
    expect(s.alreadyOwed).toBe(0);
    expect(s.startsWith).toBe(10000);

    await store().borrowFromNextCycle(cat, WEEK, cents(3000));
    s = store().nextCycleStartState(cat, WEEK);
    expect(s.alreadyOwed).toBe(3000);
    expect(s.startsWith).toBe(7000);

    // Stacked borrow from the same week accumulates the debt against next week.
    await store().borrowFromNextCycle(cat, WEEK, cents(4000));
    s = store().nextCycleStartState(cat, WEEK);
    expect(s.alreadyOwed).toBe(7000);
    expect(s.startsWith).toBe(3000);
  });

  it('nextCycleStartState (monthly): next month budget minus stacked repayments', async () => {
    await freshChapter();
    const cat = await makeMonthlyEnvelope('Fun', 20000);

    let s = store().nextCycleStartState(cat, '2026-01-20');
    expect(s.cycleStart).toBe('2026-02-01');
    expect(s.budget).toBe(20000);
    expect(s.startsWith).toBe(20000);

    await store().borrowFromNextCycle(cat, '2026-01-20', cents(5000));
    await store().borrowFromNextCycle(cat, '2026-01-02', cents(3000)); // same Jan cycle
    s = store().nextCycleStartState(cat, '2026-01-31');
    expect(s.alreadyOwed).toBe(8000);
    expect(s.startsWith).toBe(12000);
  });

  it('nextCycleStartState throws on an unknown category', async () => {
    await freshChapter();
    expect(() => store().nextCycleStartState('ghost', WEEK)).toThrow(/unknown category/i);
  });

  it('cadence change after debt exists: old weekly legs keep their period math; the read follows the new cadence', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000);
    // Incur weekly debt: repay leg lands at next Monday.
    await store().borrowFromNextCycle(cat, WEEK, cents(3000));
    const weeklyRepay = (await store().evaluation.getCarryoverEntries({ categoryId: cat })).find(
      (e) => e.kind === 'borrow_repay',
    )!;
    expect(weeklyRepay.weekStart).toBe(NEXT); // 2026-01-12

    // Switch the envelope to monthly cadence while the weekly debt still exists.
    await store().updateCategory(cat, { cadence: 'monthly' });

    // The already-written weekly legs are untouched (their period math is frozen).
    const stillThere = (await store().evaluation.getCarryoverEntries({ categoryId: cat })).find(
      (e) => e.kind === 'borrow_repay',
    )!;
    expect(stillThere.weekStart).toBe(NEXT);

    // nextCycleStartState now reads the CURRENT (monthly) cadence: next cycle is
    // February, which the weekly repay (at 2026-01-12, not a month boundary) does
    // not touch — documented edge.
    const s = store().nextCycleStartState(cat, WEEK);
    expect(s.cycleStart).toBe('2026-02-01');
    expect(s.alreadyOwed).toBe(0);

    // A fresh borrow now writes monthly legs; the weekly pair remains alongside it.
    await store().borrowFromNextCycle(cat, WEEK, cents(2000));
    const entries = await store().evaluation.getCarryoverEntries({ categoryId: cat });
    const pairs = new Map<string, number[]>();
    for (const e of entries) {
      if (!e.pairId) continue;
      pairs.set(e.pairId, [...(pairs.get(e.pairId) ?? []), e.amount]);
    }
    // Two independent pairs, each internally equal (conservation per pair).
    expect(pairs.size).toBe(2);
    for (const legs of pairs.values()) {
      expect(legs).toHaveLength(2);
      expect(legs[0]).toBe(legs[1]);
    }
    const monthlyRepay = entries.find(
      (e) => e.kind === 'borrow_repay' && e.weekStart === '2026-02-01',
    );
    expect(monthlyRepay).toBeDefined();
  });

  it('sweep: leftover leaves envelope system and counts toward savings', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Fun', 10000);
    // Sweeps move real cash (v0.2): a spending source funds the transfer.
    const checking = await makeAccount('Checking', 100000, 'spending');
    const savings = await makeAccount('Savings', 0, 'savings');

    await store().sweepToSavings(cat, WEEK, savings);

    expect(store().getEnvelopeWeekState(cat, WEEK).remaining).toBe(0);
    const savingsTotal = await store().evaluation.getMonthSavingsTotal('2026-01');
    expect(savingsTotal).toBe(10000);
    // The cash actually moved (verifier finding #2 fixed):
    expect(store().getAccountBalance(savings, '2026-01-31')).toBe(10000);
    expect(store().getAccountBalance(checking, '2026-01-31')).toBe(90000);
  });
});

describe('getMonthSavingsTotal netting (v0.3 anti-inflation)', () => {
  it('savings -> savings shuffle adds ZERO to the metric', async () => {
    await freshChapter();
    await makeAccount('Checking', 100000, 'spending');
    const savA = await makeAccount('Savings A', 50000, 'savings');
    const savB = await makeAccount('Savings B', 0, 'savings');

    // Shuffling money between two savings accounts moves no new money into
    // savings — it must not count toward the Goal-3 savings metric.
    await store().transfer({ fromAccountId: savA, toAccountId: savB, amount: cents(30000), date: '2026-01-06' });

    expect(await store().evaluation.getMonthSavingsTotal('2026-01')).toBe(0);
  });

  it('checking -> savings still counts in full', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 100000, 'spending');
    const savings = await makeAccount('Savings', 0, 'savings');

    await store().transfer({ fromAccountId: checking, toAccountId: savings, amount: cents(40000), date: '2026-01-06' });

    expect(await store().evaluation.getMonthSavingsTotal('2026-01')).toBe(40000);
  });

  it('multi-savings setup nets: a spending deposit counts, a savings shuffle does not', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 100000, 'spending');
    const savA = await makeAccount('Savings A', 20000, 'savings');
    const savB = await makeAccount('Savings B', 0, 'savings');

    // Real deposit from spending: counts.
    await store().transfer({ fromAccountId: checking, toAccountId: savA, amount: cents(25000), date: '2026-01-06' });
    // Internal shuffle between the two savings accounts: nets to zero.
    await store().transfer({ fromAccountId: savA, toAccountId: savB, amount: cents(15000), date: '2026-01-07' });

    expect(await store().evaluation.getMonthSavingsTotal('2026-01')).toBe(25000);
  });

  it('sweep still counts (spending-funded transfer into savings)', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Fun', 10000);
    await makeAccount('Checking', 100000, 'spending');
    const savings = await makeAccount('Savings', 0, 'savings');

    await store().sweepToSavings(cat, WEEK, savings);
    // A later savings->savings shuffle must not add to the swept total.
    const savB = await makeAccount('Savings B', 0, 'savings');
    await store().transfer({ fromAccountId: savings, toAccountId: savB, amount: cents(5000), date: '2026-01-08' });

    expect(await store().evaluation.getMonthSavingsTotal('2026-01')).toBe(10000);
  });
});

describe('transfer atomicity', () => {
  it('a throw mid-transfer rolls back — both accounts unchanged', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const b = await makeAccount('B', 0);

    // Force a PK collision on the second leg by making all generated ids equal.
    const spy = jest.spyOn(ids, 'generateId').mockReturnValue('dup');
    await expect(
      store().transfer({ fromAccountId: a, toAccountId: b, amount: cents(5000), date: '2026-01-06' }),
    ).rejects.toThrow();
    spy.mockRestore();

    // Rolled back: no partial write on either side.
    expect(store().getAccountBalance(a, '2026-01-31')).toBe(100000);
    expect(store().getAccountBalance(b, '2026-01-31')).toBe(0);
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(0);
  });

  it('a successful transfer moves exactly the amount', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const b = await makeAccount('B', 0);
    await store().transfer({ fromAccountId: a, toAccountId: b, amount: cents(5000), date: '2026-01-06' });
    expect(store().getAccountBalance(a, '2026-01-31')).toBe(95000);
    expect(store().getAccountBalance(b, '2026-01-31')).toBe(5000);
  });
});

describe('allocate-based income split', () => {
  it('splits a total across accounts conserving every cent', async () => {
    await freshChapter();
    const a = await makeAccount('A', 0);
    const b = await makeAccount('B', 0);
    // 100.01 split evenly → allocate([1,1]) = [5001, 5000].
    const src = await store().createIncomeSource({
      name: 'Paycheck',
      amount: cents(10001),
      schedule: { kind: 'weekly', anchorDate: '2026-01-07' },
      splits: [
        { accountId: a, ratio: 1 },
        { accountId: b, ratio: 1 },
      ],
    });

    await store().addIncome({ sourceId: src.id, date: '2026-01-07' });

    const balA = store().getAccountBalance(a, '2026-01-31');
    const balB = store().getAccountBalance(b, '2026-01-31');
    expect(sumCents([balA, balB])).toBe(10001); // cents conserved
    expect(balA).toBe(5001);
    expect(balB).toBe(5000);

    const income = await store().evaluation.getMonthIncomeTotal('2026-01');
    expect(income).toBe(10001);
  });
});

describe('undo window', () => {
  it('undo within the window restores the transaction', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const cat = await makeWeeklyEnvelope('Food', 10000);
    const id = await store().addExpense({
      accountId: a,
      categoryId: cat,
      amount: cents(2500),
      date: '2026-01-06',
    });

    const { undo } = await store().deleteTransaction(id);
    // deleted → not in the live list
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(0);

    const ok = await undo();
    expect(ok).toBe(true);
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(1);
  });

  it('undo after UNDO_WINDOW_MS resolves false and stays deleted', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const cat = await makeWeeklyEnvelope('Food', 10000);
    const id = await store().addExpense({
      accountId: a,
      categoryId: cat,
      amount: cents(2500),
      date: '2026-01-06',
    });

    const { undo, expiresAt } = await store().deleteTransaction(id);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(expiresAt + UNDO_WINDOW_MS + 1);
    const ok = await undo();
    nowSpy.mockRestore();

    expect(ok).toBe(false);
    expect(store().getTransactions({ from: '2026-01-01', to: '2026-01-31' })).toHaveLength(0);
  });
});

describe('envelope cadence plumbing', () => {
  it('defaults to weekly when unspecified and round-trips a monthly cadence', async () => {
    await freshChapter();
    const weekly = await store().createCategory({
      name: 'Groceries',
      colorKey: 'amber',
      fixed: false,
      envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
    });
    expect(weekly.cadence).toBe('weekly');

    const monthly = await store().createCategory({
      name: 'Fun',
      colorKey: 'pink',
      fixed: false,
      cadence: 'monthly',
      envelope: { period: 'monthly', budget: cents(20000), carryoverDefault: 'ask' },
    });
    expect(monthly.cadence).toBe('monthly');

    // Cadence survives a reload from committed DB state.
    const reloaded = store().listCategories();
    expect(reloaded.find((c) => c.id === weekly.id)!.cadence).toBe('weekly');
    expect(reloaded.find((c) => c.id === monthly.id)!.cadence).toBe('monthly');
  });

  it('updateCategory changes cadence, and preserves it when the patch omits it', async () => {
    await freshChapter();
    const cat = await store().createCategory({
      name: 'Fun',
      colorKey: 'pink',
      fixed: false,
      cadence: 'monthly',
      envelope: { period: 'monthly', budget: cents(20000), carryoverDefault: 'ask' },
    });

    // A rename that doesn't mention cadence leaves it at monthly.
    await store().updateCategory(cat.id, { name: 'Fun Money' });
    expect(store().listCategories().find((c) => c.id === cat.id)!.cadence).toBe('monthly');

    // An explicit cadence change lands.
    await store().updateCategory(cat.id, { cadence: 'weekly' });
    expect(store().listCategories().find((c) => c.id === cat.id)!.cadence).toBe('weekly');
  });

  it('rejects an invalid cadence at the mutation boundary', async () => {
    await freshChapter();
    await expect(
      store().createCategory({
        name: 'Bad',
        colorKey: 'blue',
        fixed: false,
        cadence: 'daily' as never,
        envelope: { period: 'weekly', budget: cents(1000), carryoverDefault: 'ask' },
      }),
    ).rejects.toThrow(/cadence/i);

    const ok = await store().createCategory({
      name: 'Ok',
      colorKey: 'blue',
      fixed: false,
      envelope: { period: 'weekly', budget: cents(1000), carryoverDefault: 'ask' },
    });
    await expect(
      store().updateCategory(ok.id, { cadence: 'yearly' as never }),
    ).rejects.toThrow(/cadence/i);
  });
});

describe('EvaluationReadPort attribution (duck guard §5.4)', () => {
  it('cross-month borrow attributes both legs to the origin month', async () => {
    await freshChapter();
    // Week 2026-06-29 (Mon) straddles into July; next week is 2026-07-06.
    const cat = await makeWeeklyEnvelope('Gas', 10000);
    await store().borrowFromNextWeek(cat, '2026-06-29', cents(3000));

    const june = await store().evaluation.getCarryoverEntries({ month: '2026-06' });
    const july = await store().evaluation.getCarryoverEntries({ month: '2026-07' });
    // Origin month (June) owns BOTH legs — you can't borrow from Aug to save July.
    expect(june.map((e) => e.kind).sort()).toEqual(['borrow_in', 'borrow_repay']);
    expect(july).toHaveLength(0);
  });

  it('spend in a month-straddling week attributes to the week (origin) month', async () => {
    await freshChapter();
    const a = await makeAccount('A', 100000);
    const cat = await makeWeeklyEnvelope('Gas', 10000);
    // Expense dated July 2, but inside the budget week starting June 29.
    await store().addExpense({ accountId: a, categoryId: cat, amount: cents(5000), date: '2026-07-02' });

    const juneTotals = await store().evaluation.getMonthCategoryTotals('2026-06');
    const julyTotals = await store().evaluation.getMonthCategoryTotals('2026-07');
    expect(juneTotals.find((t) => t.categoryId === cat)!.spent).toBe(5000); // origin week's month
    expect(julyTotals.find((t) => t.categoryId === cat)!.spent).toBe(0); // NOT calendar month
  });
});
