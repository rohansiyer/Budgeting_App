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
import { createDrizzleBackupPort } from '../../backup/drizzleBackupPort';
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
});
