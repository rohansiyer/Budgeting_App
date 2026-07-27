/**
 * Rule-level unit tests. Every shipped rule gets a firing test and a
 * non-firing test, seeded against the real store (real in-memory SQLite via
 * the expo-sqlite mock), mirroring src/store/__tests__/money-path.test.ts.
 */
import type { RuleContext } from '../types';
import {
  biggestExpenseOfPeriod,
  borrowRepaidOnTime,
  carryoverSweptTotal,
  categoryBestMonthSince,
  categoryShareShift,
  categoryStreakUnderBudget,
  daysCoveredBySafeToSpend,
  envelopeZeroBorrowStreak,
  envelopeZeroFinish,
  firstAllGreenMonth,
  fixedBillsPaidEarly,
  noSpendDayStreak,
  paydayLanded,
  quietWeek,
  recurringMerchantHits,
  savingsMilestone,
  savingsRatePercent,
  spendBelowTrailingMedian,
  spendPaceVsLastWeek,
  weekendVsWeekdayShare,
} from '../rules';
import { cents } from '../../lib/money';
import {
  expense,
  freshChapter,
  makeAccount,
  makeFixedCategory,
  makeIncomeSource,
  makeMonthlyEnvelope,
  makeWeeklyEnvelope,
  moveToSavings,
  payIncome,
  store,
} from './harness';

/** A convenience context builder; most rules only look at `today`. */
function ctx(today: string, window?: { from: string; to: string }): RuleContext {
  return { today, window: window ?? { from: today, to: today }, store: store() };
}

describe('categoryBestMonthSince', () => {
  it('fires when last month is a new record over the chapter history', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeMonthlyEnvelope('Groceries', 20000);
    await expense(acct, cat, 15000, '2026-01-10'); // under 5000
    await expense(acct, cat, 18000, '2026-02-10'); // under 2000
    await expense(acct, cat, 5000, '2026-03-10'); // under 15000 — a new best

    const fired = categoryBestMonthSince.trigger(ctx('2026-04-10'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Groceries came in');
    expect(fired!.amountText).toBe('$150.00');
    expect(fired!.suffix).toBe('under budget, your best month since January 2026.');
    expect(fired!.categoryId).toBe(cat);
  });

  it('does not fire when last month is not a new record', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeMonthlyEnvelope('Groceries', 20000);
    await expense(acct, cat, 15000, '2026-01-10'); // under 5000
    await expense(acct, cat, 18000, '2026-02-10'); // under 2000
    await expense(acct, cat, 19000, '2026-03-10'); // under 1000 — worse than Feb

    expect(categoryBestMonthSince.trigger(ctx('2026-04-10'))).toBeNull();
  });
});

describe('categoryStreakUnderBudget', () => {
  it('fires on a 6-week streak under budget', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Gas', 5000);
    for (const week of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09']) {
      await expense(acct, cat, 1000, week);
    }
    const fired = categoryStreakUnderBudget.trigger(ctx('2026-02-16'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Gas saved');
    expect(fired!.amountText).toBe('$240.00');
    expect(fired!.suffix).toBe('across a 6-week streak under budget.');
  });

  it('does not fire when the most recent completed week went over budget', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Gas', 5000);
    await expense(acct, cat, 6000, '2026-02-10'); // week of Feb 9, over budget
    expect(categoryStreakUnderBudget.trigger(ctx('2026-02-16'))).toBeNull();
  });
});

describe('spendPaceVsLastWeek', () => {
  it('fires when this week is pacing meaningfully above last week', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Food', 10000);
    await expense(acct, cat, 1000, '2026-01-12'); // last week (Jan 12-13 span)
    await expense(acct, cat, 5000, '2026-01-19'); // this week (Jan 19-20 span)
    const fired = spendPaceVsLastWeek.trigger(ctx('2026-01-20'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('You are pacing');
    expect(fired!.amountText).toBe('$40.00');
    expect(fired!.suffix).toBe("above last week's spending so far.");
  });

  it('does not fire when the difference is under the noise threshold', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Food', 10000);
    await expense(acct, cat, 1000, '2026-01-12');
    await expense(acct, cat, 1050, '2026-01-19');
    expect(spendPaceVsLastWeek.trigger(ctx('2026-01-20'))).toBeNull();
  });
});

describe('biggestExpenseOfPeriod', () => {
  it('fires with the largest expense in the window', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 20000);
    await expense(acct, cat, 2000, '2026-01-06', 'Coffee');
    await expense(acct, cat, 8500, '2026-01-08', 'Concert tickets');
    const fired = biggestExpenseOfPeriod.trigger(
      ctx('2026-01-11', { from: '2026-01-05', to: '2026-01-11' }),
    );
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$85.00');
    expect(fired!.suffix).toBe('for Concert tickets.');
  });

  it('does not fire when the window has no expenses', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 100000);
    expect(
      biggestExpenseOfPeriod.trigger(ctx('2026-01-11', { from: '2026-01-05', to: '2026-01-11' })),
    ).toBeNull();
  });
});

describe('paydayLanded', () => {
  it('fires the day income posts', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 0);
    const src = await makeIncomeSource('Job', 200000, acct);
    await payIncome(src, '2026-01-16');
    const fired = paydayLanded.trigger(ctx('2026-01-16'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$2,000.00');
  });

  it('does not fire on a day with no income', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 0);
    const src = await makeIncomeSource('Job', 200000, acct);
    await payIncome(src, '2026-01-16');
    expect(paydayLanded.trigger(ctx('2026-01-17'))).toBeNull();
  });
});

describe('savingsMilestone', () => {
  it('fires the day a savings account crosses a milestone', async () => {
    await freshChapter('2026-01-05');
    const checking = await makeAccount('Checking', 100000);
    const savings = await makeAccount('Savings', 40000, 'savings');
    await moveToSavings(checking, savings, 20000, '2026-01-20');
    const fired = savingsMilestone.trigger(ctx('2026-01-20'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Savings crossed');
    expect(fired!.amountText).toBe('$500.00');
  });

  it('does not fire on a day with no crossing', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 100000);
    await makeAccount('Savings', 40000, 'savings');
    expect(savingsMilestone.trigger(ctx('2026-01-20'))).toBeNull();
  });
});

describe('envelopeZeroFinish', () => {
  it('fires when last week ended at exactly zero remaining', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 5000);
    await expense(acct, cat, 5000, '2026-01-13'); // week of Jan 12
    const fired = envelopeZeroFinish.trigger(ctx('2026-01-19'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Fun closed last week with');
    expect(fired!.amountText).toBe('$0.00');
  });

  it('does not fire when last week left money over', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 5000);
    await expense(acct, cat, 3000, '2026-01-13');
    expect(envelopeZeroFinish.trigger(ctx('2026-01-19'))).toBeNull();
  });
});

describe('borrowRepaidOnTime', () => {
  it('fires when a borrow from two weeks ago was repaid last week without going negative', async () => {
    await freshChapter('2026-01-05');
    const cat = await makeWeeklyEnvelope('Gas', 5000);
    await store().borrowFromNextWeek(cat, '2026-01-05', cents(2000));
    const fired = borrowRepaidOnTime.trigger(ctx('2026-01-19'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Gas repaid');
    expect(fired!.amountText).toBe('$20.00');
  });

  it('does not fire when nothing was borrowed', async () => {
    await freshChapter('2026-01-05');
    await makeWeeklyEnvelope('Gas', 5000);
    expect(borrowRepaidOnTime.trigger(ctx('2026-01-19'))).toBeNull();
  });
});

describe('noSpendDayStreak', () => {
  it('fires on a run of zero-spend days once the chapter has history', async () => {
    await freshChapter('2025-12-01');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 5000);
    await expense(acct, cat, 500, '2025-12-15'); // establishes real activity, outside the window
    const fired = noSpendDayStreak.trigger(ctx('2026-01-11', { from: '2026-01-05', to: '2026-01-11' }));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('You have gone');
    expect(fired!.suffix).toBe('7 days without spending a cent.');
  });

  it('does not fire on an empty account with no history at all', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 100000);
    expect(
      noSpendDayStreak.trigger(ctx('2026-01-11', { from: '2026-01-05', to: '2026-01-11' })),
    ).toBeNull();
  });
});

describe('weekendVsWeekdayShare', () => {
  it('fires when the weekend carries a majority of the spend', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 20000);
    await expense(acct, cat, 2000, '2026-01-06'); // Tue
    await expense(acct, cat, 8000, '2026-01-10'); // Sat
    const fired = weekendVsWeekdayShare.trigger(
      ctx('2026-01-11', { from: '2026-01-05', to: '2026-01-11' }),
    );
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$80.00');
    expect(fired!.suffix).toBe('of your spending this period, 80% of the total.');
  });

  it('does not fire when the weekend is a minor share', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 20000);
    await expense(acct, cat, 9000, '2026-01-06');
    await expense(acct, cat, 1000, '2026-01-10');
    expect(
      weekendVsWeekdayShare.trigger(ctx('2026-01-11', { from: '2026-01-05', to: '2026-01-11' })),
    ).toBeNull();
  });
});

describe('fixedBillsPaidEarly', () => {
  it('fires when every fixed bill is paid before day 15', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 200000);
    const rent = await makeFixedCategory('Rent');
    await expense(acct, rent, 120000, '2026-01-03');
    const fired = fixedBillsPaidEarly.trigger(ctx('2026-01-10'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$1,200.00');
  });

  it('does not fire when a fixed bill is still unpaid', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 200000);
    await makeFixedCategory('Rent');
    expect(fixedBillsPaidEarly.trigger(ctx('2026-01-10'))).toBeNull();
  });
});

describe('carryoverSweptTotal', () => {
  it('fires with the month-to-date swept total', async () => {
    await freshChapter('2026-01-05');
    const checking = await makeAccount('Checking', 100000);
    const savings = await makeAccount('Savings', 0, 'savings');
    const cat = await makeWeeklyEnvelope('Fun', 10000);
    await store().sweepToSavings(cat, '2026-01-05', savings);
    void checking;
    const fired = carryoverSweptTotal.trigger(ctx('2026-01-20'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$100.00');
  });

  it('does not fire when nothing has been swept', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 100000);
    await makeWeeklyEnvelope('Fun', 10000);
    expect(carryoverSweptTotal.trigger(ctx('2026-01-20'))).toBeNull();
  });
});

describe('spendBelowTrailingMedian', () => {
  it('fires when last month is below the trailing 3-month median', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const cat = await makeFixedCategory('Misc');
    await expense(acct, cat, 30000, '2026-01-10');
    await expense(acct, cat, 20000, '2026-02-10');
    await expense(acct, cat, 10000, '2026-03-10');
    await expense(acct, cat, 5000, '2026-04-10'); // last month, below median (20000)
    const fired = spendBelowTrailingMedian.trigger(ctx('2026-05-10'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$50.00');
    expect(fired!.suffix).toBe('last month, below your trailing 3-month median of $200.00.');
  });

  it('does not fire when last month is at or above the median', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const cat = await makeFixedCategory('Misc');
    await expense(acct, cat, 30000, '2026-01-10');
    await expense(acct, cat, 20000, '2026-02-10');
    await expense(acct, cat, 10000, '2026-03-10');
    await expense(acct, cat, 25000, '2026-04-10'); // at/above median
    expect(spendBelowTrailingMedian.trigger(ctx('2026-05-10'))).toBeNull();
  });
});

describe('firstAllGreenMonth', () => {
  it('fires the first time every envelope closes under budget', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const cat = await makeMonthlyEnvelope('Groceries', 10000);
    await expense(acct, cat, 15000, '2026-01-10'); // over budget
    await expense(acct, cat, 8000, '2026-02-10'); // under budget — first green month
    const fired = firstAllGreenMonth.trigger(ctx('2026-03-10'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$20.00');
  });

  it('does not fire when an earlier month was already all green', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const cat = await makeMonthlyEnvelope('Groceries', 10000);
    await expense(acct, cat, 9000, '2026-01-10'); // already green
    await expense(acct, cat, 8000, '2026-02-10'); // green again, but not the FIRST
    expect(firstAllGreenMonth.trigger(ctx('2026-03-10'))).toBeNull();
  });
});

describe('recurringMerchantHits', () => {
  it('fires when the same title + amount recurs across 3+ months', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeFixedCategory('Subscriptions');
    await expense(acct, cat, 999, '2026-01-15', 'Netflix');
    await expense(acct, cat, 999, '2026-02-15', 'Netflix');
    await expense(acct, cat, 999, '2026-03-15', 'Netflix');
    const fired = recurringMerchantHits.trigger(ctx('2026-04-01'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Netflix');
    expect(fired!.amountText).toBe('$9.99');
    expect(fired!.suffix).toBe('has now charged you 3 times.');
  });

  it('does not fire with only two occurrences', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeFixedCategory('Subscriptions');
    await expense(acct, cat, 999, '2026-01-15', 'Netflix');
    await expense(acct, cat, 999, '2026-02-15', 'Netflix');
    expect(recurringMerchantHits.trigger(ctx('2026-04-01'))).toBeNull();
  });
});

describe('categoryShareShift', () => {
  it('fires on a double-digit percentage-point share shift', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const dining = await makeFixedCategory('Dining');
    const groceries = await makeFixedCategory('Groceries');
    await expense(acct, dining, 2000, '2026-02-10');
    await expense(acct, groceries, 8000, '2026-02-11');
    await expense(acct, dining, 6000, '2026-03-10');
    await expense(acct, groceries, 4000, '2026-03-11');
    const fired = categoryShareShift.trigger(ctx('2026-03-15'));
    expect(fired).not.toBeNull();
    expect(fired!.prefix).toBe('Dining spending shifted by');
    expect(fired!.amountText).toBe('$40.00');
    expect(fired!.suffix).toBe('month over month, now 60% of your total spend (was 20%).');
  });

  it('does not fire when category shares are unchanged', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const dining = await makeFixedCategory('Dining');
    const groceries = await makeFixedCategory('Groceries');
    await expense(acct, dining, 2000, '2026-02-10');
    await expense(acct, groceries, 8000, '2026-02-11');
    await expense(acct, dining, 2000, '2026-03-10');
    await expense(acct, groceries, 8000, '2026-03-11');
    expect(categoryShareShift.trigger(ctx('2026-03-15'))).toBeNull();
  });
});

describe('daysCoveredBySafeToSpend', () => {
  it('fires with a days-covered estimate from recent pace', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const coffee = await makeFixedCategory('Coffee');
    const fun = await makeWeeklyEnvelope('Fun', 7000);
    void fun;
    // 6000 total spend spread across the trailing 30 days (avg 200/day).
    await expense(acct, coffee, 3000, '2026-01-25');
    await expense(acct, coffee, 3000, '2026-02-08');
    const fired = daysCoveredBySafeToSpend.trigger(ctx('2026-02-20'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$70.00');
    expect(fired!.suffix).toBe('covers about 35 days at your recent pace.');
  });

  it('does not fire once this week is fully spent', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 500000);
    const fun = await makeWeeklyEnvelope('Fun', 7000);
    await expense(acct, fun, 7000, '2026-02-16'); // current week, fully spent
    expect(daysCoveredBySafeToSpend.trigger(ctx('2026-02-20'))).toBeNull();
  });
});

describe('envelopeZeroBorrowStreak', () => {
  it('fires on a 6-week no-borrow streak', async () => {
    await freshChapter('2026-01-05');
    await makeWeeklyEnvelope('Gas', 5000);
    const fired = envelopeZeroBorrowStreak.trigger(ctx('2026-02-16'));
    expect(fired).not.toBeNull();
    expect(fired!.suffix).toBe('6 weeks straight.');
  });

  it('does not fire when the most recent completed week borrowed', async () => {
    await freshChapter('2026-01-05');
    const cat = await makeWeeklyEnvelope('Gas', 5000);
    await store().borrowFromNextWeek(cat, '2026-02-09', cents(1000));
    expect(envelopeZeroBorrowStreak.trigger(ctx('2026-02-16'))).toBeNull();
  });
});

describe('savingsRatePercent', () => {
  it('fires with this month-to-date savings rate', async () => {
    await freshChapter('2026-01-05');
    const checking = await makeAccount('Checking', 0);
    const savings = await makeAccount('Savings', 0, 'savings');
    const src = await makeIncomeSource('Job', 100000, checking);
    await payIncome(src, '2026-01-05');
    await moveToSavings(checking, savings, 30000, '2026-01-10');
    const fired = savingsRatePercent.trigger(ctx('2026-01-20'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$300.00');
    expect(fired!.suffix).toBe('this month, 30% of your income so far.');
  });

  it('does not fire with no income this month', async () => {
    await freshChapter('2026-01-05');
    await makeAccount('Checking', 0);
    expect(savingsRatePercent.trigger(ctx('2026-01-20'))).toBeNull();
  });
});

describe('quietWeek', () => {
  it('fires when last week spent under half its budget', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 10000);
    await expense(acct, cat, 4000, '2026-01-13'); // week of Jan 12
    const fired = quietWeek.trigger(ctx('2026-01-19'));
    expect(fired).not.toBeNull();
    expect(fired!.amountText).toBe('$40.00');
    expect(fired!.suffix).toBe('of a $100.00 budget, a quiet week.');
  });

  it('does not fire when last week spent over half its budget', async () => {
    await freshChapter('2026-01-05');
    const acct = await makeAccount('Checking', 100000);
    const cat = await makeWeeklyEnvelope('Fun', 10000);
    await expense(acct, cat, 6000, '2026-01-13');
    expect(quietWeek.trigger(ctx('2026-01-19'))).toBeNull();
  });
});
