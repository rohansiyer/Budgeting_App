/**
 * Reconciliation tests for the safe-to-spend breakdown. The load-bearing
 * invariant: the decomposed lines PROVABLY sum to the exact figure the store
 * (and therefore HomeScreen) reports from getSafeToSpend, across every seeded
 * scenario — payday week, no-payday week, borrow-active week, negative week —
 * and the empty case yields empty lines with a zero total.
 *
 * Runs against the real in-memory SQLite store via public mutations, mirroring
 * src/store/__tests__/money-path.test.ts.
 */
import { useBudgetStore } from '../../store';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { cents, type Cents } from '../../lib/money';
import { safeToSpendBreakdown, type SafeToSpendBreakdown } from '../safeToSpend';

const store = () => useBudgetStore.getState();

const WEEK = '2026-01-05'; // a Monday
const PREV = '2025-12-29'; // the Monday before
const NEXT = '2026-01-12';

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
    openedOn: '2025-12-01',
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

/** The two properties every breakdown must hold, for any week. */
function expectReconciled(bd: SafeToSpendBreakdown, week: string) {
  // 1. lines sum to the reported total …
  let sum = 0;
  for (const l of bd.lines) {
    expect(l.amountCents).not.toBe(0); // no zero lines
    expect(l.amountCents).toBeGreaterThan(0); // magnitude only; sign is `direction`
    sum += l.direction === 'in' ? l.amountCents : -l.amountCents;
  }
  expect(sum).toBe(bd.totalCents);
  // 2. … and the total is exactly what the store/Home hero displays.
  expect(bd.totalCents).toBe(store().getSafeToSpend(week));
}

describe('safeToSpendBreakdown reconciliation', () => {
  it('payday week: income lands but the total still equals getSafeToSpend', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 0);
    const food = await makeWeeklyEnvelope('Food', 10000);
    const fun = await makeWeeklyEnvelope('Fun', 6000);

    // A paycheck lands this week — it does NOT enter envelope-based safe-to-spend.
    const src = await store().createIncomeSource({
      name: 'Paycheck',
      amount: cents(64000),
      schedule: { kind: 'weekly', anchorDate: WEEK },
      splits: [{ accountId: checking, ratio: 1 }],
    });
    await store().addIncome({ sourceId: src.id, date: WEEK });
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(3340), date: '2026-01-06' });
    await store().addExpense({ accountId: checking, categoryId: fun, amount: cents(1200), date: '2026-01-07' });

    const bd = safeToSpendBreakdown(WEEK);
    expectReconciled(bd, WEEK);
    // funded (16000) − spent (4540) = 11460
    expect(bd.totalCents).toBe(11460);
    expect(bd.lines.find((l) => l.label === 'Envelopes funded')?.amountCents).toBe(16000);
    expect(bd.lines.find((l) => l.label === 'Spent so far this week')?.amountCents).toBe(4540);
    // No paycheck line exists — the total contains no paycheck term.
    expect(bd.lines.some((l) => /paycheck/i.test(l.label))).toBe(false);
  });

  it('no-payday week: budget minus spend', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 50000);
    const food = await makeWeeklyEnvelope('Food', 10000);
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(2500), date: '2026-01-06' });

    const bd = safeToSpendBreakdown(WEEK);
    expectReconciled(bd, WEEK);
    expect(bd.totalCents).toBe(7500);
  });

  it('borrow-active week: borrowed-in raises the total and appears as a line', async () => {
    await freshChapter();
    await makeAccount('Checking', 50000);
    const gas = await makeWeeklyEnvelope('Gas', 10000);
    await store().borrowFromNextWeek(gas, WEEK, cents(4000));

    const bd = safeToSpendBreakdown(WEEK);
    expectReconciled(bd, WEEK);
    // funded 10000 + borrowed 4000 = 14000 this week
    expect(bd.totalCents).toBe(14000);
    expect(bd.lines.find((l) => l.label === 'Borrowed from next week')).toEqual({
      label: 'Borrowed from next week',
      amountCents: 4000,
      direction: 'in',
    });

    // Next week starts lower by the repay — still reconciles.
    const bdNext = safeToSpendBreakdown(NEXT);
    expectReconciled(bdNext, NEXT);
    expect(bdNext.totalCents).toBe(6000);
    expect(bdNext.lines.find((l) => l.label === "Repaying last week's borrow")).toEqual({
      label: "Repaying last week's borrow",
      amountCents: 4000,
      direction: 'out',
    });
  });

  it('negative week: overspend drives the total below zero and still reconciles', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 50000);
    const food = await makeWeeklyEnvelope('Food', 5000);
    // Spend past budget across the whole envelope set.
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(8000), date: '2026-01-08' });

    const bd = safeToSpendBreakdown(WEEK);
    expectReconciled(bd, WEEK);
    expect(bd.totalCents).toBe(-3000);
    expect(bd.totalCents).toBeLessThan(0);
  });

  it('carryover in and out both surface as reconciling lines', async () => {
    await freshChapter();
    const savings = await makeAccount('Savings', 0, 'savings');
    await makeAccount('Checking', 50000);
    const food = await makeWeeklyEnvelope('Food', 10000);
    const fun = await makeWeeklyEnvelope('Fun', 8000);

    // Roll last week's full Food budget into THIS week (roll_in at WEEK).
    await store().rollForward(food, PREV);
    // Roll THIS week's Fun leftover forward (roll_out at WEEK).
    await store().rollForward(fun, WEEK);

    const bd = safeToSpendBreakdown(WEEK);
    expectReconciled(bd, WEEK);
    expect(bd.lines.find((l) => l.label === 'Rolled in from last week')?.amountCents).toBe(10000);
    expect(bd.lines.find((l) => l.label === 'Rolled forward to next week')?.direction).toBe('out');

    // A sweep also surfaces as an out line and keeps reconciling.
    const gas = await makeWeeklyEnvelope('Gas', 3000);
    await store().sweepToSavings(gas, WEEK, savings);
    const bd2 = safeToSpendBreakdown(WEEK);
    expectReconciled(bd2, WEEK);
    expect(bd2.lines.find((l) => l.label === 'Swept to savings')?.amountCents).toBe(3000);
  });

  it('empty: no enveloped categories yields empty lines and a zero total', async () => {
    await freshChapter();
    await makeAccount('Checking', 50000);
    const bd = safeToSpendBreakdown(WEEK);
    expect(bd.lines).toEqual([]);
    expect(bd.totalCents).toBe(0);
    expect(bd.totalCents).toBe(store().getSafeToSpend(WEEK));
  });
});
