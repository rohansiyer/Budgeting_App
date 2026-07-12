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

  it('borrow cap: rejects > 50% of next week budget', async () => {
    await freshChapter();
    const cat = await makeWeeklyEnvelope('Gas', 10000); // cap = 5000

    await expect(store().borrowFromNextWeek(cat, WEEK, cents(6000))).rejects.toThrow(/cap/);
    // At-cap allowed, then any further borrow rejected.
    await store().borrowFromNextWeek(cat, WEEK, cents(5000));
    await expect(store().borrowFromNextWeek(cat, WEEK, cents(1))).rejects.toThrow(/cap/);
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
