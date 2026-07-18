/**
 * Projection math (handoff §3.9, §3.10).
 *
 * PURE tests exercise the step math exact-to-the-cent — including bills that
 * land across a month boundary with Feb clamp-to-month-end — and the
 * funding-date cases (never-funded, already-funded, normal pace).
 *
 * INTEGRATION tests run the store-facing projectSavings / projectGoalFunding
 * against the real in-memory SQLite store, mirroring the ledger suites.
 */
import { useBudgetStore } from '../../store';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { cents, type Cents } from '../../lib/money';
import {
  billsDueInWeek,
  fundingDate,
  projectGoalFunding,
  projectSavings,
  stepSavings,
  weeklyFromMonthly,
  type BillLite,
} from '../project';

const C = (n: number): Cents => cents(n);
const store = () => useBudgetStore.getState();

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------
describe('weeklyFromMonthly', () => {
  it('is floor(monthly * 12 / 52), integer and conservative', () => {
    expect(weeklyFromMonthly(C(0))).toBe(0);
    expect(weeklyFromMonthly(C(52000))).toBe(12000); // exact
    expect(weeklyFromMonthly(C(40000))).toBe(9230); // floor(480000/52)=9230.7
    expect(weeklyFromMonthly(C(20000))).toBe(4615); // floor(240000/52)=4615.3
  });
});

describe('billsDueInWeek', () => {
  const bill = (amount: number, dueDay: number, active = true): BillLite => ({
    amountCents: C(amount),
    dueDay,
    active,
  });

  it('counts a bill whose due date lands inside the Mon..Sun week', () => {
    // Week 2026-01-26 .. 2026-02-01; a bill due on the 31st lands 2026-01-31.
    expect(billsDueInWeek([bill(5000, 31)], '2026-01-26')).toBe(5000);
  });

  it('does not count a bill due outside the week', () => {
    expect(billsDueInWeek([bill(5000, 15)], '2026-01-26')).toBe(0);
  });

  it('clamps to month end: dueDay 31 in February lands on the 28th', () => {
    // Week 2026-02-23 .. 2026-03-01 contains 2026-02-28 (clamped from 31).
    expect(billsDueInWeek([bill(5000, 31)], '2026-02-23')).toBe(5000);
    // A week that does not contain the 28th gets nothing.
    expect(billsDueInWeek([bill(5000, 31)], '2026-02-09')).toBe(0);
  });

  it('a month-straddling week can catch two different bills, each once', () => {
    // Week 2026-01-26 .. 2026-02-01: dueDay 31 -> Jan 31; dueDay 1 -> Feb 1.
    expect(billsDueInWeek([bill(5000, 31), bill(3000, 1)], '2026-01-26')).toBe(8000);
  });

  it('ignores inactive bills', () => {
    expect(billsDueInWeek([bill(5000, 31, false)], '2026-01-26')).toBe(0);
  });
});

describe('stepSavings', () => {
  it('weeks 0 => a single current-balance point', () => {
    const pts = stepSavings({
      startCents: C(10000),
      weeks: 0,
      weeklyIncomeCents: C(9000),
      weeklySpendCents: C(4000),
      bills: [],
      anchorWeekStart: '2026-01-05',
    });
    expect(pts).toEqual([{ weekStartISO: '2026-01-05', projectedCents: 10000 }]);
  });

  it('steps to the cent across a month boundary with bills landing', () => {
    // net before bills = 10000 - 4000 = 6000 per week.
    // bills: 5000 due 31 (Jan 31 -> week3; Feb 28 -> week7),
    //        3000 due 1  (Feb 1 -> week3; Mar 1 -> week7).
    const bills: BillLite[] = [
      { amountCents: C(5000), dueDay: 31, active: true },
      { amountCents: C(3000), dueDay: 1, active: true },
    ];
    const pts = stepSavings({
      startCents: C(0),
      weeks: 8,
      weeklyIncomeCents: C(10000),
      weeklySpendCents: C(4000),
      bills,
      anchorWeekStart: '2026-01-05', // a Monday
    });
    expect(pts.map((p) => p.weekStartISO)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26', // week3: both bills (8000 out) -> +6000-8000 = -2000
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23', // week7: both bills again (8000 out)
      '2026-03-02',
    ]);
    expect(pts.map((p) => p.projectedCents)).toEqual([
      0, // now
      6000, // wk1: +6000
      12000, // wk2: +6000
      10000, // wk3: +6000 - 8000
      16000, // wk4: +6000
      22000, // wk5: +6000
      28000, // wk6: +6000
      26000, // wk7: +6000 - 8000
      32000, // wk8: +6000
    ]);
  });
});

describe('fundingDate', () => {
  it('null pace (no history) => null date and null pace', () => {
    expect(
      fundingDate({ currentCents: C(0), targetCents: C(1000), weeklyPaceCents: null, today: '2026-01-15' }),
    ).toEqual({ fundedAroundISO: null, weeklyPaceCents: null });
  });

  it('already at/over target => funded as of today', () => {
    expect(
      fundingDate({ currentCents: C(120000), targetCents: C(120000), weeklyPaceCents: C(3000), today: '2026-01-15' }),
    ).toEqual({ fundedAroundISO: '2026-01-15', weeklyPaceCents: 3000 });
  });

  it('pace <= 0 => never funded (null date), pace preserved', () => {
    expect(
      fundingDate({ currentCents: C(0), targetCents: C(1000), weeklyPaceCents: C(0), today: '2026-01-15' }),
    ).toEqual({ fundedAroundISO: null, weeklyPaceCents: 0 });
    expect(
      fundingDate({ currentCents: C(0), targetCents: C(1000), weeklyPaceCents: C(-500), today: '2026-01-15' }),
    ).toEqual({ fundedAroundISO: null, weeklyPaceCents: -500 });
  });

  it('normal pace => today Monday + ceil(remaining/pace) weeks', () => {
    // remaining 10000, pace 3000 -> ceil(3.33) = 4 weeks. today 2026-01-15 (Thu),
    // Monday 2026-01-12, +28 days = 2026-02-09.
    expect(
      fundingDate({ currentCents: C(0), targetCents: C(10000), weeklyPaceCents: C(3000), today: '2026-01-15' }),
    ).toEqual({ fundedAroundISO: '2026-02-09', weeklyPaceCents: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Integration against the real store
// ---------------------------------------------------------------------------
async function freshChapter() {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  await store().createChapter({ name: 'Test', startedAt: '2026-01-01' });
}

/** Seed 3 trailing months (Jan/Feb/Mar 2026) of steady income + Food spend. */
async function seedThreeMonths(opts: { incomePerMonth: number; foodPerMonth: number }) {
  const savings = await store().createAccount({
    name: 'Savings',
    institution: null,
    kind: 'savings',
    startingBalance: cents(10000),
    openedOn: '2025-12-01',
  });
  const checking = await store().createAccount({
    name: 'Checking',
    institution: null,
    kind: 'spending',
    startingBalance: cents(0),
    openedOn: '2025-12-01',
  });
  const food = await store().createCategory({
    name: 'Food',
    colorKey: 'amber',
    fixed: false,
    envelope: { period: 'weekly', budget: cents(6000), carryoverDefault: 'ask' },
  });
  const src = await store().createIncomeSource({
    name: 'Paycheck',
    amount: cents(opts.incomePerMonth),
    schedule: { kind: 'monthly', anchorDate: '2026-01-15' },
    splits: [{ accountId: checking.id, ratio: 1 }],
  });
  for (const m of ['2026-01', '2026-02', '2026-03']) {
    await store().addIncome({ sourceId: src.id, date: `${m}-15`, amount: cents(opts.incomePerMonth) });
    await store().addExpense({
      accountId: checking.id,
      categoryId: food.id,
      amount: cents(opts.foodPerMonth),
      date: `${m}-10`,
    });
  }
  return { savings: savings.id, checking: checking.id, food: food.id, src: src.id };
}

describe('projectSavings (integration)', () => {
  it('steps from current savings by the median weekly net', async () => {
    await freshChapter();
    await seedThreeMonths({ incomePerMonth: 40000, foodPerMonth: 20000 });
    // median income 40000 -> weekly 9230; median Food spend 20000 -> weekly 4615.
    // weekly net = 4615. No bills. Start savings = 10000 (starting balance).
    const pts = projectSavings(4, '2026-04-15'); // Wed; Monday 2026-04-13
    expect(pts.map((p) => p.weekStartISO)).toEqual([
      '2026-04-13',
      '2026-04-20',
      '2026-04-27',
      '2026-05-04',
      '2026-05-11',
    ]);
    expect(pts.map((p) => p.projectedCents)).toEqual([10000, 14615, 19230, 23845, 28460]);
  });

  it('no trailing history => flat projection from current savings', async () => {
    await freshChapter();
    await store().createAccount({
      name: 'Savings',
      institution: null,
      kind: 'savings',
      startingBalance: cents(5000),
      openedOn: '2026-07-01',
    });
    // today 2026-07-15; trailing months Apr/May/Jun have no activity.
    const pts = projectSavings(3, '2026-07-15');
    expect(pts.map((p) => p.projectedCents)).toEqual([5000, 5000, 5000, 5000]);
  });

  it('rejects a negative or non-integer week count', () => {
    expect(() => projectSavings(-1, '2026-04-15')).toThrow();
    expect(() => projectSavings(2.5, '2026-04-15')).toThrow();
  });
});

describe('projectGoalFunding (integration)', () => {
  it('funds a linked goal at the median pace', async () => {
    await freshChapter();
    const { savings } = await seedThreeMonths({ incomePerMonth: 40000, foodPerMonth: 20000 });
    const goal = await store().addGoal({
      name: 'My own place',
      targetCents: cents(100000),
      savingsAccountId: savings,
    });
    // pace = 9230 - 4615 - 0 bills = 4615. current 10000, remaining 90000.
    // ceil(90000/4615) = 20 weeks. Monday of 2026-04-15 is 2026-04-13; +140d.
    const f = projectGoalFunding(goal.id, '2026-04-15');
    expect(f.weeklyPaceCents).toBe(4615);
    expect(f.fundedAroundISO).toBe('2026-08-31');
  });

  it('never funds when spend outpaces income (pace <= 0)', async () => {
    await freshChapter();
    const { savings } = await seedThreeMonths({ incomePerMonth: 20000, foodPerMonth: 40000 });
    const goal = await store().addGoal({
      name: 'Emergency',
      targetCents: cents(500000),
      savingsAccountId: savings,
    });
    const f = projectGoalFunding(goal.id, '2026-04-15');
    // weekly income 4615 - weekly spend 9230 = -4615 pace.
    expect(f.weeklyPaceCents).toBeLessThan(0);
    expect(f.fundedAroundISO).toBeNull();
  });

  it('no history => null pace and null date (never invent)', async () => {
    await freshChapter();
    const savings = await store().createAccount({
      name: 'Savings',
      institution: null,
      kind: 'savings',
      startingBalance: cents(0),
      openedOn: '2026-07-01',
    });
    const goal = await store().addGoal({
      name: 'Fresh start',
      targetCents: cents(100000),
      savingsAccountId: savings.id,
    });
    const f = projectGoalFunding(goal.id, '2026-07-15');
    expect(f).toEqual({ fundedAroundISO: null, weeklyPaceCents: null });
  });

  it('already-funded goal reports funded as of today', async () => {
    await freshChapter();
    const { savings } = await seedThreeMonths({ incomePerMonth: 40000, foodPerMonth: 20000 });
    const goal = await store().addGoal({
      name: 'Small',
      targetCents: cents(5000), // current savings is 10000 > target
      savingsAccountId: savings,
    });
    const f = projectGoalFunding(goal.id, '2026-04-15');
    expect(f.fundedAroundISO).toBe('2026-04-15');
  });

  it('F4-1: funded-with-zero-history returns funded-today, not the "unknown" null', async () => {
    await freshChapter();
    // No trailing-month activity at all: a fresh chapter, funded from the
    // account's starting balance alone (mirrors the "no history" test above,
    // but with a target the starting balance already covers).
    const savings = await store().createAccount({
      name: 'Savings',
      institution: null,
      kind: 'savings',
      startingBalance: cents(50000),
      openedOn: '2026-07-01',
    });
    const goal = await store().addGoal({
      name: 'Already there',
      targetCents: cents(10000), // 50000 current > 10000 target
      savingsAccountId: savings.id,
    });
    const f = projectGoalFunding(goal.id, '2026-07-15');
    expect(f.fundedAroundISO).toBe('2026-07-15');
    expect(f.fundedAroundISO).not.toBeNull();
    expect(f.weeklyPaceCents).toBeNull(); // no history => no invented pace
  });
});
