/**
 * Stepped savings + goal-funding projections (handoff §3.9, §3.10).
 *
 * TWO HOUSE RULES (from the spec):
 *   1. Stepped, never smooth — one discrete step per week, hard right angles.
 *      This module emits weekly points; the chart draws the steps.
 *   2. Never invent a number — the projection is the median of the last three
 *      completed months' income and per-envelope spend, minus the scheduled
 *      recurring bills that actually land in each week. No ML, no floats on
 *      money, and no clock: every entry point takes `today` explicitly.
 *
 * The math splits into PURE helpers (fully unit-testable with fabricated
 * inputs, exact to the cent) and thin STORE-FACING functions that assemble the
 * inputs from the committed store caches (the same read pattern as src/ledger).
 */
import { useBudgetStore } from '../store';
import { addCents, cents, subCents, sumCents, ZERO, type Cents } from '../lib/money';
import type { ISODate } from '../types/contracts';
import { lowerMedianCents, trailingCalendarMonths, type MonthKey } from './median';

// ---------------------------------------------------------------------------
// Pure date helpers (local calendar math; never reads a clock).
// ---------------------------------------------------------------------------
function toDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmt(dt: Date): ISODate {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDaysISO(iso: ISODate, n: number): ISODate {
  const dt = toDate(iso);
  dt.setDate(dt.getDate() + n);
  return fmt(dt);
}
/** Monday of the week containing `iso`. */
function mondayOfISO(iso: ISODate): ISODate {
  const dt = toDate(iso);
  const offset = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - offset);
  return fmt(dt);
}
function monthKeyOfISO(iso: ISODate): MonthKey {
  return iso.slice(0, 7);
}
/** Days in a 'YYYY-MM' month (handles Feb/leap years). */
function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
/** Last calendar day of a month key as an ISODate. */
function lastDayOfMonth(month: MonthKey): ISODate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Pure projection math.
// ---------------------------------------------------------------------------

/** A recurring bill, reduced to only what the week-landing math needs. */
export interface BillLite {
  amountCents: Cents;
  /** 1..31, clamp-to-month-end (a 31 falls on Feb 28/29, Apr 30, …). */
  dueDay: number;
  active: boolean;
}

export interface ProjectionPoint {
  weekStartISO: ISODate;
  projectedCents: Cents;
}

export interface GoalFunding {
  /** When the goal reaches its target at the current pace; null if never (pace <= 0) or unknown (no history). */
  fundedAroundISO: ISODate | null;
  /** The steady weekly net-savings pace; null when there is no history to derive it from. */
  weeklyPaceCents: Cents | null;
}

/**
 * Convert a monthly cent figure to a weekly one via the exact annual identity
 * (12 months, 52 weeks): floor(monthly * 12 / 52). Integer-only; the floor
 * biases conservative (a projected inflow is never rounded up). Applied
 * uniformly to income and spend so neither side is favored.
 */
export function weeklyFromMonthly(monthlyCents: Cents): Cents {
  // monthlyCents is a safe integer; * 12 stays safe for realistic amounts.
  return cents(Math.floor((monthlyCents * 12) / 52));
}

/**
 * Total of the ACTIVE bills whose resolved due date falls inside the week
 * [weekStartISO, weekStartISO + 6 days]. A week can straddle a month boundary,
 * so each of the (up to two) months it touches is checked with clamp-to-month-
 * end semantics; a bill lands in exactly one week per month it is due, so no
 * double counting. Pure function of the bills and the week.
 */
export function billsDueInWeek(bills: readonly BillLite[], weekStartISO: ISODate): Cents {
  const end = addDaysISO(weekStartISO, 6);
  const months = new Set<MonthKey>([monthKeyOfISO(weekStartISO), monthKeyOfISO(end)]);
  let total: Cents = ZERO;
  for (const b of bills) {
    if (!b.active) continue;
    for (const m of months) {
      const day = Math.min(b.dueDay, daysInMonth(m));
      const due = `${m}-${String(day).padStart(2, '0')}`;
      if (due >= weekStartISO && due <= end) {
        total = addCents(total, b.amountCents);
        break; // count this bill at most once even if two months are in view
      }
    }
  }
  return total;
}

/**
 * Stepped weekly savings points. Point 0 is the CURRENT balance at
 * `anchorWeekStart` (the present week's Monday). Each subsequent point i steps
 * one week forward and applies the weekly net: + median income − median spend −
 * the bills that land in week i. The anchor (current, partly-elapsed) week
 * accrues no step; the first delta lands on point 1. Exact to the cent.
 */
export function stepSavings(input: {
  startCents: Cents;
  weeks: number;
  weeklyIncomeCents: Cents;
  weeklySpendCents: Cents;
  bills: readonly BillLite[];
  anchorWeekStart: ISODate;
}): ProjectionPoint[] {
  const { startCents, weeks, weeklyIncomeCents, weeklySpendCents, bills, anchorWeekStart } = input;
  const points: ProjectionPoint[] = [
    { weekStartISO: anchorWeekStart, projectedCents: startCents },
  ];
  let balance = startCents;
  for (let i = 1; i <= weeks; i++) {
    const weekStart = addDaysISO(anchorWeekStart, 7 * i);
    const billsOut = billsDueInWeek(bills, weekStart);
    const delta = subCents(subCents(weeklyIncomeCents, weeklySpendCents), billsOut);
    balance = addCents(balance, delta);
    points.push({ weekStartISO: weekStart, projectedCents: balance });
  }
  return points;
}

/**
 * When a goal is fully funded at a steady weekly pace. Pure:
 *   - `weeklyPaceCents` null (no history) => never known => null date.
 *   - already at/over target => funded as of `today`.
 *   - pace <= 0 => never funded => null date (never invent a date).
 *   - else => today's Monday + ceil(remaining / pace) weeks.
 */
export function fundingDate(input: {
  currentCents: Cents;
  targetCents: Cents;
  weeklyPaceCents: Cents | null;
  today: ISODate;
}): GoalFunding {
  const { currentCents, targetCents, weeklyPaceCents, today } = input;
  if (weeklyPaceCents === null) {
    return { fundedAroundISO: null, weeklyPaceCents: null };
  }
  const remaining = targetCents - currentCents;
  if (remaining <= 0) {
    return { fundedAroundISO: today, weeklyPaceCents };
  }
  if (weeklyPaceCents <= 0) {
    return { fundedAroundISO: null, weeklyPaceCents };
  }
  const weeksNeeded = Math.ceil(remaining / weeklyPaceCents);
  return {
    fundedAroundISO: addDaysISO(mondayOfISO(today), 7 * weeksNeeded),
    weeklyPaceCents,
  };
}

// ---------------------------------------------------------------------------
// Store-facing assembly.
// ---------------------------------------------------------------------------

interface WeeklyRates {
  weeklyIncomeCents: Cents;
  weeklySpendCents: Cents;
  /** How many of the trailing 3 calendar months had any activity. 0 => no basis. */
  historyCount: number;
}

/**
 * The median weekly income and total median weekly per-envelope spend, read
 * from the trailing three COMPLETED calendar months before `today`'s month.
 * Only months with any activity count as history (a month with no data is not
 * padded with a zero, per §3.9 "use what exists"); within a history month an
 * envelope's zero-spend IS a real data point. Zero history months => rates of
 * zero and historyCount 0 (callers treat that as "no projection").
 */
function medianWeeklyRates(
  store: ReturnType<typeof useBudgetStore.getState>,
  today: ISODate,
): WeeklyRates {
  const refMonth = monthKeyOfISO(today);
  const months = trailingCalendarMonths(refMonth, 3);
  const from = `${months[0]}-01`;
  const to = lastDayOfMonth(months[months.length - 1]);
  const txns = store.getTransactions({ from, to });

  const active = new Set<MonthKey>(txns.map((t) => monthKeyOfISO(t.date)));
  const history = months.filter((m) => active.has(m));
  if (history.length === 0) {
    return { weeklyIncomeCents: ZERO, weeklySpendCents: ZERO, historyCount: 0 };
  }

  // Income median (single series across history months).
  const incomeByMonth = new Map<MonthKey, Cents>();
  for (const m of history) incomeByMonth.set(m, ZERO);
  for (const t of txns) {
    if (t.kind !== 'income') continue;
    const m = monthKeyOfISO(t.date);
    if (incomeByMonth.has(m)) incomeByMonth.set(m, addCents(incomeByMonth.get(m)!, t.amount));
  }
  const incomeMedian = lowerMedianCents(history.map((m) => incomeByMonth.get(m)!));
  const weeklyIncomeCents = incomeMedian === null ? ZERO : weeklyFromMonthly(incomeMedian);

  // Per-envelope spend median, summed across envelopes into one weekly figure.
  const envelopes = store.listCategories().filter((c) => c.envelope !== null);
  const perEnvelopeWeekly: Cents[] = [];
  for (const env of envelopes) {
    const byMonth = new Map<MonthKey, Cents>();
    for (const m of history) byMonth.set(m, ZERO);
    for (const t of txns) {
      if (t.kind !== 'expense' || t.categoryId !== env.id) continue;
      const m = monthKeyOfISO(t.date);
      if (byMonth.has(m)) byMonth.set(m, addCents(byMonth.get(m)!, t.amount));
    }
    const median = lowerMedianCents(history.map((m) => byMonth.get(m)!));
    perEnvelopeWeekly.push(median === null ? ZERO : weeklyFromMonthly(median));
  }
  const weeklySpendCents = sumCents(perEnvelopeWeekly);

  return { weeklyIncomeCents, weeklySpendCents, historyCount: history.length };
}

/** Active recurring bills, as the pure math's BillLite shape. */
function activeBills(store: ReturnType<typeof useBudgetStore.getState>): BillLite[] {
  return store
    .getRecurringBills()
    .filter((b) => b.active)
    .map((b) => ({ amountCents: b.amountCents, dueDay: b.dueDay, active: true }));
}

/** Current total savings balance across all savings-kind accounts, as of `today`. */
function totalSavings(
  store: ReturnType<typeof useBudgetStore.getState>,
  today: ISODate,
): Cents {
  return sumCents(
    store
      .listAccounts()
      .filter((a) => a.kind === 'savings')
      .map((a) => store.getAccountBalance(a.id, today)),
  );
}

/**
 * Weekly stepped savings projection for the next `weeks` weeks, starting from
 * the current total savings balance. Returns `weeks + 1` points (index 0 =
 * today's week). `today` is required (no clock).
 */
export function projectSavings(weeks: number, today: ISODate): ProjectionPoint[] {
  if (!Number.isInteger(weeks) || weeks < 0) {
    throw new Error('projectSavings: weeks must be a non-negative whole number');
  }
  const store = useBudgetStore.getState();
  const { weeklyIncomeCents, weeklySpendCents } = medianWeeklyRates(store, today);
  return stepSavings({
    startCents: totalSavings(store, today),
    weeks,
    weeklyIncomeCents,
    weeklySpendCents,
    bills: activeBills(store),
    anchorWeekStart: mondayOfISO(today),
  });
}

/**
 * When a named goal is funded at the current median pace. The pace is the same
 * median weekly net used by the savings projection, less the AVERAGED weekly
 * cost of active recurring bills (a per-month bill amortized as
 * weeklyFromMonthly of its amount) — a smooth pace, since a single funding date
 * cannot carry lumpy per-week bills. Progress is read via the store's
 * `goalProgress` (linked savings account, or all-savings when unlinked).
 */
export function projectGoalFunding(goalId: string, today: ISODate): GoalFunding {
  const store = useBudgetStore.getState();
  const progress = store.goalProgress(goalId, today);
  const { weeklyIncomeCents, weeklySpendCents, historyCount } = medianWeeklyRates(store, today);

  if (historyCount === 0) {
    return { fundedAroundISO: null, weeklyPaceCents: null };
  }
  const weeklyBillsAvg = sumCents(
    activeBills(store).map((b) => weeklyFromMonthly(b.amountCents)),
  );
  const weeklyPaceCents = subCents(subCents(weeklyIncomeCents, weeklySpendCents), weeklyBillsAvg);

  return fundingDate({
    currentCents: progress.currentCents,
    targetCents: progress.targetCents,
    weeklyPaceCents,
    today,
  });
}
