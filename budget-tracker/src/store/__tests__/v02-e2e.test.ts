/**
 * v0.2 end-to-end integration test (Agent 3 — fresh-eyes verifier).
 *
 * Scripts a full "life" against the REAL store + real in-memory SQLite
 * (same pattern as money-path.test.ts): init -> seed -> accounts ->
 * categories (1 fixed, 2 weekly envelopes) -> income source (biweekly,
 * 65/35 split) -> income + expenses across two weeks -> borrow across a
 * week boundary -> roll-forward across a week boundary -> sweep-to-savings
 * -> advance a month -> run the real DuckEngine (assembled the same way
 * src/ducks/appEngine.ts assembles it, against the store's real
 * EvaluationReadPort + DuckPersistencePort) -> assert the verdict is
 * exactly right given what was scripted -> backup/mutate/restore round
 * trip via the real Drizzle-backed BackupPort.
 *
 * This test only ever adjusts ITSELF to match observed app behavior. Any
 * place where the app's actual behavior surprised the author is called
 * out in a comment tagged FINDING — those are reported upstream, not
 * silently "fixed" by relaxing the assertion to hide the gap.
 */
import { useBudgetStore } from '../index';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { seedInitialData } from '../../db/seed';
import { createStoreSetupWriter } from '../../setup/storeSetupWriter';
import { cents, sumCents, type Cents } from '../../lib/money';
import { createDuckEngine } from '../../ducks/engine';
import { createPayPeriodRecapEngine, InMemoryRecapAckStore } from '../../ducks/recap';
import { createDrizzleBackupPort } from '../../backup/drizzleBackupPort';
import type { DateRange } from '../../types/contracts';
import * as ids from '../../lib/ids';

const store = () => useBudgetStore.getState();

describe('v0.2 end-to-end: a full chapter life, ducks, and backup/restore', () => {
  it('scripts a month of real activity and gets an exactly-right duck verdict, then survives a backup round trip', async () => {
    // ---------------------------------------------------------------------
    // 1. init + seed (the real bootstrap path App.tsx uses: seedInitialData
    //    creates the default chapter via the real store-backed SetupWriter,
    //    not a hand-rolled createChapter call).
    // ---------------------------------------------------------------------
    resetDatabaseForTests();
    await initDatabase();
    await store().init();
    const chapter = await seedInitialData(createStoreSetupWriter());
    expect(chapter.startedAt).toBe(new Date().toISOString().slice(0, 10));

    // The design doc requires the wizard to control the chapter's "lived in"
    // start date, not today's date — but for a deterministic month-boundary
    // test we need a fixed startedAt. Re-create a chapter dated 2026-01-01
    // directly (mirrors what the setup wizard would do with a user-chosen
    // start date) since seedInitialData always anchors to "today".
    await store().archiveChapter(chapter.id, '2026-01-01');
    const jan = await store().createChapter({ name: 'Test chapter', startedAt: '2026-01-01' });
    expect(store().getActiveChapter().id).toBe(jan.id);

    // ---------------------------------------------------------------------
    // 2. Accounts: checking (spending) + savings, both with starting balances.
    // ---------------------------------------------------------------------
    const checking = (
      await store().createAccount({
        name: 'Checking',
        institution: 'Local Bank',
        kind: 'spending',
        startingBalance: cents(200000), // $2000.00
        openedOn: '2026-01-01',
      })
    ).id;
    const savings = (
      await store().createAccount({
        name: 'Savings',
        institution: 'Local Bank',
        kind: 'savings',
        startingBalance: cents(50000), // $500.00
        openedOn: '2026-01-01',
      })
    ).id;

    // ---------------------------------------------------------------------
    // 3. Categories: 1 fixed (recurring bill), 2 enveloped weekly.
    // ---------------------------------------------------------------------
    const rent = (
      await store().createCategory({
        name: 'Rent',
        colorKey: 'violet',
        fixed: true,
        envelope: null,
      })
    ).id;
    const food = (
      await store().createCategory({
        name: 'Food',
        colorKey: 'amber',
        fixed: false,
        envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
      })
    ).id;
    const fun = (
      await store().createCategory({
        name: 'Fun',
        colorKey: 'pink',
        fixed: false,
        envelope: { period: 'weekly', budget: cents(5000), carryoverDefault: 'ask' },
      })
    ).id;

    // ---------------------------------------------------------------------
    // 4. Income source: biweekly, 65/35 split checking/savings.
    // ---------------------------------------------------------------------
    const paycheck = await store().createIncomeSource({
      name: 'Paycheck',
      amount: cents(200000), // $2000.00 per payday
      schedule: { kind: 'biweekly', anchorDate: '2026-01-02' },
      splits: [
        { accountId: checking, ratio: 65 },
        { accountId: savings, ratio: 35 },
      ],
    });

    // Two paydays in January, 14 days apart.
    await store().addIncome({ sourceId: paycheck.id, date: '2026-01-02' });
    await store().addIncome({ sourceId: paycheck.id, date: '2026-01-16' });

    // 200000 * 0.65 = 130000, * 0.35 = 70000 exactly (no remainder to fight
    // allocate() over) — each payday.
    expect(store().getAccountBalance(checking, '2026-01-02')).toBe(200000 + 130000);
    expect(store().getAccountBalance(savings, '2026-01-02')).toBe(50000 + 70000);

    // ---------------------------------------------------------------------
    // 5. Expenses across two weeks (Mon 2026-01-05..11 and Mon 2026-01-12..18).
    // ---------------------------------------------------------------------
    const WEEK1 = '2026-01-05';
    const WEEK2 = '2026-01-12';

    await store().addExpense({ accountId: checking, categoryId: rent, amount: cents(150000), date: '2026-01-10' });
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(12000), date: '2026-01-06' }); // over Food's week1 budget
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(3000), date: '2026-01-13' });
    await store().addExpense({ accountId: checking, categoryId: fun, amount: cents(1000), date: '2026-01-07' });
    await store().addExpense({ accountId: checking, categoryId: fun, amount: cents(2000), date: '2026-01-14' });

    // ---------------------------------------------------------------------
    // 6. Overdraw Food in week1, borrow from week2 (cap = 50% of next week's
    //    configured budget = 5000; borrowing 2000 is within cap).
    // ---------------------------------------------------------------------
    await store().borrowFromNextWeek(food, WEEK1, cents(2000));
    const foodWeek1 = store().getEnvelopeWeekState(food, WEEK1);
    const foodWeek2 = store().getEnvelopeWeekState(food, WEEK2);
    expect(foodWeek1.remaining).toBe(0); // 10000 budget + 2000 borrowed_in - 12000 spent
    expect(foodWeek2.remaining).toBe(5000); // 10000 budget - 2000 repay - 3000 spent

    // ---------------------------------------------------------------------
    // 7. Roll Fun's week1 leftover forward into week2.
    // ---------------------------------------------------------------------
    const funWeek1Before = store().getEnvelopeWeekState(fun, WEEK1);
    expect(funWeek1Before.remaining).toBe(4000); // 5000 budget - 1000 spent
    await store().rollForward(fun, WEEK1);
    const funWeek1After = store().getEnvelopeWeekState(fun, WEEK1);
    const funWeek2Before = store().getEnvelopeWeekState(fun, WEEK2);
    expect(funWeek1After.remaining).toBe(0); // fully rolled out
    expect(funWeek2Before.remaining).toBe(7000); // 5000 budget + 4000 rolled in - 2000 spent

    // ---------------------------------------------------------------------
    // 8. Sweep Fun's week2 leftover to savings.
    // ---------------------------------------------------------------------
    await store().sweepToSavings(fun, WEEK2, savings);
    const funWeek2After = store().getEnvelopeWeekState(fun, WEEK2);
    expect(funWeek2After.remaining).toBe(0);

    // FIXED (was finding #2): sweepToSavings now records a real transfer
    // pair (spending source -> savings) in the same transaction as the
    // budget-ledger entry, per design doc §5.2. The 7000 sweep moves cash.
    expect(store().getAccountBalance(savings, '2026-01-19')).toBe(50000 + 70000 + 70000 + 7000);

    // ---------------------------------------------------------------------
    // 9. An explicit account-to-account transfer toward savings, adding to
    //    the swept cash so the savings-rate goal is comfortably met.
    // ---------------------------------------------------------------------
    await store().transfer({ fromAccountId: checking, toAccountId: savings, amount: cents(130000), date: '2026-01-20' });

    const finalChecking =
      200000 + 130000 + 130000 - 150000 - 12000 - 3000 - 1000 - 2000 - 130000 - 7000; // sweep funds from checking
    const finalSavings = 50000 + 70000 + 70000 + 130000 + 7000; // sweep moves real cents
    expect(store().getAccountBalance(checking, '2026-01-31')).toBe(finalChecking); // 155000
    expect(store().getAccountBalance(savings, '2026-01-31')).toBe(finalSavings); // 327000

    // ---------------------------------------------------------------------
    // 10. Sanity-check the EvaluationReadPort numbers the duck engine will
    //     see, so the verdict assertion below isn't a black box.
    // ---------------------------------------------------------------------
    const income = await store().evaluation.getMonthIncomeTotal('2026-01');
    expect(income).toBe(400000);
    const savingsTotal = await store().evaluation.getMonthSavingsTotal('2026-01');
    expect(savingsTotal).toBe(130000 + 7000); // real transfer + sweep transfer (contract's definition)
    const bills = await store().evaluation.getMonthFixedBillStatus('2026-01');
    expect(bills).toEqual({ expected: 1, paid: 1 });
    const catTotals = await store().evaluation.getMonthCategoryTotals('2026-01');
    const foodTotal = catTotals.find((c) => c.categoryId === food)!;
    const funTotal = catTotals.find((c) => c.categoryId === fun)!;
    expect(foodTotal.spent).toBe(15000);
    expect(foodTotal.budget).toBe(40000); // 4 Mondays in Jan 2026 * 10000, borrow doesn't touch the basis
    expect(funTotal.spent).toBe(3000);
    expect(funTotal.budget).toBe(20000); // 4 * 5000, net rolls cancel out within the month

    // ---------------------------------------------------------------------
    // 11. Advance to February and run the real duck engine, assembled from
    //     the store's own ports exactly as src/ducks/appEngine.ts does.
    // ---------------------------------------------------------------------
    const engine = createDuckEngine({
      read: store().evaluation,
      store: store().duckPersistence,
      getActiveChapter: () => store().getActiveChapter(),
      generateId: ids.generateId,
      categoryName: (id) => store().listCategories().find((c) => c.id === id)?.name ?? id,
    });

    const detailed = await engine.evaluatePendingMonthsDetailed('2026-02-01');
    expect(detailed).toHaveLength(1);
    const [{ evaluation: verdict, bigWin }] = detailed;

    expect(verdict.month).toBe('2026-01');
    // All 3 goals met given what was scripted: bills paid, both envelopes
    // within their monthly basis, and 30%+ of income actually transferred
    // to savings (130000 + 7000 = 137000 >= 30% of 400000 = 120000).
    expect(verdict.goalFixedBills.met).toBe(true);
    expect(verdict.goalVariableBudgets.met).toBe(true);
    expect(verdict.goalSavingsRate.met).toBe(true);
    expect(verdict.outcome).toBe('gain');
    // Chapter starts at 1 (self-seeded starter duck) + 1 gained this month.
    expect(verdict.duckCountAfter).toBe(2);
    expect(verdict.accessoryTierAfter).toBe(0);
    // Under budget by >=20% in BOTH envelopes (15000<=80% of 40000=32000;
    // 3000<=80% of 20000=16000) -> big-win celebration flag.
    expect(bigWin).toBe(true);

    const flock = await engine.getFlock();
    expect(flock.ducks).toHaveLength(2);
    expect(flock.accessoryTier).toBe(0);

    // Re-running evaluation for the same "now" must NOT re-issue Jan (verdict
    // finality) — evaluatePendingMonthsDetailed should return nothing new.
    const again = await engine.evaluatePendingMonthsDetailed('2026-02-01');
    expect(again).toHaveLength(0);

    // ---------------------------------------------------------------------
    // 12. Backup / mutate / restore round trip via the REAL Drizzle-backed
    //     BackupPort (not FakeBackupPort).
    // ---------------------------------------------------------------------
    const backup = createDrizzleBackupPort();
    const dump = await backup.dumpAll();

    // Mutate the live state in several ways that touch every subsystem the
    // duck engine + store expose: a new transaction, a renamed duck, and a
    // second evaluated month.
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(9999), date: '2026-01-25' });
    await store().duckPersistence.renameDuck(flock.ducks[0].id, 'Gerald');
    await store().addIncome({ sourceId: paycheck.id, date: '2026-02-02' }); // give Feb some activity
    await store().addExpense({ accountId: checking, categoryId: rent, amount: cents(150000), date: '2026-02-10' });
    const mutatedEval = await engine.evaluatePendingMonthsDetailed('2026-03-01');
    // Feb has income + a paid Rent bill but no transfer/sweep into savings,
    // so its savings goal misses -> metCount 2 -> 'hold'. Either way a
    // SECOND verdict now exists.
    expect(mutatedEval).toHaveLength(1);
    expect(mutatedEval[0].evaluation.month).toBe('2026-02');
    expect(mutatedEval[0].evaluation.outcome).toBe('hold');

    const evalCountAfterMutation = (await store().duckPersistence.loadState(jan.id)).evaluations.length;
    expect(evalCountAfterMutation).toBe(2); // Jan (gain) + Feb (hold)
    expect(store().getAccountBalance(checking, '2026-01-31')).not.toBe(finalChecking);
    expect((await engine.getFlock()).ducks.map((d) => d.name)).toContain('Gerald');

    // Restore the pre-mutation dump — all-or-nothing, then reload the store.
    await backup.restoreAll(dump);

    // Balances back exactly.
    expect(store().getAccountBalance(checking, '2026-01-31')).toBe(finalChecking);
    expect(store().getAccountBalance(savings, '2026-01-31')).toBe(finalSavings);

    // Carryover ledger (envelope leftover/borrow/roll/sweep bookkeeping) back
    // exactly.
    expect(store().getEnvelopeWeekState(food, WEEK1).remaining).toBe(0);
    expect(store().getEnvelopeWeekState(food, WEEK2).remaining).toBe(5000);
    expect(store().getEnvelopeWeekState(fun, WEEK1).remaining).toBe(0);
    expect(store().getEnvelopeWeekState(fun, WEEK2).remaining).toBe(0);

    // Evaluations back exactly: only the original January verdict, nothing
    // from the mutation's February run.
    const restoredEntries = await store().evaluation.getCarryoverEntries({});
    // borrow_in + borrow_repay (Food) + roll_out + roll_in (Fun) + sweep_to_savings (Fun) = 5.
    expect(restoredEntries.map((e) => e.kind).sort()).toEqual(
      ['borrow_in', 'borrow_repay', 'roll_in', 'roll_out', 'sweep_to_savings'].sort(),
    );

    const restoredFlock = await engine.getFlock();
    expect(restoredFlock.ducks).toHaveLength(2);
    expect(restoredFlock.ducks.map((d) => d.name)).toEqual([null, null]); // rename undone
    expect(restoredFlock.accessoryTier).toBe(0);

    const evalCountAfterRestore = (await store().duckPersistence.loadState(jan.id)).evaluations.length;
    expect(evalCountAfterRestore).toBe(1); // Feb's 'hold' verdict is gone; only Jan's 'gain' remains

    const restoredDetailed = await engine.evaluatePendingMonthsDetailed('2026-03-01');
    // Feb (and the mutation-added Feb activity) is gone; Feb has no activity
    // post-restore other than whatever existed pre-mutation (none) -> Feb is
    // dormant -> skipped, nothing new issued.
    expect(restoredDetailed).toHaveLength(0);
  });

  // =====================================================================
  // v0.3 CHAPTER — a full March life exercising the wave's new surfaces:
  // a monthly-cadence envelope, an UNCAPPED borrow bigger than the old
  // 50%-of-next-cycle cap, a mid-month pay-period recap acknowledgement,
  // the starter-duck invariant at chapter start, and a month-end duck
  // verdict whose attribution the borrow must not launder. Balances are
  // asserted to the cent. Self-contained (its own db + chapter).
  // =====================================================================
  it('v0.3 chapter: monthly envelope + uncapped borrow + mid-month recap ack + starter duck, balances exact', async () => {
    resetDatabaseForTests();
    await initDatabase();
    await store().init();
    // Chapter dated to the 1st so March is a full, evaluable month.
    const mar = await store().createChapter({ name: 'v0.3 chapter', startedAt: '2026-03-01' });
    expect(store().getActiveChapter().id).toBe(mar.id);

    const checking = (
      await store().createAccount({
        name: 'Checking', institution: null, kind: 'spending',
        startingBalance: cents(200000), openedOn: '2026-03-01',
      })
    ).id;
    const savings = (
      await store().createAccount({
        name: 'Savings', institution: null, kind: 'savings',
        startingBalance: cents(0), openedOn: '2026-03-01',
      })
    ).id;

    const rent = (
      await store().createCategory({ name: 'Rent', colorKey: 'violet', fixed: true, envelope: null })
    ).id;
    // Weekly Food envelope + a MONTHLY-cadence Fun envelope (the v0.3 addition).
    const food = (
      await store().createCategory({
        name: 'Food', colorKey: 'amber', fixed: false,
        envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
      })
    ).id;
    const fun = (
      await store().createCategory({
        name: 'Fun', colorKey: 'pink', fixed: false, cadence: 'monthly',
        envelope: { period: 'monthly', budget: cents(20000), carryoverDefault: 'ask' },
      })
    ).id;

    // Biweekly income, all to checking (goal 3 is met via an explicit savings
    // transfer below — income splits are 'income' rows, not savings transfers).
    const pay = await store().createIncomeSource({
      name: 'Paycheck', amount: cents(150000),
      schedule: { kind: 'biweekly', anchorDate: '2026-03-06' },
      splits: [{ accountId: checking, ratio: 1 }],
    });
    // March paydays: Mar 6 and Mar 20 -> $3000.00 income in March.
    await store().addIncome({ sourceId: pay.id, date: '2026-03-06' });
    await store().addIncome({ sourceId: pay.id, date: '2026-03-20' });

    // Starter-duck invariant: the pond is never empty on a fresh chapter, even
    // before any month is evaluated.
    const engine = createDuckEngine({
      read: store().evaluation,
      store: store().duckPersistence,
      getActiveChapter: () => store().getActiveChapter(),
      generateId: ids.generateId,
      categoryName: (id) => store().listCategories().find((c) => c.id === id)?.name ?? id,
    });
    const starterFlock = await engine.getFlock();
    expect(starterFlock.ducks).toHaveLength(1);
    expect(starterFlock.ducks[0].earnedMonth).toBe('2026-03');

    // Spend: pay rent (goal 1), Food within budget, Fun within its monthly budget.
    await store().addExpense({ accountId: checking, categoryId: rent, amount: cents(100000), date: '2026-03-10' });
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(8000), date: '2026-03-12' });
    await store().addExpense({ accountId: checking, categoryId: fun, amount: cents(15000), date: '2026-03-14' });

    // UNCAPPED borrow: Fun (monthly) borrows 15000 from April — the old cap was
    // 50% of next cycle = 10000, so this was previously impossible. Both legs
    // attribute to March; April carries neither (no duck laundering).
    const owedBefore = store().nextCycleStartState(fun, '2026-03-15');
    expect(owedBefore.cycleStart).toBe('2026-04-01');
    expect(owedBefore.budget).toBe(20000);
    await store().borrowFromNextCycle(fun, '2026-03-15', cents(15000));
    const owedAfter = store().nextCycleStartState(fun, '2026-03-15');
    expect(owedAfter.alreadyOwed).toBe(15000);
    expect(owedAfter.startsWith).toBe(20000 - 15000);
    const marCarry = await store().evaluation.getCarryoverEntries({ month: '2026-03' });
    const aprCarry = await store().evaluation.getCarryoverEntries({ month: '2026-04' });
    expect(marCarry.filter((e) => e.categoryId === fun).map((e) => e.kind).sort()).toEqual(
      ['borrow_in', 'borrow_repay'],
    );
    expect(aprCarry).toHaveLength(0);

    // Explicit savings transfer to satisfy goal 3 (>= 30% of $3000.00 income).
    await store().transfer({ fromAccountId: checking, toAccountId: savings, amount: cents(90000), date: '2026-03-22' });

    // Balances to the cent.
    const finalChecking = 200000 + 150000 + 150000 - 100000 - 8000 - 15000 - 90000; // 287000
    const finalSavings = 0 + 90000;
    expect(store().getAccountBalance(checking, '2026-03-31')).toBe(finalChecking);
    expect(store().getAccountBalance(savings, '2026-03-31')).toBe(finalSavings);

    // Pay-period recap: acknowledge the MID-MONTH close (Mar 6 -> Mar 20) while
    // still inside March. Built over the store's real payday projection.
    const ack = new InMemoryRecapAckStore();
    const recap = createPayPeriodRecapEngine({
      getPaydays: (range: DateRange) => store().getPaydays(range),
      getActiveChapter: () => store().getActiveChapter(),
      ack,
    });
    const midMonthPending = await recap.getPendingRecaps('2026-03-25');
    expect(midMonthPending.map((p) => [p.closedOn, p.kind])).toEqual([['2026-03-20', 'pay_period']]);
    await recap.acknowledgePending('2026-03-25');
    expect(await recap.getPendingRecaps('2026-03-25')).toHaveLength(0);
    // Next close (Apr 3) is a MONTH_END recap that carries March's verdict.
    const monthEndPending = await recap.getPendingRecaps('2026-04-10');
    expect(monthEndPending.map((p) => [p.closedOn, p.kind, p.verdictMonth])).toEqual([
      ['2026-04-03', 'month_end', '2026-03'],
    ]);

    // Sanity: the numbers the duck engine will see. The borrow does NOT inflate
    // Fun's basis (still 20000), so a genuine within-budget month, not laundered.
    const cats = await store().evaluation.getMonthCategoryTotals('2026-03');
    const funTotals = cats.find((c) => c.categoryId === fun)!;
    expect(funTotals.budget).toBe(20000);
    expect(funTotals.spent).toBe(15000);
    expect(await store().evaluation.getMonthIncomeTotal('2026-03')).toBe(300000);
    expect(await store().evaluation.getMonthSavingsTotal('2026-03')).toBe(90000);

    // Month-end evaluation: March is 3/3 (rent paid, both envelopes within
    // budget on the un-inflated basis, 30% saved) -> gain. Starter (1) + 1 = 2.
    const [{ evaluation: verdict }] = await engine.evaluatePendingMonthsDetailed('2026-04-01');
    expect(verdict.month).toBe('2026-03');
    expect(verdict.goalFixedBills.met).toBe(true);
    expect(verdict.goalVariableBudgets.met).toBe(true);
    expect(verdict.goalSavingsRate.met).toBe(true);
    expect(verdict.outcome).toBe('gain');
    expect(verdict.duckCountAfter).toBe(2);
    const flock = await engine.getFlock();
    expect(flock.ducks).toHaveLength(2);
  });
});

// =====================================================================
// v0.3-fixes CHAPTER — the F1-4 phantom-week guards and the reversible
// carryover (F3-1/F3-2). getSettleableLeftovers must never synthesize a
// leftover for a week predating the chapter or the category; rollForward/
// sweepToSavings must early-return null on a phantom week and write nothing;
// and both actions' undo() must fully reverse with conservation intact.
// =====================================================================
describe('v0.3-fixes: phantom-week guards + reversible carryover', () => {
  // Local Monday helper (mirrors the store's week math) so the createdAt-gate
  // assertions stay correct regardless of the calendar date the suite runs on.
  const mondayOf = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const addDays = (iso: string, n: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  async function setup(startedAt = '2026-03-01') {
    resetDatabaseForTests();
    await initDatabase();
    await store().init();
    await store().createChapter({ name: 'v0.3-fixes', startedAt });
    const checking = (
      await store().createAccount({
        name: 'Checking', institution: null, kind: 'spending',
        startingBalance: cents(200000), openedOn: startedAt,
      })
    ).id;
    const savings = (
      await store().createAccount({
        name: 'Savings', institution: null, kind: 'savings',
        startingBalance: cents(0), openedOn: startedAt,
      })
    ).id;
    const food = (
      await store().createCategory({
        name: 'Food', colorKey: 'amber', fixed: false,
        envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
      })
    ).id;
    return { checking, savings, food };
  }

  it('a freshly-created category yields NO settleable leftover for a week that predates it (createdAt gate)', async () => {
    const { food } = await setup('2026-03-01');
    // A week fully inside the chapter but well before the category was created
    // (categories are created at real "now") must not synthesize a full-budget
    // phantom leftover — the exact F1-4 mechanism.
    const wayBack = mondayOf('2026-03-16');
    expect(store().getSettleableLeftovers(wayBack)).toEqual([]);

    // A current week (on/after the category's creation) with a genuine untouched
    // budget DOES surface, proving the gate is date-aware, not a blanket empty.
    const thisWeek = mondayOf(new Date().toISOString().slice(0, 10));
    const settleable = store().getSettleableLeftovers(thisWeek);
    expect(settleable).toEqual([{ categoryId: food, remaining: 10000 }]);
  });

  it('rollForward / sweepToSavings return null and write NOTHING on a phantom week before the chapter', async () => {
    const { savings, food } = await setup('2026-03-01');
    const phantomWeek = mondayOf('2026-02-16'); // ends 2026-02-22, before the chapter
    const carryBefore = (await store().evaluation.getCarryoverEntries({})).length;
    const savingsBefore = store().getAccountBalance(savings, '2026-03-31');

    expect(await store().rollForward(food, phantomWeek)).toBeNull();
    expect(await store().sweepToSavings(food, phantomWeek, savings)).toBeNull();

    expect((await store().evaluation.getCarryoverEntries({})).length).toBe(carryBefore);
    expect(store().getAccountBalance(savings, '2026-03-31')).toBe(savingsBefore);
  });

  it('rollForward → undo fully reverses the pair; conservation and balances intact; single-fire', async () => {
    const { checking, food } = await setup('2026-03-01');
    const week1 = mondayOf('2026-03-02');
    const week2 = addDays(week1, 7);
    await store().addExpense({ accountId: checking, categoryId: food, amount: cents(3000), date: week1 });
    const chkBefore = store().getAccountBalance(checking, '2026-03-31');
    expect(store().getEnvelopeWeekState(food, week1).remaining).toBe(7000);

    const res = await store().rollForward(food, week1);
    expect(res).not.toBeNull();
    expect(res!.amount).toBe(7000);
    expect(store().getEnvelopeWeekState(food, week1).remaining).toBe(0);
    expect(store().getEnvelopeWeekState(food, week2).remaining).toBe(17000); // 10000 + 7000 rolled in
    expect((await store().evaluation.getCarryoverEntries({})).map((e) => e.kind).sort())
      .toEqual(['roll_in', 'roll_out']);

    expect(await res!.undo()).toBe(true);
    // Pair hard-deleted: the roll never happened, budget back in its origin week.
    expect(await store().evaluation.getCarryoverEntries({})).toHaveLength(0);
    expect(store().getEnvelopeWeekState(food, week1).remaining).toBe(7000);
    expect(store().getEnvelopeWeekState(food, week2).remaining).toBe(10000);
    // A roll moves no cash — the checking balance never changed.
    expect(store().getAccountBalance(checking, '2026-03-31')).toBe(chkBefore);
    // Single-fire: a second undo is a no-op.
    expect(await res!.undo()).toBe(false);
  });

  it('sweepToSavings → undo returns the cash, deletes the carryover row, tombstones the transfer; single-fire', async () => {
    const { checking, savings, food } = await setup('2026-03-01');
    const week = mondayOf('2026-03-02');
    const chkBefore = store().getAccountBalance(checking, '2026-03-31');
    const savBefore = store().getAccountBalance(savings, '2026-03-31');
    expect(store().getEnvelopeWeekState(food, week).remaining).toBe(10000);

    const res = await store().sweepToSavings(food, week, savings);
    expect(res).not.toBeNull();
    expect(res!.amount).toBe(10000);
    // Cash really moved checking -> savings; the sweep entry exists.
    expect(store().getAccountBalance(checking, '2026-03-31')).toBe(chkBefore - 10000);
    expect(store().getAccountBalance(savings, '2026-03-31')).toBe(savBefore + 10000);
    expect((await store().evaluation.getCarryoverEntries({})).map((e) => e.kind)).toEqual(['sweep_to_savings']);

    expect(await res!.undo()).toBe(true);
    // Carryover row gone, transfer legs tombstoned => balances fully restored.
    expect(await store().evaluation.getCarryoverEntries({})).toHaveLength(0);
    expect(store().getAccountBalance(checking, '2026-03-31')).toBe(chkBefore);
    expect(store().getAccountBalance(savings, '2026-03-31')).toBe(savBefore);
    expect(store().getEnvelopeWeekState(food, week).remaining).toBe(10000);
    expect(await res!.undo()).toBe(false); // single-fire
  });
});
