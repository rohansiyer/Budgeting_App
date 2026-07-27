/**
 * Tests for the per-envelope drill-down ledger. Invariants:
 *  - running balance starts at the configured budget and ends EXACTLY on the
 *    envelope card's remaining (weekly: getEnvelopeWeekState; monthly: derived
 *    month remaining),
 *  - borrow legs pair across periods (borrow row in the origin period, repay
 *    row in the next),
 *  - cadence selects the window (weekly week vs monthly month),
 *  - a fresh envelope with no activity yields no rows and start === end.
 *
 * Runs against the real in-memory SQLite store via public mutations.
 */
import { useBudgetStore } from '../../store';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { cents } from '../../lib/money';
import { envelopeLedger, type EnvelopeLedger } from '../envelopeLedger';

const store = () => useBudgetStore.getState();

const WEEK = '2026-01-05'; // a Monday
const PREV = '2025-12-29';
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

/** The running balance must be a faithful accumulation ending on the card figure. */
function expectRunningExact(led: EnvelopeLedger) {
  let running: number = led.startingBalanceCents;
  for (const row of led.rows) {
    running += row.amountCents;
    expect(row.runningBalanceCents).toBe(running);
  }
  expect(running).toBe(led.endingBalanceCents);
}

describe('envelopeLedger — weekly cadence', () => {
  it('starts at budget, ends at the card remaining, rows in date order', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 50000);
    const food = await makeWeeklyEnvelope('Food', 10000);
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(2500), date: '2026-01-06', note: 'Groceries' });
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(1500), date: '2026-01-08', note: 'Lunch' });

    const led = envelopeLedger(food, WEEK);
    expect(led.cadence).toBe('weekly');
    expect(led.periodStartISO).toBe(WEEK);
    expect(led.startingBalanceCents).toBe(10000);
    expect(led.endingBalanceCents).toBe(store().getEnvelopeWeekState(food, WEEK).remaining);
    expect(led.endingBalanceCents).toBe(6000);

    expect(led.rows.map((r) => r.kind)).toEqual(['transaction', 'transaction']);
    expect(led.rows.map((r) => r.amountCents)).toEqual([-2500, -1500]);
    expect(led.rows.map((r) => r.runningBalanceCents)).toEqual([7500, 6000]);
    expectRunningExact(led);
  });

  it('normalizes a mid-week date to that week', async () => {
    await freshChapter();
    const food = await makeWeeklyEnvelope('Food', 10000);
    const led = envelopeLedger(food, '2026-01-08'); // Thursday in the WEEK
    expect(led.periodStartISO).toBe(WEEK);
  });

  it('a roll-in from last week shows as a carryover inflow', async () => {
    await freshChapter();
    const food = await makeWeeklyEnvelope('Food', 10000);
    await store().rollForward(food, PREV); // PREV full budget rolls into WEEK

    const led = envelopeLedger(food, WEEK);
    const carry = led.rows.find((r) => r.kind === 'carryover');
    expect(carry).toBeDefined();
    expect(carry!.amountCents).toBe(10000);
    expect(carry!.label).toBe('Rolled in from last week');
    expect(led.endingBalanceCents).toBe(store().getEnvelopeWeekState(food, WEEK).remaining);
    expectRunningExact(led);
  });

  it('only includes its own week (cadence window)', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 50000);
    const food = await makeWeeklyEnvelope('Food', 10000);
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(2500), date: '2026-01-06' }); // in WEEK
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(4000), date: '2026-01-13' }); // in NEXT

    const led = envelopeLedger(food, WEEK);
    expect(led.rows).toHaveLength(1);
    expect(led.rows[0].dateISO).toBe('2026-01-06');

    const ledNext = envelopeLedger(food, NEXT);
    expect(ledNext.rows).toHaveLength(1);
    expect(ledNext.rows[0].dateISO).toBe('2026-01-13');
  });

  it('empty envelope: no rows, start equals end equals budget', async () => {
    await freshChapter();
    const food = await makeWeeklyEnvelope('Food', 10000);
    const led = envelopeLedger(food, WEEK);
    expect(led.rows).toEqual([]);
    expect(led.startingBalanceCents).toBe(10000);
    expect(led.endingBalanceCents).toBe(10000);
  });
});

describe('envelopeLedger — borrow pairing', () => {
  it('borrow shows in the origin week, repay in the next week', async () => {
    await freshChapter();
    const gas = await makeWeeklyEnvelope('Gas', 10000);
    await store().borrowFromNextWeek(gas, WEEK, cents(3000));

    const origin = envelopeLedger(gas, WEEK);
    const borrow = origin.rows.find((r) => r.kind === 'borrow');
    expect(borrow).toBeDefined();
    expect(borrow!.amountCents).toBe(3000);
    expect(origin.endingBalanceCents).toBe(13000);
    expectRunningExact(origin);

    const next = envelopeLedger(gas, NEXT);
    const repay = next.rows.find((r) => r.kind === 'repay');
    expect(repay).toBeDefined();
    expect(repay!.amountCents).toBe(-3000);
    expect(next.endingBalanceCents).toBe(7000);
    expectRunningExact(next);

    // Conservation: what one period gained, the other owes back.
    expect(borrow!.amountCents).toBe(-repay!.amountCents);
  });
});

describe('envelopeLedger — monthly cadence', () => {
  it('windows the whole month, ends at the derived month remaining, sees a monthly borrow', async () => {
    await freshChapter();
    const checking = await makeAccount('Checking', 100000);
    const fun = await makeMonthlyEnvelope('Fun', 40000);
    await store().addExpense({ accountId: checking, categoryId: fun, amount: cents(6000), date: '2026-01-08' });
    await store().addExpense({ accountId: checking, categoryId: fun, amount: cents(4000), date: '2026-01-20' });
    // Monthly-cadence borrow (from next month), via the reworked cycle API.
    await store().borrowFromNextCycle(fun, '2026-01-15', cents(5000));

    const led = envelopeLedger(fun, '2026-01-15');
    expect(led.cadence).toBe('monthly');
    expect(led.startingBalanceCents).toBe(40000); // configured monthly budget

    // planned 40000 + borrowed 5000 − spent 10000 = 35000
    expect(led.endingBalanceCents).toBe(35000);
    expectRunningExact(led);

    expect(led.rows.filter((r) => r.kind === 'transaction')).toHaveLength(2);
    const borrow = led.rows.find((r) => r.kind === 'borrow');
    expect(borrow).toBeDefined();
    expect(borrow!.amountCents).toBe(5000);
  });

  it('empty monthly envelope: no rows, ends at full budget', async () => {
    await freshChapter();
    const fun = await makeMonthlyEnvelope('Fun', 40000);
    const led = envelopeLedger(fun, '2026-01-15');
    expect(led.rows).toEqual([]);
    expect(led.startingBalanceCents).toBe(40000);
    expect(led.endingBalanceCents).toBe(40000);
  });
});
