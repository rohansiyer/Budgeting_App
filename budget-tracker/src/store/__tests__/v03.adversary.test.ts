/**
 * TASK C6 — v0.3 money-core ADVERSARY (Opus).
 *
 * Attacks the v0.3 additions on top of the real in-memory SQLite store:
 *   1. conservation under chaos (interleaved expenses, weekly + monthly borrows,
 *      cadence switches, rolls, sweeps, deletions) with a global pair-invariant
 *      machine (every non-null pairId always has exactly 2 equal-amount legs);
 *   2. duck-guard integrity across month boundaries + a farm attempt;
 *   3. starter-duck exploits (drive to zero, reseed attempts, app-restart, new
 *      chapter);
 *   4. pay-period recap engine over the REAL store paydays (boundary paydays,
 *      duplicated paydays, retroactive schedule edits, monotonic acks);
 *   5. ledger-vs-store reconciliation as an invariant asserted after EVERY
 *      mutation of a scripted month.
 *
 * Tests-only task: no production source is edited. Any confirmed defect is filed
 * as a `test.skip` repro tagged "DEFECT:" and surfaced in the task concerns.
 */
import { useBudgetStore } from '../index';
import { initDatabase, resetDatabaseForTests, getRawDb } from '../../db/client';
import { cents, sumCents, type Cents } from '../../lib/money';
import { createDuckEngine } from '../../ducks/engine';
import {
  createPayPeriodRecapEngine,
  InMemoryRecapAckStore,
} from '../../ducks/recap';
import { safeToSpendBreakdown, envelopeLedger } from '../../ledger';
import type { DateRange, IncomeSchedule } from '../../types/contracts';
import * as ids from '../../lib/ids';

const store = () => useBudgetStore.getState();

async function freshChapter(startedAt = '2026-01-01') {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  return store().createChapter({ name: 'Test', startedAt });
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
    name, colorKey: 'blue', fixed: false, cadence: 'monthly',
    envelope: { period: 'monthly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}

// Consecutive Mondays. 2026-01-05 is a Monday.
const W = (i: number): string => {
  const base = new Date(2026, 0, 5);
  base.setDate(base.getDate() + i * 7);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Σ (remaining + spent) across weeks — the in-envelope budget still present. */
function systemBudget(cat: string, weeks: string[]): number {
  return weeks.reduce((acc, wk) => {
    const s = store().getEnvelopeWeekState(cat, wk);
    return acc + s.remaining + s.spent;
  }, 0);
}

/**
 * GLOBAL PAIR INVARIANT: every non-null pairId in the whole carryover ledger
 * has exactly two legs of equal amount. Roll pairs (roll_out/roll_in) and
 * borrow pairs (borrow_in/borrow_repay) both carry a pairId; sweeps carry none.
 */
async function assertPairInvariant(): Promise<void> {
  const entries = await store().evaluation.getCarryoverEntries({});
  const byPair = new Map<string, number[]>();
  for (const e of entries) {
    if (!e.pairId) continue;
    byPair.set(e.pairId, [...(byPair.get(e.pairId) ?? []), e.amount]);
  }
  for (const [pairId, legs] of byPair) {
    expect({ pairId, count: legs.length }).toEqual({ pairId, count: 2 });
    expect(legs[0]).toBe(legs[1]);
  }
}

// ===========================================================================
// 1. CONSERVATION UNDER CHAOS
// ===========================================================================
describe('conservation under chaos', () => {
  it('interleaved expenses, borrows, rolls, sweeps and deletions conserve budget; pair invariant holds at every step', async () => {
    await freshChapter();
    const chk = await makeAccount('Chk', 10_000_00, 'spending');
    const sav = await makeAccount('Sav', 0, 'savings');
    const cat = await weeklyEnv('Food', 10000);
    // Window W0..W6; every roll/borrow destination stays inside it.
    const weeks = [W(0), W(1), W(2), W(3), W(4), W(5), W(6)];
    let swept = 0;

    const step = async (fn: () => Promise<unknown>) => {
      await fn();
      await assertPairInvariant();
      // Budget present = configured×weeks − everything swept out to savings.
      expect(systemBudget(cat, weeks)).toBe(10000 * weeks.length - swept);
    };

    await step(() => store().addExpense({ accountId: chk, categoryId: cat, amount: cents(2500), date: W(0) }));
    await step(() => store().rollForward(cat, W(0)));                       // roll 7500 W0->W1
    await step(() => store().borrowFromNextWeek(cat, W(1), cents(30000)));  // huge borrow (uncapped) W2->W1
    await step(() => store().addExpense({ accountId: chk, categoryId: cat, amount: cents(4000), date: W(1) }));
    await step(() => store().borrowFromNextWeek(cat, W(2), cents(1)));      // penny borrow W3->W2
    // Sweep W4's leftover (full 10000, nothing spent) to savings.
    swept += 10000;
    await step(() => store().sweepToSavings(cat, W(4), sav));
    await step(() => store().addExpense({ accountId: chk, categoryId: cat, amount: cents(9999), date: W(3) }));
    await step(() => store().rollForward(cat, W(5)));                       // roll W5 (10000) -> W6

    // Delete one expense (undo-style): budget returns to its envelope, still conserved.
    const rows = getRawDb().getAllSync<{ id: string }>(
      `SELECT id FROM transactions WHERE kind='expense' AND amount=4000`,
    );
    await step(() => store().deleteTransaction(rows[0].id));

    // Cash side: the sweep at W(4) (2026-02-02) moved 10000 checking->savings as
    // a real transfer, so it lands in FEBRUARY, not January.
    expect(await store().evaluation.getMonthSavingsTotal('2026-01')).toBe(0);
    expect(await store().evaluation.getMonthSavingsTotal('2026-02')).toBe(10000);
    expect(store().getAccountBalance(sav, '2026-02-28')).toBe(10000);
  });

  it('monthly + weekly borrows coexist; every pair stays balanced and origin-attributed', async () => {
    await freshChapter();
    const weekly = await weeklyEnv('Gas', 8000);
    const monthly = await monthlyEnv('Fun', 20000);
    await store().borrowFromNextWeek(weekly, W(0), cents(5000));
    await store().borrowFromNextCycle(monthly, '2026-01-20', cents(50000)); // uncapped, 250% of monthly
    await store().borrowFromNextCycle(monthly, '2026-01-25', cents(3000));  // stacked second monthly borrow
    await assertPairInvariant();

    // Both monthly pairs attribute to Jan (origin); Feb carries none.
    const jan = await store().evaluation.getCarryoverEntries({ month: '2026-01' });
    const feb = await store().evaluation.getCarryoverEntries({ month: '2026-02' });
    const monthlyJan = jan.filter((e) => e.categoryId === monthly);
    expect(monthlyJan.map((e) => e.kind).sort()).toEqual(
      ['borrow_in', 'borrow_in', 'borrow_repay', 'borrow_repay'],
    );
    expect(feb.filter((e) => e.categoryId === monthly)).toHaveLength(0);
  });
});

// ===========================================================================
// 2. nextCycleStartState — stacked-borrow honesty (weekly + monthly)
// ===========================================================================
describe('nextCycleStartState honesty', () => {
  it('weekly stacked borrows accumulate alreadyOwed and drive startsWith honestly negative', async () => {
    await freshChapter();
    const cat = await weeklyEnv('Gas', 10000);
    await store().borrowFromNextWeek(cat, W(0), cents(6000));
    await store().borrowFromNextWeek(cat, W(0), cents(7000)); // second borrow, same origin week
    const next = store().nextCycleStartState(cat, W(0));
    expect(next.cycleStart).toBe(W(1));
    expect(next.budget).toBe(10000);
    expect(next.alreadyOwed).toBe(13000);      // both repay legs sit in W1
    expect(next.startsWith).toBe(10000 - 13000); // -3000, no clamping
  });

  it('monthly stacked borrows: next month begins owing both repays', async () => {
    await freshChapter();
    const cat = await monthlyEnv('Fun', 20000);
    await store().borrowFromNextCycle(cat, '2026-03-10', cents(15000));
    await store().borrowFromNextCycle(cat, '2026-03-28', cents(9000));
    const next = store().nextCycleStartState(cat, '2026-03-10');
    expect(next.cycleStart).toBe('2026-04-01');
    expect(next.budget).toBe(20000);
    expect(next.alreadyOwed).toBe(24000);
    expect(next.startsWith).toBe(20000 - 24000); // -4000
  });
});

// ===========================================================================
// 3. STARTER-DUCK EXPLOITS
// ===========================================================================
describe('starter-duck invariant', () => {
  function engineFor() {
    return createDuckEngine({
      read: store().evaluation,
      store: store().duckPersistence,
      getActiveChapter: () => store().getActiveChapter(),
      generateId: ids.generateId,
      categoryName: (id) => store().listCategories().find((c) => c.id === id)?.name ?? id,
    });
  }

  it('a flock driven to zero by 0/3 months is NEVER reseeded — not by getFlock, evaluate, or an app restart', async () => {
    await freshChapter('2026-01-01');
    // Every full month scores 0/3: unpaid fixed bill (goal 1), an overspent
    // envelope (goal 2), and income with no savings (goal 3).
    const chk = await makeAccount('Chk', 1000000, 'spending');
    await store().createCategory({ name: 'Rent', colorKey: 'violet', fixed: true, envelope: null });
    const food = await weeklyEnv('Food', 5000);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(100000),
      schedule: { kind: 'monthly', anchorDate: '2026-01-10' },
      splits: [{ accountId: chk, ratio: 1 }],
    });
    // Income + an envelope overspend in Jan and Feb so both are non-dormant 0/3 months.
    await store().addIncome({ sourceId: src.id, date: '2026-01-10' });
    await store().addIncome({ sourceId: src.id, date: '2026-02-10' });
    await store().addExpense({ accountId: chk, categoryId: food, amount: cents(50000), date: '2026-01-10' });
    await store().addExpense({ accountId: chk, categoryId: food, amount: cents(50000), date: '2026-02-10' });

    const engine = engineFor();
    // Starter present on day one.
    expect((await engine.getFlock()).ducks).toHaveLength(1);

    // Evaluate Jan + Feb (both 0/3). Starter lost in Jan -> 0; Feb stays 0.
    const issued = await engine.evaluatePendingMonths('2026-03-01');
    expect(issued.map((e) => e.outcome)).toEqual(['lose', 'lose']);
    expect(issued[issued.length - 1].duckCountAfter).toBe(0);

    // getFlock must NOT hand back a fresh starter (evaluations exist).
    expect((await engine.getFlock()).ducks).toHaveLength(0);
    // Re-evaluating mints nothing and does not reseed.
    expect(await engine.evaluatePendingMonths('2026-03-01')).toHaveLength(0);
    expect((await engine.getFlock()).ducks).toHaveLength(0);
    // App-restart simulation: a brand-new engine over the same committed store.
    const restarted = engineFor();
    expect((await restarted.getFlock()).ducks).toHaveLength(0);
    expect(await restarted.evaluatePendingMonths('2026-03-01')).toHaveLength(0);
    expect((await restarted.getFlock()).ducks).toHaveLength(0);
  });

  it('a new chapter gets exactly one starter, independent of the archived chapter emptied to zero', async () => {
    await freshChapter('2026-01-01');
    const chk = await makeAccount('Chk', 1000000, 'spending');
    await store().createCategory({ name: 'Rent', colorKey: 'violet', fixed: true, envelope: null });
    const food = await weeklyEnv('Food', 5000);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(100000),
      schedule: { kind: 'monthly', anchorDate: '2026-01-10' },
      splits: [{ accountId: chk, ratio: 1 }],
    });
    await store().addIncome({ sourceId: src.id, date: '2026-01-10' });
    await store().addExpense({ accountId: chk, categoryId: food, amount: cents(50000), date: '2026-01-10' });
    const e1 = engineFor();
    await e1.evaluatePendingMonths('2026-02-01'); // Jan 0/3 -> lose starter -> 0
    expect((await e1.getFlock()).ducks).toHaveLength(0);

    // Archive it, open a new chapter, and confirm its pond starts at exactly 1.
    const old = store().getActiveChapter();
    await store().archiveChapter(old.id, '2026-06-30');
    const fresh = await store().createChapter({ name: 'Chapter 2', startedAt: '2026-07-01' });
    expect(store().getActiveChapter().id).toBe(fresh.id);
    const e2 = engineFor();
    const flock = await e2.getFlock();
    expect(flock.ducks).toHaveLength(1);
    expect(flock.ducks[0].earnedMonth).toBe('2026-07'); // seeded to the new chapter start
  });

  it('farm attempt: overspending a monthly envelope and "covering" it with a next-month borrow does NOT earn the origin month a duck', async () => {
    await freshChapter('2026-07-01');
    const chk = await makeAccount('Chk', 0, 'spending');
    const sav = await makeAccount('Sav', 0, 'savings');
    const fun = await monthlyEnv('Fun', 20000);
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(100000),
      schedule: { kind: 'monthly', anchorDate: '2026-07-10' },
      splits: [{ accountId: chk, ratio: 1 }],
    });
    await store().addIncome({ sourceId: src.id, date: '2026-07-10' });
    // Save 30% so goal 3 alone would pass.
    await store().transfer({ fromAccountId: chk, toAccountId: sav, amount: cents(30000), date: '2026-07-11' });
    // Overspend Fun (budget 20000, spend 50000) and borrow 40000 from August to "cover" the cash.
    await store().borrowFromNextCycle(fun, '2026-07-15', cents(40000));
    await store().addExpense({ accountId: chk, categoryId: fun, amount: cents(50000), date: '2026-07-15' });

    const engine = engineFor();
    const [verdict] = await engine.evaluatePendingMonths('2026-08-01');
    expect(verdict.month).toBe('2026-07');
    // Goal 2 fails on the un-inflated basis (spent 50000 > budget 20000).
    expect(verdict.goalVariableBudgets.met).toBe(false);
    expect(verdict.outcome).not.toBe('gain');
  });
});

// ===========================================================================
// 4. PAY-PERIOD RECAP ENGINE over the REAL store paydays
// ===========================================================================
describe('pay-period recap over real store paydays', () => {
  function recapEngineFor() {
    const ack = new InMemoryRecapAckStore();
    const engine = createPayPeriodRecapEngine({
      getPaydays: (range: DateRange) => store().getPaydays(range),
      getActiveChapter: () => store().getActiveChapter(),
      ack,
    });
    return { engine, ack };
  }
  async function setSchedule(schedule: IncomeSchedule) {
    await store().createIncomeSource({ name: 'Pay', amount: cents(100000), schedule, splits: [] });
  }

  it('paydays landing ON month boundaries: each close is a month_end recap carrying the opening month, no skip/dupe', async () => {
    await freshChapter('2026-01-01');
    await makeAccount('Chk', 0);
    await setSchedule({ kind: 'monthly', anchorDate: '2026-01-01' }); // pays on the 1st
    const { engine } = recapEngineFor();
    const pending = await engine.getPendingRecaps('2026-04-01');
    // Paydays Jan1,Feb1,Mar1,Apr1 -> closes Feb1,Mar1,Apr1, all month_end.
    expect(pending.map((p) => p.closedOn)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
    expect(pending.every((p) => p.kind === 'month_end')).toBe(true);
    expect(pending.map((p) => p.verdictMonth)).toEqual(['2026-01', '2026-02', '2026-03']);
    // Uniqueness: no closedOn appears twice.
    expect(new Set(pending.map((p) => p.closedOn)).size).toBe(pending.length);
  });

  it('two income sources whose paydays collide dedupe to one boundary (no double recap)', async () => {
    await freshChapter('2026-01-01');
    await makeAccount('Chk', 0);
    // Two sources both paying on the 1st and 15th — overlapping dates must dedupe.
    await setSchedule({ kind: 'semimonthly', anchorDate: '2026-01-01', semimonthlyDays: [1, 15] });
    await setSchedule({ kind: 'monthly', anchorDate: '2026-01-15' });
    const paydays = store().getPaydays({ from: '2026-01-01', to: '2026-02-28' });
    // Jan 15 and Feb 15 appear in BOTH sources but only once in the union.
    expect(paydays.filter((d) => d === '2026-01-15')).toHaveLength(1);
    const { engine } = recapEngineFor();
    const pending = await engine.getPendingRecaps('2026-02-28');
    expect(new Set(pending.map((p) => p.closedOn)).size).toBe(pending.length);
  });

  it('acknowledge is monotonic and idempotent under a retroactive schedule edit; no close is ever handed out twice', async () => {
    const chapter = await freshChapter('2026-01-01');
    await makeAccount('Chk', 0);
    await setSchedule({ kind: 'biweekly', anchorDate: '2026-01-02' });
    const { engine, ack } = recapEngineFor();

    const first = await engine.getPendingRecaps('2026-03-01');
    const seen = new Set(first.map((p) => p.closedOn));
    await engine.acknowledgePending('2026-03-01');
    const acked = await ack.getLastAcknowledged(chapter.id);
    expect(acked).toBe(first[first.length - 1].closedOn);
    expect(await engine.getPendingRecaps('2026-03-01')).toHaveLength(0);

    // Retroactively densify the schedule (add a weekly source). Recompute.
    await setSchedule({ kind: 'weekly', anchorDate: '2026-01-02' });
    const afterEdit = await engine.getPendingRecaps('2026-03-01');
    // Monotonic ack holds: nothing at-or-before the acked boundary resurfaces.
    for (const p of afterEdit) expect(p.closedOn > (acked as string)).toBe(true);
    // A stale/older acknowledge never rewinds the pointer.
    await engine.acknowledge('2026-01-16');
    expect(await ack.getLastAcknowledged(chapter.id)).toBe(acked);
    // No close from the first surface is re-emitted after acking it.
    for (const p of afterEdit) expect(seen.has(p.closedOn)).toBe(false);
  });
});

// ===========================================================================
// 5. LEDGER-vs-STORE RECONCILIATION as an invariant machine
// ===========================================================================
describe('ledger reconciliation invariant machine', () => {
  it('after EVERY mutation of a scripted month, safeToSpend and each envelope ledger reconcile exactly', async () => {
    await freshChapter('2026-01-01');
    const chk = await makeAccount('Chk', 500000, 'spending');
    const sav = await makeAccount('Sav', 0, 'savings');
    const food = await weeklyEnv('Food', 12000);
    const fun = await weeklyEnv('Fun', 6000);
    const cats = [food, fun];
    const checkWeeks = [W(0), W(1), W(2)];

    const reconcile = async () => {
      for (const wk of checkWeeks) {
        // (a) safe-to-spend breakdown sums to the store figure for the same week.
        const bd = safeToSpendBreakdown(wk);
        const sum = bd.lines.reduce((s, l) => s + (l.direction === 'in' ? l.amountCents : -l.amountCents), 0);
        expect(sum).toBe(bd.totalCents);
        expect(bd.totalCents).toBe(store().getSafeToSpend(wk));
        // (b) each envelope ledger's running balance ends on the card remaining.
        for (const cat of cats) {
          const led = envelopeLedger(cat, wk);
          const remaining = store().getEnvelopeWeekState(cat, wk).remaining;
          const runningEnd = led.rows.length > 0
            ? led.rows[led.rows.length - 1].runningBalanceCents
            : led.startingBalanceCents;
          expect(led.endingBalanceCents).toBe(remaining);
          expect(runningEnd).toBe(led.endingBalanceCents);
        }
      }
    };

    await reconcile();
    const steps: Array<() => Promise<unknown>> = [
      () => store().addExpense({ accountId: chk, categoryId: food, amount: cents(3400), date: W(0) }),
      () => store().addExpense({ accountId: chk, categoryId: fun, amount: cents(1200), date: W(0) }),
      () => store().borrowFromNextWeek(food, W(0), cents(8000)),
      () => store().rollForward(fun, W(0)),
      () => store().addExpense({ accountId: chk, categoryId: food, amount: cents(5000), date: W(1) }),
      () => store().sweepToSavings(fun, W(1), sav),
      () => store().addExpense({ accountId: chk, categoryId: food, amount: cents(20000), date: W(2) }), // negative week
      () => store().borrowFromNextWeek(fun, W(2), cents(3000)),
    ];
    for (const s of steps) {
      await s();
      await reconcile();
    }
  });
});
