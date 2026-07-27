/**
 * Team 4 (Insights) — the deterministic rule set (v0.3 §3.6 "delivered,
 * never fetched"). ~20 rules, each a pure trigger(ctx) over sync store reads
 * plus the date window. No prose generation, no network, no randomness: a
 * rule either sees its condition in the data or it doesn't.
 *
 * Every rule guards against "phantom history" — a category's envelope
 * config is applied retroactively by the store (getPlanVsActual /
 * getEnvelopeWeekState have no notion of when a budget was actually set), so
 * a naive lookback would treat the void before the chapter existed as an
 * infinite streak of suspiciously perfect $0-spend weeks. Rules that walk
 * backward in time stop at the active chapter's startedAt.
 */
import type { Cents } from '../lib/money';
import { addCents, cents, formatCents, sumCents, ZERO } from '../lib/money';
import type { CategoryConfig, ISODate, MonthKey, StoreContract } from '../types/contracts';
import { addDaysISO, dayOfWeek, weekStartOf } from '../format/dates';
import { dayNum, daysBetweenISO, monthLabel, prevWeekOf, shiftMonth, weeksInMonth } from './dateMath';
import type { FiredInsight, InsightRule, RuleContext } from './types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function envelopedCategories(store: StoreContract): CategoryConfig[] {
  return store.listCategories().filter((c) => c.envelope !== null);
}
function weeklyEnvelopedCategories(store: StoreContract): CategoryConfig[] {
  return envelopedCategories(store).filter((c) => c.cadence === 'weekly');
}
function chapterStartedAt(store: StoreContract): ISODate {
  return store.getActiveChapter().startedAt;
}
function plannedActualFor(
  store: StoreContract,
  month: MonthKey,
  categoryId: string,
): { planned: Cents; actual: Cents } | null {
  return store.getPlanVsActual(month).find((p) => p.categoryId === categoryId) ?? null;
}
function totalActualForMonth(store: StoreContract, month: MonthKey): Cents {
  return sumCents(store.getPlanVsActual(month).map((p) => p.actual));
}
function sumMap(values: IterableIterator<Cents> | Cents[]): Cents {
  return sumCents(Array.from(values));
}
function normalizeTitle(note: string): string {
  return note
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// 1. Category under budget: best month since {month}
// ---------------------------------------------------------------------------
const categoryBestMonthSince: InsightRule = {
  key: 'category-best-month-since',
  priority: 75,
  trigger(ctx) {
    const lastMonth = shiftMonth(ctx.today.slice(0, 7), -1);
    const chapterStart = chapterStartedAt(ctx.store).slice(0, 7);
    if (lastMonth < chapterStart) return null;

    let best: { cat: CategoryConfig; under: Cents; since: MonthKey } | null = null;
    for (const cat of envelopedCategories(ctx.store)) {
      const cur = plannedActualFor(ctx.store, lastMonth, cat.id);
      if (!cur || cur.planned <= 0 || cur.actual > cur.planned) continue;
      const currentUnder = (cur.planned - cur.actual) as Cents;
      if (currentUnder <= 0) continue;

      let oldest: MonthKey | null = null;
      let record = true;
      for (let i = 1; i <= 12; i++) {
        const m = shiftMonth(lastMonth, -i);
        if (m < chapterStart) break;
        const pv = plannedActualFor(ctx.store, m, cat.id);
        oldest = m;
        const under = pv && pv.actual <= pv.planned ? ((pv.planned - pv.actual) as Cents) : ZERO;
        if (under >= currentUnder) {
          record = false;
          break;
        }
      }
      if (!record || oldest === null) continue;
      if (!best || currentUnder > best.under) best = { cat, under: currentUnder, since: oldest };
    }
    if (!best) return null;
    return {
      prefix: `${best.cat.name} came in`,
      amountText: formatCents(best.under),
      suffix: `under budget, your best month since ${monthLabel(best.since)}.`,
      categoryId: best.cat.id,
      colorKey: best.cat.colorKey,
      eventDate: `${lastMonth}-01`,
    };
  },
};

// ---------------------------------------------------------------------------
// 2. Category streak under budget, N weeks
// ---------------------------------------------------------------------------
const categoryStreakUnderBudget: InsightRule = {
  key: 'category-streak-under-budget',
  priority: 62,
  trigger(ctx) {
    const chapterStartWeek = weekStartOf(chapterStartedAt(ctx.store));
    let best: { cat: CategoryConfig; streak: number; surplus: Cents } | null = null;
    for (const cat of weeklyEnvelopedCategories(ctx.store)) {
      let week = prevWeekOf(ctx.today);
      let streak = 0;
      let surplus: Cents = ZERO;
      for (let i = 0; i < 26; i++) {
        if (week < chapterStartWeek) break;
        const st = ctx.store.getEnvelopeWeekState(cat.id, week);
        if (st.configuredBudget <= 0 || st.spent > st.configuredBudget) break;
        streak += 1;
        surplus = addCents(surplus, (st.configuredBudget - st.spent) as Cents);
        week = addDaysISO(week, -7);
      }
      if (streak >= 3 && (!best || streak > best.streak)) best = { cat, streak, surplus };
    }
    if (!best) return null;
    return {
      prefix: `${best.cat.name} saved`,
      amountText: formatCents(best.surplus),
      suffix: `across a ${best.streak}-week streak under budget.`,
      categoryId: best.cat.id,
      colorKey: best.cat.colorKey,
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Spending pace vs last week
// ---------------------------------------------------------------------------
const spendPaceVsLastWeek: InsightRule = {
  key: 'spend-pace-vs-last-week',
  priority: 38,
  trigger(ctx) {
    const thisWeekStart = weekStartOf(ctx.today);
    const elapsed = daysBetweenISO(thisWeekStart, ctx.today); // 0..6
    const lastWeekStart = addDaysISO(thisWeekStart, -7);
    if (lastWeekStart < chapterStartedAt(ctx.store)) return null;
    const lastWeekSameSpanEnd = addDaysISO(lastWeekStart, elapsed);

    const thisTotal = sumMap(ctx.store.getDaySpendTotals({ from: thisWeekStart, to: ctx.today }).values());
    const lastTotal = sumMap(
      ctx.store.getDaySpendTotals({ from: lastWeekStart, to: lastWeekSameSpanEnd }).values(),
    );
    if (lastTotal <= 0) return null;
    const diff = (thisTotal - lastTotal) as Cents;
    if (Math.abs(diff) < 500) return null; // under $5 of drift is noise, not news

    return {
      prefix: 'You are pacing',
      amountText: formatCents(cents(Math.abs(diff))),
      suffix: diff > 0 ? "above last week's spending so far." : "below last week's spending so far.",
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 4. Biggest single expense of the period
// ---------------------------------------------------------------------------
const biggestExpenseOfPeriod: InsightRule = {
  key: 'biggest-expense-of-period',
  priority: 20,
  trigger(ctx) {
    const expenses = ctx.store.getTransactions(ctx.window).filter((t) => t.kind === 'expense');
    if (expenses.length === 0) return null;
    const biggest = expenses.reduce((a, b) => (b.amount > a.amount ? b : a));
    if (biggest.amount <= 0) return null;
    const cat = ctx.store.listCategories().find((c) => c.id === biggest.categoryId);
    return {
      prefix: 'Your biggest expense this period was',
      amountText: formatCents(biggest.amount),
      suffix: biggest.note ? `for ${biggest.note}.` : 'in a single purchase.',
      categoryId: biggest.categoryId,
      colorKey: cat?.colorKey,
      eventDate: biggest.date,
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Payday landed + amount reserved
// ---------------------------------------------------------------------------
const paydayLanded: InsightRule = {
  key: 'payday-landed',
  priority: 70,
  trigger(ctx) {
    const incomeToday = ctx.store
      .getTransactions({ from: ctx.today, to: ctx.today })
      .filter((t) => t.kind === 'income');
    if (incomeToday.length === 0) return null;
    const total = sumCents(incomeToday.map((t) => t.amount));
    if (total <= 0) return null;
    return {
      prefix: 'Payday landed. You reserved',
      amountText: formatCents(total),
      suffix: 'across your accounts.',
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 6. Savings milestone crossed
// ---------------------------------------------------------------------------
const SAVINGS_MILESTONES: Cents[] = [50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000].map(
  (n) => cents(n),
);

const savingsMilestone: InsightRule = {
  key: 'savings-milestone',
  priority: 95,
  trigger(ctx) {
    const yesterday = addDaysISO(ctx.today, -1);
    let best: { accountName: string; accountId: string; milestone: Cents } | null = null;
    for (const account of ctx.store.listAccounts().filter((a) => a.kind === 'savings')) {
      const balanceToday = ctx.store.getAccountBalance(account.id, ctx.today);
      const balanceYesterday = ctx.store.getAccountBalance(account.id, yesterday);
      for (const milestone of SAVINGS_MILESTONES) {
        if (balanceYesterday < milestone && balanceToday >= milestone) {
          if (!best || milestone > best.milestone) {
            best = { accountName: account.name, accountId: account.id, milestone };
          }
        }
      }
    }
    if (!best) return null;
    return {
      prefix: `${best.accountName} crossed`,
      amountText: formatCents(best.milestone),
      suffix: 'in savings.',
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 7. Envelope finished the week with exactly zero
// ---------------------------------------------------------------------------
const envelopeZeroFinish: InsightRule = {
  key: 'envelope-zero-finish',
  priority: 56,
  trigger(ctx) {
    const chapterStartWeek = weekStartOf(chapterStartedAt(ctx.store));
    const prevWeek = prevWeekOf(ctx.today);
    if (prevWeek < chapterStartWeek) return null;
    for (const cat of weeklyEnvelopedCategories(ctx.store)) {
      const st = ctx.store.getEnvelopeWeekState(cat.id, prevWeek);
      if (st.configuredBudget > 0 && st.remaining === 0) {
        return {
          prefix: `${cat.name} closed last week with`,
          amountText: formatCents(ZERO),
          suffix: 'left over, a perfect spend.',
          categoryId: cat.id,
          colorKey: cat.colorKey,
          eventDate: prevWeek,
        };
      }
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// 8. Borrow repaid on time
// ---------------------------------------------------------------------------
const borrowRepaidOnTime: InsightRule = {
  key: 'borrow-repaid-on-time',
  priority: 58,
  trigger(ctx) {
    const chapterStartWeek = weekStartOf(chapterStartedAt(ctx.store));
    const prevWeek = prevWeekOf(ctx.today);
    const twoWeeksAgo = addDaysISO(prevWeek, -7);
    if (twoWeeksAgo < chapterStartWeek) return null;
    for (const cat of weeklyEnvelopedCategories(ctx.store)) {
      const borrowWeek = ctx.store.getEnvelopeWeekState(cat.id, twoWeeksAgo);
      const repayWeek = ctx.store.getEnvelopeWeekState(cat.id, prevWeek);
      if (borrowWeek.borrowedIn > 0 && repayWeek.repaying > 0 && repayWeek.remaining >= 0) {
        return {
          prefix: `${cat.name} repaid`,
          amountText: formatCents(repayWeek.repaying),
          suffix: 'it borrowed, right on schedule.',
          categoryId: cat.id,
          colorKey: cat.colorKey,
          eventDate: prevWeek,
        };
      }
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// 9. No-spend day streak
// ---------------------------------------------------------------------------
const noSpendDayStreak: InsightRule = {
  key: 'no-spend-day-streak',
  priority: 50,
  trigger(ctx) {
    const chapterStart = chapterStartedAt(ctx.store);
    // An account with NO recorded activity at all isn't showing restraint —
    // it just hasn't been used yet. Require at least one real transaction
    // in the chapter's life before "no spend" can read as a streak (also
    // keeps a brand-new, all-empty store correctly silent).
    if (ctx.store.getTransactions({ from: chapterStart, to: ctx.today }).length === 0) return null;
    const spendMap = ctx.store.getDaySpendTotals(ctx.window);
    let streak = 0;
    let day = ctx.window.to;
    while (day >= ctx.window.from && day >= chapterStart) {
      const spent = spendMap.get(day) ?? ZERO;
      if (spent > 0) break;
      streak += 1;
      day = addDaysISO(day, -1);
    }
    if (streak < 3) return null;
    return {
      prefix: 'You have gone',
      suffix: `${streak} day${streak === 1 ? '' : 's'} without spending a cent.`,
      eventDate: ctx.window.to,
    };
  },
};

// ---------------------------------------------------------------------------
// 10. Weekend vs weekday spend share
// ---------------------------------------------------------------------------
const weekendVsWeekdayShare: InsightRule = {
  key: 'weekend-vs-weekday-share',
  priority: 35,
  trigger(ctx) {
    const spendMap = ctx.store.getDaySpendTotals(ctx.window);
    let weekend: Cents = ZERO;
    let total: Cents = ZERO;
    for (const [date, amount] of spendMap) {
      total = addCents(total, amount);
      const dow = dayOfWeek(date);
      if (dow === 0 || dow === 6) weekend = addCents(weekend, amount);
    }
    if (total <= 0) return null;
    const pct = Math.floor((weekend * 100) / total);
    if (pct < 40) return null;
    return {
      prefix: 'Weekends account for',
      amountText: formatCents(weekend),
      suffix: `of your spending this period, ${pct}% of the total.`,
      eventDate: ctx.window.to,
    };
  },
};

// ---------------------------------------------------------------------------
// 11. Fixed bills all paid before mid-month
// ---------------------------------------------------------------------------
const fixedBillsPaidEarly: InsightRule = {
  key: 'fixed-bills-paid-early',
  priority: 65,
  trigger(ctx) {
    if (dayNum(ctx.today) > 15) return null;
    const monthStart = `${ctx.today.slice(0, 7)}-01`;
    const fixedCats = ctx.store.listCategories().filter((c) => c.fixed);
    if (fixedCats.length === 0) return null;
    const txns = ctx.store
      .getTransactions({ from: monthStart, to: ctx.today })
      .filter((t) => t.kind === 'expense');

    let paidCount = 0;
    let total: Cents = ZERO;
    for (const cat of fixedCats) {
      const catTxns = txns.filter((t) => t.categoryId === cat.id);
      if (catTxns.length > 0) {
        paidCount += 1;
        total = addCents(total, sumCents(catTxns.map((t) => t.amount)));
      }
    }
    if (paidCount !== fixedCats.length) return null;
    return {
      prefix: 'You paid',
      amountText: formatCents(total),
      suffix: 'in fixed bills before the middle of the month.',
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 12. Carryover swept to savings total (month to date)
// ---------------------------------------------------------------------------
const carryoverSweptTotal: InsightRule = {
  key: 'carryover-swept-total',
  priority: 52,
  trigger(ctx) {
    const month = ctx.today.slice(0, 7);
    let total: Cents = ZERO;
    for (const cat of envelopedCategories(ctx.store)) {
      for (const week of weeksInMonth(month)) {
        if (week > ctx.today) continue;
        total = addCents(total, ctx.store.getEnvelopeWeekState(cat.id, week).sweptOut);
      }
    }
    if (total <= 0) return null;
    return {
      prefix: 'You swept',
      amountText: formatCents(total),
      suffix: 'to savings this month.',
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 13. Month's spend below trailing-3-month median
// ---------------------------------------------------------------------------
const spendBelowTrailingMedian: InsightRule = {
  key: 'spend-below-trailing-median',
  priority: 68,
  trigger(ctx) {
    const lastMonth = shiftMonth(ctx.today.slice(0, 7), -1);
    const chapterStart = chapterStartedAt(ctx.store).slice(0, 7);
    const priorMonths = [1, 2, 3].map((i) => shiftMonth(lastMonth, -i));
    if (lastMonth < chapterStart || priorMonths.some((m) => m < chapterStart)) return null;

    const lastTotal = totalActualForMonth(ctx.store, lastMonth);
    const priorTotals = priorMonths.map((m) => totalActualForMonth(ctx.store, m)).sort((a, b) => a - b);
    const median = priorTotals[1];
    if (lastTotal >= median) return null;
    return {
      prefix: 'You spent',
      amountText: formatCents(lastTotal),
      suffix: `last month, below your trailing 3-month median of ${formatCents(median)}.`,
      eventDate: `${lastMonth}-01`,
    };
  },
};

// ---------------------------------------------------------------------------
// 14. First month with all envelopes green
// ---------------------------------------------------------------------------
const firstAllGreenMonth: InsightRule = {
  key: 'first-all-green-month',
  priority: 100,
  trigger(ctx) {
    const lastMonth = shiftMonth(ctx.today.slice(0, 7), -1);
    const chapterStart = chapterStartedAt(ctx.store).slice(0, 7);
    if (lastMonth < chapterStart) return null;
    const cats = envelopedCategories(ctx.store);
    if (cats.length === 0) return null;

    const isAllGreen = (month: MonthKey): boolean =>
      cats.every((c) => {
        const pv = plannedActualFor(ctx.store, month, c.id);
        return !pv || pv.planned <= 0 || pv.actual <= pv.planned;
      });

    if (!isAllGreen(lastMonth)) return null;

    let m = chapterStart;
    for (let guard = 0; guard < 240 && m < lastMonth; guard++) {
      if (isAllGreen(m)) return null; // a prior month already did this — not the first
      m = shiftMonth(m, 1);
    }

    const surplus = sumCents(
      cats.map((c) => {
        const pv = plannedActualFor(ctx.store, lastMonth, c.id);
        return pv && pv.planned > pv.actual ? ((pv.planned - pv.actual) as Cents) : ZERO;
      }),
    );
    return {
      prefix:
        'Every envelope came in under budget last month, for the first time since you started tracking. You kept',
      amountText: formatCents(surplus),
      suffix: 'unspent across your envelopes.',
      eventDate: `${lastMonth}-01`,
    };
  },
};

// ---------------------------------------------------------------------------
// 15. Recurring same-merchant hits (subscription-detection groundwork)
// ---------------------------------------------------------------------------
interface MerchantGroup {
  title: string;
  amount: Cents;
  count: number;
  months: Set<MonthKey>;
  latest: ISODate;
}

const recurringMerchantHits: InsightRule = {
  key: 'recurring-merchant-hits',
  priority: 42,
  trigger(ctx) {
    const from = addDaysISO(ctx.today, -180);
    const txns = ctx.store
      .getTransactions({ from, to: ctx.today })
      .filter((t) => t.kind === 'expense' && t.note && t.note.trim().length > 0);

    const groups = new Map<string, MerchantGroup>();
    for (const t of txns) {
      const title = normalizeTitle(t.note as string);
      if (!title) continue;
      const key = `${title}|${t.amount}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.months.add(t.date.slice(0, 7));
        if (t.date > existing.latest) existing.latest = t.date;
      } else {
        groups.set(key, { title, amount: t.amount, count: 1, months: new Set([t.date.slice(0, 7)]), latest: t.date });
      }
    }

    let best: MerchantGroup | null = null;
    for (const g of groups.values()) {
      if (g.count >= 3 && g.months.size >= 3 && (!best || g.count > best.count)) best = g;
    }
    if (!best) return null;
    return {
      prefix: titleCase(best.title),
      amountText: formatCents(best.amount),
      suffix: `has now charged you ${best.count} times.`,
      eventDate: best.latest,
    };
  },
};

// ---------------------------------------------------------------------------
// 16. Largest category share shift vs last month
// ---------------------------------------------------------------------------
const categoryShareShift: InsightRule = {
  key: 'category-share-shift',
  priority: 40,
  trigger(ctx) {
    const currentMonth = ctx.today.slice(0, 7);
    const lastMonth = shiftMonth(currentMonth, -1);
    const chapterStart = chapterStartedAt(ctx.store).slice(0, 7);
    if (lastMonth < chapterStart) return null;

    const totalNow = totalActualForMonth(ctx.store, currentMonth);
    const totalPrev = totalActualForMonth(ctx.store, lastMonth);
    if (totalNow <= 0 || totalPrev <= 0) return null;

    let best: {
      cat: CategoryConfig;
      deltaPct: number;
      deltaAmount: Cents;
      pctNow: number;
      pctPrev: number;
    } | null = null;
    for (const cat of ctx.store.listCategories()) {
      const now = plannedActualFor(ctx.store, currentMonth, cat.id)?.actual ?? ZERO;
      const prev = plannedActualFor(ctx.store, lastMonth, cat.id)?.actual ?? ZERO;
      const pctNow = Math.floor((now * 100) / totalNow);
      const pctPrev = Math.floor((prev * 100) / totalPrev);
      const deltaPct = Math.abs(pctNow - pctPrev);
      if (deltaPct >= 10 && (!best || deltaPct > best.deltaPct)) {
        best = { cat, deltaPct, deltaAmount: cents(Math.abs(now - prev)), pctNow, pctPrev };
      }
    }
    if (!best) return null;
    return {
      prefix: `${best.cat.name} spending shifted by`,
      amountText: formatCents(best.deltaAmount),
      suffix: `month over month, now ${best.pctNow}% of your total spend (was ${best.pctPrev}%).`,
      categoryId: best.cat.id,
      colorKey: best.cat.colorKey,
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 17. Days covered by safe-to-spend
// ---------------------------------------------------------------------------
const daysCoveredBySafeToSpend: InsightRule = {
  key: 'days-covered-by-safe-to-spend',
  priority: 60,
  trigger(ctx) {
    const week = weekStartOf(ctx.today);
    const safe = ctx.store.getSafeToSpend(week);
    if (safe <= 0) return null;

    const from = addDaysISO(ctx.today, -30);
    const to = addDaysISO(ctx.today, -1);
    const total = sumMap(ctx.store.getDaySpendTotals({ from, to }).values());
    const avgDaily = Math.floor(total / 30);
    if (avgDaily <= 0) return null;
    const days = Math.floor(safe / avgDaily);
    if (days < 1) return null;

    return {
      prefix: 'Your safe-to-spend of',
      amountText: formatCents(safe),
      suffix: `covers about ${days} day${days === 1 ? '' : 's'} at your recent pace.`,
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 18. Envelope zero-borrow streak
// ---------------------------------------------------------------------------
const envelopeZeroBorrowStreak: InsightRule = {
  key: 'envelope-zero-borrow-streak',
  priority: 54,
  trigger(ctx) {
    const chapterStartWeek = weekStartOf(chapterStartedAt(ctx.store));
    let best: { cat: CategoryConfig; streak: number } | null = null;
    for (const cat of weeklyEnvelopedCategories(ctx.store)) {
      let week = prevWeekOf(ctx.today);
      let streak = 0;
      for (let i = 0; i < 26; i++) {
        if (week < chapterStartWeek) break;
        const st = ctx.store.getEnvelopeWeekState(cat.id, week);
        if (st.borrowedIn > 0) break;
        streak += 1;
        week = addDaysISO(week, -7);
      }
      if (streak >= 4 && (!best || streak > best.streak)) best = { cat, streak };
    }
    if (!best) return null;
    return {
      prefix: `${best.cat.name} has not borrowed from next week in`,
      suffix: `${best.streak} weeks straight.`,
      categoryId: best.cat.id,
      colorKey: best.cat.colorKey,
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 19. Savings rate: percent of income this month
// ---------------------------------------------------------------------------
const savingsRatePercent: InsightRule = {
  key: 'savings-rate-percent',
  priority: 55,
  trigger(ctx) {
    const monthStart = `${ctx.today.slice(0, 7)}-01`;
    const txns = ctx.store.getTransactions({ from: monthStart, to: ctx.today });
    const income = sumCents(txns.filter((t) => t.kind === 'income').map((t) => t.amount));
    if (income <= 0) return null;
    const savingsIds = new Set(
      ctx.store.listAccounts().filter((a) => a.kind === 'savings').map((a) => a.id),
    );
    const savings = sumCents(
      txns.filter((t) => t.kind === 'transfer_in' && savingsIds.has(t.accountId)).map((t) => t.amount),
    );
    const pct = Math.floor((savings * 100) / income);
    return {
      prefix: 'You have saved',
      amountText: formatCents(savings),
      suffix: `this month, ${pct}% of your income so far.`,
      eventDate: ctx.today,
    };
  },
};

// ---------------------------------------------------------------------------
// 20. Quiet week (spend < 50% of budget)
// ---------------------------------------------------------------------------
const quietWeek: InsightRule = {
  key: 'quiet-week',
  priority: 45,
  trigger(ctx) {
    const chapterStartWeek = weekStartOf(chapterStartedAt(ctx.store));
    const prevWeek = prevWeekOf(ctx.today);
    if (prevWeek < chapterStartWeek) return null;

    let totalSpent: Cents = ZERO;
    let totalBudget: Cents = ZERO;
    for (const cat of weeklyEnvelopedCategories(ctx.store)) {
      const st = ctx.store.getEnvelopeWeekState(cat.id, prevWeek);
      totalSpent = addCents(totalSpent, st.spent);
      totalBudget = addCents(totalBudget, st.configuredBudget);
    }
    if (totalBudget <= 0) return null;
    if (totalSpent * 2 > totalBudget) return null; // not quiet (over 50%)

    return {
      prefix: 'Last week you spent just',
      amountText: formatCents(totalSpent),
      suffix: `of a ${formatCents(totalBudget)} budget, a quiet week.`,
      eventDate: prevWeek,
    };
  },
};

// ---------------------------------------------------------------------------

/** All shipped rules. Order is irrelevant to ranking (the engine sorts by
 * priority, then eventDate recency, then key) but is kept human-scannable. */
export const ALL_RULES: readonly InsightRule[] = [
  categoryBestMonthSince,
  categoryStreakUnderBudget,
  spendPaceVsLastWeek,
  biggestExpenseOfPeriod,
  paydayLanded,
  savingsMilestone,
  envelopeZeroFinish,
  borrowRepaidOnTime,
  noSpendDayStreak,
  weekendVsWeekdayShare,
  fixedBillsPaidEarly,
  carryoverSweptTotal,
  spendBelowTrailingMedian,
  firstAllGreenMonth,
  recurringMerchantHits,
  categoryShareShift,
  daysCoveredBySafeToSpend,
  envelopeZeroBorrowStreak,
  savingsRatePercent,
  quietWeek,
];

// Exported individually for focused unit tests.
export {
  categoryBestMonthSince,
  categoryStreakUnderBudget,
  spendPaceVsLastWeek,
  biggestExpenseOfPeriod,
  paydayLanded,
  savingsMilestone,
  envelopeZeroFinish,
  borrowRepaidOnTime,
  noSpendDayStreak,
  weekendVsWeekdayShare,
  fixedBillsPaidEarly,
  carryoverSweptTotal,
  spendBelowTrailingMedian,
  firstAllGreenMonth,
  recurringMerchantHits,
  categoryShareShift,
  daysCoveredBySafeToSpend,
  envelopeZeroBorrowStreak,
  savingsRatePercent,
  quietWeek,
};

export type { FiredInsight, InsightRule, RuleContext };
