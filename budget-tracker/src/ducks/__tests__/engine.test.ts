import { cents, type Cents } from '../../lib/money';
import type { Chapter, Duck } from '../../types/contracts';
import { createDuckEngine, DuckEngineImpl } from '../engine';
import { FakeReadPort, FakeDuckStore, makeIdGen } from '../testReadPort';

const C = (n: number) => cents(n) as Cents;

function chapter(startedAt = '2025-01-01'): Chapter {
  return { id: 'chap-1', name: 'Test', startedAt, archivedAt: null };
}

function build(opts: {
  startedAt?: string;
  storeSeed?: { ducks?: Duck[]; accessoryTier?: number };
  config?: ConstructorParameters<typeof DuckEngineImpl>[0]['config'];
} = {}) {
  const read = new FakeReadPort();
  const store = new FakeDuckStore(opts.storeSeed);
  const ch = chapter(opts.startedAt);
  const engine = createDuckEngine({
    read,
    store,
    getActiveChapter: () => ch,
    generateId: makeIdGen(),
    config: opts.config,
  });
  return { read, store, engine, chapter: ch };
}

/** Configure a month so all three goals pass (perfect month). */
function perfectMonth(read: FakeReadPort, month: string) {
  read.addCategory('food');
  read.setBudget('food', month, C(10000));
  read.addSpend('food', month, C(5000));
  read.setIncome(month, C(100000));
  read.setSavings(month, C(30000)); // exactly 30%
  read.setBills(month, 3, 3);
}

describe('Goal evaluation', () => {
  test('Goal 1 fixed bills: met only when paid === expected', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    // Jan: bills 2/3 (unpaid) → goal fails. Other goals pass.
    read.addCategory('food');
    read.setBudget('food', '2025-01', C(10000));
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.setBills('2025-01', 3, 2);
    await engine.evaluatePendingMonths('2025-02-01');
    const ev = store.peekEvaluations().find((e) => e.month === '2025-01')!;
    expect(ev.goalFixedBills.met).toBe(false);
    expect(ev.goalVariableBudgets.met).toBe(true);
    expect(ev.goalSavingsRate.met).toBe(true);
    expect(ev.outcome).toBe('hold'); // 2 of 3
  });

  test('Goal 1: no bills configured is vacuously met', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.markActive('2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    const ev = store.peekEvaluations()[0];
    expect(ev.goalFixedBills.met).toBe(true);
  });

  test('Goal 2 variable budgets: fails if any envelope over budget', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.addCategory('food');
    read.addCategory('gas');
    read.setBudget('food', '2025-01', C(10000));
    read.setBudget('gas', '2025-01', C(5000));
    read.addSpend('food', '2025-01', C(9000)); // under
    read.addSpend('gas', '2025-01', C(5001)); // 1 cent over
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.setBills('2025-01', 0, 0);
    await engine.evaluatePendingMonths('2025-02-01');
    const ev = store.peekEvaluations()[0];
    expect(ev.goalVariableBudgets.met).toBe(false);
  });

  test('Goal 2: exactly at budget passes; fixed categories ignored', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.addCategory('food');
    read.addCategory('rent', { fixed: true });
    read.setBudget('food', '2025-01', C(10000));
    read.addSpend('food', '2025-01', C(10000)); // exactly at budget
    read.addSpend('rent', '2025-01', C(999999)); // fixed cat, must be ignored by goal 2
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.setBills('2025-01', 0, 0);
    await engine.evaluatePendingMonths('2025-02-01');
    const ev = store.peekEvaluations()[0];
    expect(ev.goalVariableBudgets.met).toBe(true);
  });

  test('Goal 2: no envelopes at all is vacuously met', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.setBills('2025-01', 0, 0);
    read.markActive('2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    expect(store.peekEvaluations()[0].goalVariableBudgets.met).toBe(true);
  });

  test('Goal 3 savings rate: 30% target boundary', async () => {
    for (const [savings, expected] of [
      [C(30000), true],
      [C(29999), false],
      [C(30001), true],
    ] as const) {
      const { read, engine, store } = build({ startedAt: '2025-01-01' });
      read.setIncome('2025-01', C(100000));
      read.setSavings('2025-01', savings);
      read.setBills('2025-01', 0, 0);
      read.markActive('2025-01');
      await engine.evaluatePendingMonths('2025-02-01');
      expect(store.peekEvaluations()[0].goalSavingsRate.met).toBe(expected);
    }
  });

  test('Goal 3 income-zero rule: 0 income + 0 savings → MET', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.setIncome('2025-01', C(0));
    read.setSavings('2025-01', C(0));
    read.setBills('2025-01', 0, 0);
    read.markActive('2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    expect(store.peekEvaluations()[0].goalSavingsRate.met).toBe(true);
  });

  test('Goal 3 income-zero rule: 0 income + positive savings → NOT MET (anti-farm)', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.setIncome('2025-01', C(0));
    read.setSavings('2025-01', C(50000));
    read.setBills('2025-01', 0, 0);
    read.markActive('2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    expect(store.peekEvaluations()[0].goalSavingsRate.met).toBe(false);
  });

  test('Goal 3: configurable target percent', async () => {
    const { read, engine, store } = build({
      startedAt: '2025-01-01',
      config: { savingsTargetPercent: 50 },
    });
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(40000)); // 40% < 50%
    read.setBills('2025-01', 0, 0);
    read.markActive('2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    expect(store.peekEvaluations()[0].goalSavingsRate.met).toBe(false);
  });
});

describe('Lifecycle', () => {
  test('3/3 gains a duck (seed 1 → 2)', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    const [ev] = await engine.evaluatePendingMonths('2025-02-01');
    expect(ev.outcome).toBe('gain');
    expect(ev.duckCountAfter).toBe(2); // seeded 1 + gained 1
    expect(store.peekDucks()).toHaveLength(2);
  });

  test('1–2 goals → hold (count unchanged)', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.addCategory('food');
    read.setBudget('food', '2025-01', C(10000));
    read.addSpend('food', '2025-01', C(20000)); // over → goal 2 fails
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000)); // goal 3 ok
    read.setBills('2025-01', 3, 3); // goal 1 ok
    const [ev] = await engine.evaluatePendingMonths('2025-02-01');
    expect(ev.outcome).toBe('hold');
    expect(ev.duckCountAfter).toBe(1);
  });

  test('0 goals → lose, floored at 0', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    // Two failing months; seed 1 → lose to 0 → stays 0.
    for (const m of ['2025-01', '2025-02']) {
      read.addCategory('food');
      read.setBudget('food', m, C(10000));
      read.addSpend('food', m, C(20000)); // goal 2 fail
      read.setIncome(m, C(100000));
      read.setSavings(m, C(0)); // goal 3 fail
      read.setBills(m, 3, 0); // goal 1 fail
    }
    const evs = await engine.evaluatePendingMonths('2025-03-01');
    expect(evs.map((e) => e.outcome)).toEqual(['lose', 'lose']);
    expect(evs.map((e) => e.duckCountAfter)).toEqual([0, 0]);
    expect(store.peekDucks()).toHaveLength(0);
  });

  test('at cap 12, perfect month → fancy_upgrade, tier +1', async () => {
    const ducks: Duck[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      name: null,
      earnedMonth: '2024-12',
    }));
    const { read, engine, store } = build({
      startedAt: '2025-01-01',
      storeSeed: { ducks, accessoryTier: 0 },
    });
    perfectMonth(read, '2025-01');
    const [ev] = await engine.evaluatePendingMonths('2025-02-01');
    expect(ev.outcome).toBe('fancy_upgrade');
    expect(ev.duckCountAfter).toBe(12);
    expect(ev.accessoryTierAfter).toBe(1);
    expect(store.peekTier()).toBe(1);
    expect(store.peekDucks()).toHaveLength(12);
  });

  test('fancy tier caps at 3 (never exceeds max)', async () => {
    const ducks: Duck[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      name: null,
      earnedMonth: '2024-12',
    }));
    const { read, engine, store } = build({
      startedAt: '2025-01-01',
      storeSeed: { ducks, accessoryTier: 3 },
    });
    perfectMonth(read, '2025-01');
    const [ev] = await engine.evaluatePendingMonths('2025-02-01');
    expect(ev.outcome).toBe('fancy_upgrade');
    expect(ev.accessoryTierAfter).toBe(3); // stays maxed
  });

  test('tier never decreases on a loss', async () => {
    const ducks: Duck[] = [
      { id: 'd0', name: null, earnedMonth: '2024-12' },
      { id: 'd1', name: null, earnedMonth: '2024-12' },
    ];
    const { read, engine, store } = build({
      startedAt: '2025-01-01',
      storeSeed: { ducks, accessoryTier: 2 },
    });
    read.addCategory('food');
    read.setBudget('food', '2025-01', C(10000));
    read.addSpend('food', '2025-01', C(20000));
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(0));
    read.setBills('2025-01', 3, 0);
    const [ev] = await engine.evaluatePendingMonths('2025-02-01');
    expect(ev.outcome).toBe('lose');
    expect(ev.accessoryTierAfter).toBe(2); // finery kept
    expect(ev.duckCountAfter).toBe(1);
  });
});

describe('First-month rule', () => {
  test('mid-month chapter start: start month is partial and skipped', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-15' });
    perfectMonth(read, '2025-01'); // partial → must be skipped
    perfectMonth(read, '2025-02'); // first FULL month → evaluated
    const evs = await engine.evaluatePendingMonths('2025-03-01');
    expect(evs).toHaveLength(1);
    expect(evs[0].month).toBe('2025-02');
    // seeded 1 duck, Feb gains → 2
    expect(evs[0].duckCountAfter).toBe(2);
    expect(store.peekEvaluations()).toHaveLength(1);
  });

  test('chapter started on the 1st: start month IS a full month', async () => {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    const evs = await engine.evaluatePendingMonths('2025-02-01');
    expect(evs.map((e) => e.month)).toEqual(['2025-01']);
  });

  test('current (incomplete) month is never evaluated', async () => {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    perfectMonth(read, '2025-02');
    // now is within February → Feb incomplete, only Jan evaluable
    const evs = await engine.evaluatePendingMonths('2025-02-15');
    expect(evs.map((e) => e.month)).toEqual(['2025-01']);
  });
});

describe('Catch-up: ordering, chaining, idempotence', () => {
  test('evaluates unevaluated completed months oldest-first, chaining counts', async () => {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-03');
    perfectMonth(read, '2025-01');
    perfectMonth(read, '2025-02'); // inserted out of order on purpose
    const evs = await engine.evaluatePendingMonths('2025-04-01');
    expect(evs.map((e) => e.month)).toEqual(['2025-01', '2025-02', '2025-03']);
    // seed 1 → 2 → 3 → 4
    expect(evs.map((e) => e.duckCountAfter)).toEqual([2, 3, 4]);
  });

  test('idempotent: a second call issues nothing and does not re-commit', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    perfectMonth(read, '2025-02');
    const first = await engine.evaluatePendingMonths('2025-03-01');
    expect(first).toHaveLength(2);
    const commitsAfterFirst = store.commits;
    const second = await engine.evaluatePendingMonths('2025-03-01');
    expect(second).toHaveLength(0);
    expect(store.commits).toBe(commitsAfterFirst); // no extra commit
    expect(store.peekEvaluations()).toHaveLength(2); // no duplicates
  });

  test('incremental catch-up: later call only evaluates newly-completed months', async () => {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    perfectMonth(read, '2025-02');
    const first = await engine.evaluatePendingMonths('2025-02-05'); // only Jan complete
    expect(first.map((e) => e.month)).toEqual(['2025-01']);
    const second = await engine.evaluatePendingMonths('2025-03-05'); // Feb now complete
    expect(second.map((e) => e.month)).toEqual(['2025-02']);
    expect(second[0].duckCountAfter).toBe(3); // chained: seed1 → Jan2 → Feb3
  });
});

describe('Attribution-adjusted Goal 2 (cross-month borrow)', () => {
  test('borrowed spend counts against the month it is attributed to, not the calendar month', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    read.addCategory('food');
    read.setBudget('food', '2025-01', C(10000));
    read.setBudget('food', '2025-02', C(10000));
    // Jan's own spend 9000; plus 3000 physically spent in Feb but attributed to
    // Jan (covered by a Jan overspend borrow) → Jan attributed total 12000 (OVER).
    read.addSpend('food', '2025-01', C(9000));
    read.addSpend('food', '2025-01', C(3000)); // borrowed portion, attributed to Jan
    // Feb's own spend 9000 → Feb attributed total 9000 (UNDER).
    read.addSpend('food', '2025-02', C(9000));
    for (const m of ['2025-01', '2025-02']) {
      read.setIncome(m, C(100000));
      read.setSavings(m, C(30000));
      read.setBills(m, 0, 0);
    }
    await engine.evaluatePendingMonths('2025-03-01');
    const jan = store.peekEvaluations().find((e) => e.month === '2025-01')!;
    const feb = store.peekEvaluations().find((e) => e.month === '2025-02')!;
    expect(jan.goalVariableBudgets.met).toBe(false); // 12000 > 10000
    expect(jan.outcome).toBe('hold');
    expect(feb.goalVariableBudgets.met).toBe(true); // 9000 <= 10000
    expect(feb.outcome).toBe('gain');
  });
});

describe('Big-win detection', () => {
  async function bigWinFor(spent: Cents): Promise<boolean> {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    read.addCategory('food');
    read.addCategory('gas');
    read.setBudget('food', '2025-01', C(10000));
    read.setBudget('gas', '2025-01', C(10000));
    read.addSpend('food', '2025-01', spent);
    read.addSpend('gas', '2025-01', C(5000)); // safely under
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.setBills('2025-01', 0, 0);
    const [d] = await engine.evaluatePendingMonthsDetailed('2025-02-01');
    return d.bigWin;
  }

  test('≥20% under budget in ALL envelopes → big win', async () => {
    expect(await bigWinFor(C(8000))).toBe(true); // exactly 20% under
  });

  test('one envelope under 20% margin → no big win', async () => {
    expect(await bigWinFor(C(8001))).toBe(false); // just short of 20% under
  });

  test('no envelopes → no big win', async () => {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    read.setIncome('2025-01', C(100000));
    read.setSavings('2025-01', C(30000));
    read.setBills('2025-01', 0, 0);
    read.markActive('2025-01');
    const [d] = await engine.evaluatePendingMonthsDetailed('2025-02-01');
    expect(d.bigWin).toBe(false);
  });
});

describe('Flock + verdict finality', () => {
  test('getFlock reflects seeded + earned ducks and tier', async () => {
    const { read, engine } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    const flock = await engine.getFlock();
    expect(flock.ducks).toHaveLength(2);
    expect(flock.accessoryTier).toBe(0);
    expect(flock.ducks[1].earnedMonth).toBe('2025-01');
  });

  test('issued evaluations are marked final and are never rewritten', async () => {
    const { read, engine, store } = build({ startedAt: '2025-01-01' });
    perfectMonth(read, '2025-01');
    await engine.evaluatePendingMonths('2025-02-01');
    const before = store.peekEvaluations()[0];
    expect(before.final).toBe(true);
    // Re-run after mutating the underlying data: verdict must not change.
    read.addSpend('food', '2025-01', C(999999)); // would have failed goal 2
    await engine.evaluatePendingMonths('2025-02-01');
    const after = store.peekEvaluations();
    expect(after).toHaveLength(1);
    expect(after[0].outcome).toBe(before.outcome);
    expect(after[0].goalVariableBudgets.met).toBe(true);
  });
});
