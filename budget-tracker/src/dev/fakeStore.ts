/**
 * In-memory fake implementing StoreContract.
 *
 * TODO(orchestrator): remove at merge — Team 1's real store adapter replaces
 * this. It exists so every Team 3 screen runs in Expo Go today with plausible,
 * self-consistent sample data (one month, July 2026).
 */
import type {
  StoreContract,
  Txn,
  ISODate,
  ColorKey,
  CategoryRef,
  DaySpend,
  SafeToSpend,
  EnvelopeWeekState,
  DayDetail,
  DayKpi,
  PlanVsActualSlice,
  GoalTracker,
  AddExpenseInput,
  AddIncomeInput,
  EditTxnPatch,
} from '../types/contracts';

// --- date helpers (TZ-safe, string based) ---------------------------------
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function parts(iso: ISODate): [number, number, number] {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return [y, m, d];
}
function iso(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function addDays(isoDate: ISODate, n: number): ISODate {
  const [y, m, d] = parts(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
/** 0 = Sunday … 6 = Saturday */
function dow(isoDate: ISODate): number {
  const [y, m, d] = parts(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function startOfWeek(isoDate: ISODate): ISODate {
  const wd = dow(isoDate); // Monday-based week
  const back = wd === 0 ? 6 : wd - 1;
  return addDays(isoDate, -back);
}
function monthKey(isoDate: ISODate): string {
  return isoDate.slice(0, 7);
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// --- deterministic pseudo-random ------------------------------------------
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idSeq = 1000;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

interface CatMeta extends CategoryRef {
  fixed: boolean;
  recurringDay?: number;
  weeklyPlan?: number;
}

const TODAY: ISODate = '2026-07-04';
const PNC = 'acct_pnc';
const DCU = 'acct_dcu';

const CATEGORIES: CatMeta[] = [
  { id: 'cat_rent', name: 'Rent', colorKey: 'rent', planned: 975, fixed: true, recurringDay: 1 },
  { id: 'cat_util', name: 'Utilities', colorKey: 'utilities', planned: 150, fixed: true, recurringDay: 1 },
  { id: 'cat_car', name: 'Car Payment', colorKey: 'car', planned: 400, fixed: true, recurringDay: 1 },
  { id: 'cat_ins', name: 'Insurance', colorKey: 'insurance', planned: 90, fixed: true, recurringDay: 1 },
  { id: 'cat_gas', name: 'Gas', colorKey: 'gas', planned: 173, fixed: false, weeklyPlan: 40 },
  { id: 'cat_food', name: 'Food', colorKey: 'food', planned: 200, fixed: false, weeklyPlan: 50 },
  { id: 'cat_fun', name: 'Fun Money', colorKey: 'fun', planned: 400, fixed: false, weeklyPlan: 100 },
];

function catById(id: string | null): CatMeta | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

// --- sample transaction seed ----------------------------------------------
function seedTxns(): Txn[] {
  const rnd = mulberry(20260704);
  const out: Txn[] = [];
  const [y, m] = parts(TODAY);
  const dim = daysInMonth(y, m);

  // Fixed bills on the 1st (calendar coral spikes).
  for (const c of CATEGORIES.filter((c) => c.fixed)) {
    out.push({
      id: nextId('txn'),
      date: iso(y, m, 1),
      kind: 'expense',
      amount: c.planned,
      categoryId: c.id,
      categoryName: c.name,
      colorKey: c.colorKey,
      accountId: PNC,
      note: `${c.name} — monthly`,
      isFixed: true,
    });
  }

  // Weekly paychecks on Wednesdays (split PNC/DCU).
  for (let d = 1; d <= dim; d++) {
    const date = iso(y, m, d);
    if (dow(date) === 3 && date <= TODAY) {
      const parent = nextId('inc');
      out.push({
        id: nextId('txn'), date, kind: 'income', amount: 810.63,
        categoryId: null, categoryName: 'Paycheck', colorKey: 'other',
        accountId: PNC, note: 'Weekly paycheck', splitParentId: parent,
      });
      out.push({
        id: nextId('txn'), date, kind: 'income', amount: 347.42,
        categoryId: null, categoryName: 'Paycheck', colorKey: 'other',
        accountId: DCU, note: 'Weekly paycheck — savings', splitParentId: parent,
      });
    }
  }

  // Variable spending on days up to today.
  const variable = CATEGORIES.filter((c) => !c.fixed);
  for (let d = 1; d <= dim; d++) {
    const date = iso(y, m, d);
    if (date > TODAY) continue;
    const count = Math.floor(rnd() * 3); // 0..2 expenses
    for (let i = 0; i < count; i++) {
      const c = variable[Math.floor(rnd() * variable.length)];
      const base = c.colorKey === 'fun' ? 12 + rnd() * 45 : 6 + rnd() * 28;
      out.push({
        id: nextId('txn'),
        date,
        kind: 'expense',
        amount: Math.round(base * 100) / 100,
        categoryId: c.id,
        categoryName: c.name,
        colorKey: c.colorKey,
        accountId: PNC,
        note: undefined,
      });
    }
  }

  // A little tutoring income mid-month.
  out.push({
    id: nextId('txn'), date: iso(y, m, 3), kind: 'income', amount: 120,
    categoryId: null, categoryName: 'Tutoring', colorKey: 'other',
    accountId: PNC, note: 'Tutoring session',
  });

  return out;
}

// --- envelope demo state (covers every carryover state) --------------------
function seedEnvelopes(): EnvelopeWeekState[] {
  return [
    {
      categoryId: 'cat_gas', name: 'Gas', colorKey: 'gas',
      planned: 40, spent: 22, remaining: 30, carryover: 12,
      borrowedFromNext: 0, state: 'bonus', blocks: 8,
    },
    {
      categoryId: 'cat_food', name: 'Food', colorKey: 'food',
      planned: 50, spent: 63, remaining: -13, carryover: 0,
      borrowedFromNext: 0, state: 'overflow', blocks: 8,
    },
    {
      categoryId: 'cat_fun', name: 'Fun Money', colorKey: 'fun',
      planned: 140, spent: 55, remaining: 85, carryover: 0,
      borrowedFromNext: 40, state: 'borrowed', blocks: 8,
    },
    {
      categoryId: 'cat_coffee', name: 'Coffee', colorKey: 'other',
      planned: 20, spent: 15, remaining: -3, carryover: -8,
      borrowedFromNext: 0, state: 'debt', blocks: 6,
    },
    {
      categoryId: 'cat_transit', name: 'Transit', colorKey: 'utilities',
      planned: 30, spent: 5, remaining: 25, carryover: 5,
      borrowedFromNext: 0, state: 'rolled', blocks: 6,
    },
  ];
}

// --- money helpers ---------------------------------------------------------
function parseDecimal(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function formatMoney(amount: number): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const [whole, frac] = abs.toFixed(2).split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}$${withCommas}.${frac}`;
}

// --- the store -------------------------------------------------------------
export function createFakeStore(): StoreContract {
  let txns = seedTxns();
  let envelopes = seedEnvelopes();
  let weeklyResetDone = false;
  let version = 1;
  const goal: GoalTracker = { id: 'goal_ef', name: 'Emergency Fund', target: 3500, saved: 1240 };
  const listeners = new Set<() => void>();

  const bump = () => {
    version += 1;
    listeners.forEach((l) => l());
  };

  const expensesOn = (date: ISODate) =>
    txns.filter((t) => t.date === date && t.kind === 'expense');
  const incomeOn = (date: ISODate) =>
    txns.filter((t) => t.date === date && t.kind === 'income');

  const daySpend = (date: ISODate, maxSpent: number): DaySpend => {
    const spent = expensesOn(date).reduce((s, t) => s + t.amount, 0);
    const income = incomeOn(date).reduce((s, t) => s + t.amount, 0);
    return {
      date,
      spent,
      income,
      isPayday: income > 0 && incomeOn(date).some((t) => t.note?.includes('paycheck')),
      hasFixedSpike: expensesOn(date).some((t) => t.isFixed),
      intensity: maxSpent > 0 ? Math.min(1, spent / maxSpent) : 0,
    };
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion() {
      return version;
    },
    getToday() {
      return TODAY;
    },
    getGreetingName() {
      return 'Rohan';
    },
    getCategories() {
      return CATEGORIES.map(({ id, name, colorKey, planned }) => ({ id, name, colorKey, planned }));
    },

    getSafeToSpend(anchor = TODAY) {
      const weekStart = startOfWeek(anchor);
      const weekPlan = envelopes.reduce((s, e) => s + e.planned, 0);
      let spentThisWeek = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        if (d > anchor) break;
        spentThisWeek += expensesOn(d)
          .filter((t) => !t.isFixed)
          .reduce((s, t) => s + t.amount, 0);
      }
      const amount = Math.max(0, weekPlan - spentThisWeek);
      const daysLeft = Math.max(1, 7 - (dow(anchor) === 0 ? 6 : dow(anchor) - 1));
      return {
        amount,
        periodLabel: 'left to spend this week',
        perDay: amount / daysLeft,
        daysLeft,
      };
    },

    getDaySpendTotals(startDate, days) {
      const raw: ISODate[] = [];
      for (let i = 0; i < days; i++) raw.push(addDays(startDate, i));
      const maxSpent = Math.max(
        1,
        ...raw.map((d) => expensesOn(d).reduce((s, t) => s + t.amount, 0))
      );
      return raw.map((d) => daySpend(d, maxSpent));
    },

    getPaydays(monthAnchor) {
      const [y, m] = parts(monthAnchor);
      const dim = daysInMonth(y, m);
      const out: ISODate[] = [];
      for (let d = 1; d <= dim; d++) {
        const date = iso(y, m, d);
        if (dow(date) === 3) out.push(date);
      }
      return out;
    },

    getEnvelopeWeekState() {
      return envelopes.map((e) => ({ ...e }));
    },

    needsWeeklyReset(anchor = TODAY) {
      // Demo: a reset is available once the week has any rolled/carryover state.
      return !weeklyResetDone;
    },

    getMonthHeatmap(monthAnchor) {
      const [y, m] = parts(monthAnchor);
      const dim = daysInMonth(y, m);
      const dates: ISODate[] = [];
      for (let d = 1; d <= dim; d++) dates.push(iso(y, m, d));
      const maxSpent = Math.max(
        1,
        ...dates.map((d) => expensesOn(d).reduce((s, t) => s + t.amount, 0))
      );
      return dates.map((d) => daySpend(d, maxSpent));
    },

    getDayDetail(date) {
      const dayTxns = txns
        .filter((t) => t.date === date)
        .slice()
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1));
      const income = dayTxns.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
      const spend = dayTxns.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
      const kpis: DayKpi[] = [
        { label: 'In', value: income, kind: 'income' },
        { label: 'Out', value: spend, kind: 'spend' },
        { label: 'Net', value: income - spend, kind: 'net' },
      ];
      const detail: DayDetail = { date, kpis, transactions: dayTxns };
      return detail;
    },

    getPlanVsActual(monthAnchor = TODAY) {
      const mk = monthKey(monthAnchor);
      return CATEGORIES.map<PlanVsActualSlice>((c) => {
        const actual = txns
          .filter((t) => t.kind === 'expense' && t.categoryId === c.id && monthKey(t.date) === mk)
          .reduce((s, t) => s + t.amount, 0);
        return {
          categoryId: c.id,
          name: c.name,
          colorKey: c.colorKey,
          planned: c.planned,
          actual: Math.round(actual * 100) / 100,
        };
      });
    },

    getGoal() {
      return { ...goal };
    },

    addExpense(input: AddExpenseInput) {
      const c = catById(input.categoryId);
      txns = [
        {
          id: nextId('txn'),
          date: input.date,
          kind: 'expense',
          amount: input.amount,
          categoryId: input.categoryId,
          categoryName: c?.name ?? 'Other',
          colorKey: c?.colorKey ?? 'other',
          accountId: input.accountId ?? PNC,
          note: input.note,
          isFixed: false,
        },
        ...txns,
      ];
      const env = envelopes.find((e) => e.categoryId === input.categoryId);
      if (env) {
        env.spent += input.amount;
        env.remaining = env.planned - env.spent;
        if (env.remaining < 0) env.state = 'overflow';
      }
      bump();
    },

    addIncome(input: AddIncomeInput) {
      const parent = nextId('inc');
      const legs =
        input.splits && input.splits.length > 0
          ? input.splits
          : [{ accountId: input.accountId ?? PNC, amount: input.amount }];
      const created: Txn[] = legs.map((leg) => ({
        id: nextId('txn'),
        date: input.date,
        kind: 'income',
        amount: leg.amount,
        categoryId: null,
        categoryName: input.note ?? 'Income',
        colorKey: 'other',
        accountId: leg.accountId,
        note: input.note,
        splitParentId: legs.length > 1 ? parent : null,
      }));
      txns = [...created, ...txns];
      bump();
    },

    editTransaction(id, patch: EditTxnPatch) {
      txns = txns.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.categoryId !== undefined) {
          const c = catById(patch.categoryId);
          next.categoryName = c?.name ?? t.categoryName;
          next.colorKey = c?.colorKey ?? t.colorKey;
        }
        return next;
      });
      bump();
    },

    deleteTransaction(id) {
      const removed = txns.find((t) => t.id === id) ?? null;
      if (removed) {
        txns = txns.filter((t) => t.id !== id);
        bump();
      }
      return removed;
    },

    restoreTransaction(txn) {
      txns = [txn, ...txns];
      bump();
    },

    rollForward() {
      // Roll positive balances into this week; clear carryover states.
      envelopes = envelopes.map((e) => ({
        ...e,
        carryover: 0,
        state: e.carryover > 0 ? 'rolled' : 'normal',
        planned: e.carryover > 0 ? e.planned + e.carryover : e.planned,
        remaining: (e.carryover > 0 ? e.planned + e.carryover : e.planned) - e.spent,
      }));
      weeklyResetDone = true;
      bump();
    },

    sweepToSavings() {
      // Sweep positive balances into the goal instead of rolling.
      const swept = envelopes.reduce((s, e) => s + Math.max(0, e.carryover), 0);
      goal.saved = Math.min(goal.target, goal.saved + swept);
      envelopes = envelopes.map((e) => ({
        ...e,
        carryover: 0,
        state: 'normal',
        remaining: e.planned - e.spent,
      }));
      weeklyResetDone = true;
      bump();
    },

    borrowFromNextWeek(categoryId, amount) {
      envelopes = envelopes.map((e) =>
        e.categoryId === categoryId
          ? {
              ...e,
              planned: e.planned + amount,
              remaining: e.remaining + amount,
              borrowedFromNext: e.borrowedFromNext + amount,
              state: 'borrowed',
            }
          : e
      );
      bump();
    },

    parseDecimal,
    formatMoney,
  };
}

export const fakeStore: StoreContract = createFakeStore();
export default fakeStore;
