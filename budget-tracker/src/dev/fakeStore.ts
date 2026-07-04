/**
 * In-memory fake implementing the canonical StoreContract (rev 3) plus the
 * ReactiveStore change-source wrapper that Team 3's StoreProvider consumes.
 *
 * TODO(orchestrator): remove at merge — Team 1's real store replaces this.
 * It exists so every Team 3 screen runs in Expo Go today with plausible,
 * self-consistent sample data (current month, seeded deterministically).
 *
 * Money: everything here is integer Cents via src/lib/money.ts — no floats
 * in money paths (CONTRACTS.md rule 1).
 */
import {
  Cents,
  cents,
  ZERO,
  addCents,
  subCents,
  sumCents,
  maxCents,
  allocate,
} from '../lib/money';
import type {
  StoreContract,
  TransactionRecord,
  AccountConfig,
  CategoryConfig,
  IncomeSourceConfig,
  Chapter,
  CarryoverEntry,
  EnvelopeWeekState,
  EvaluationReadPort,
  ISODate,
  MonthKey,
  WeekStart,
  DateRange,
} from '../types/contracts';
import { UNDO_WINDOW_MS } from '../types/contracts';
import type { ReactiveStore } from '../providers/StoreProvider';
import {
  todayISO,
  addDaysISO,
  dayOfWeek,
  weekStartOf,
  weekRange,
  monthKeyOf,
  monthRange,
  eachDay,
  toISO,
} from '../format/dates';

// --- deterministic pseudo-random --------------------------------------------
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
/** Fake-local id mint. The real app uses src/lib/ids.ts (Team 1). */
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

// --- seed data ---------------------------------------------------------------
const TODAY = todayISO();
const THIS_WEEK = weekStartOf(TODAY);
const PREV_WEEK = addDaysISO(THIS_WEEK, -7);
const NEXT_WEEK = addDaysISO(THIS_WEEK, 7);

interface FakeState {
  chapter: Chapter;
  accounts: AccountConfig[];
  incomeSources: IncomeSourceConfig[];
  categories: CategoryConfig[];
  /** Expected monthly amount for fixed categories (plan basis for the Pond). */
  fixedPlan: Map<string, Cents>;
  txns: TransactionRecord[];
  carryover: CarryoverEntry[];
  /** Soft-deleted txns awaiting the undo window. */
  trash: Map<string, TransactionRecord>;
}

function ym(isoDate: ISODate): [number, number] {
  const [y, m] = isoDate.split('-').map((n) => parseInt(n, 10));
  return [y, m];
}

/** Most recent Wednesday on/before today — a plausible weekly anchor. */
function anchorWednesday(): ISODate {
  let d = TODAY;
  while (dayOfWeek(d) !== 3) d = addDaysISO(d, -1);
  return d;
}

function seed(): FakeState {
  const spending: AccountConfig = {
    id: nextId('acct'),
    name: 'Everyday Spending',
    institution: 'PNC',
    kind: 'spending',
    startingBalance: cents(81063),
    openedOn: addDaysISO(TODAY, -90),
  };
  const savings: AccountConfig = {
    id: nextId('acct'),
    name: 'Rainy Day Savings',
    institution: 'DCU',
    kind: 'savings',
    startingBalance: cents(34742),
    openedOn: addDaysISO(TODAY, -90),
  };

  const paycheck: IncomeSourceConfig = {
    id: nextId('inc'),
    name: 'Paycheck',
    amount: cents(115805),
    schedule: { kind: 'weekly', anchorDate: anchorWednesday() },
    splits: [
      { accountId: spending.id, ratio: 70 },
      { accountId: savings.id, ratio: 30 },
    ],
  };
  const tutoring: IncomeSourceConfig = {
    id: nextId('inc'),
    name: 'Tutoring',
    amount: cents(12000),
    schedule: { kind: 'monthly', anchorDate: toISO(...ym(TODAY), 3) },
    splits: [{ accountId: spending.id, ratio: 1 }],
  };

  const mkCat = (
    name: string,
    colorKey: CategoryConfig['colorKey'],
    fixed: boolean,
    weeklyBudget: Cents | null,
  ): CategoryConfig => ({
    id: nextId('cat'),
    name,
    colorKey,
    fixed,
    envelope:
      weeklyBudget === null
        ? null
        : { period: 'weekly', budget: weeklyBudget, carryoverDefault: 'ask' },
  });

  const rent = mkCat('Rent', 'violet', true, null);
  const utilities = mkCat('Utilities', 'violet', true, null);
  const carPayment = mkCat('Car Payment', 'violet', true, null);
  const food = mkCat('Food', 'amber', false, cents(5000));
  const gas = mkCat('Gas & Transit', 'blue', false, cents(4000));
  const fun = mkCat('Fun', 'pink', false, cents(10000));
  const savingsCat = mkCat('Savings', 'mint', true, null);
  const categories = [rent, utilities, carPayment, food, gas, fun, savingsCat];

  const fixedPlan = new Map<string, Cents>([
    [rent.id, cents(97500)],
    [utilities.id, cents(15000)],
    [carPayment.id, cents(40000)],
  ]);

  const txns: TransactionRecord[] = [];
  const rnd = mulberry(20260704);
  const mr = monthRange(TODAY);

  // Fixed bills on the 1st (the calendar coral spike).
  for (const [catId, amount] of [
    [rent.id, cents(97500)],
    [utilities.id, cents(15000)],
    [carPayment.id, cents(40000)],
  ] as Array<[string, Cents]>) {
    txns.push({
      id: nextId('txn'),
      accountId: spending.id,
      categoryId: catId,
      amount,
      kind: 'expense',
      date: mr.from,
      note: 'Monthly bill',
    });
  }

  // Weekly paychecks on Wednesdays up to today, split via allocate().
  for (const d of eachDay({ from: mr.from, to: TODAY })) {
    if (dayOfWeek(d) === 3) {
      const parts = allocate(paycheck.amount, paycheck.splits.map((sp) => sp.ratio));
      txns.push({
        id: nextId('txn'),
        accountId: spending.id,
        categoryId: savingsCat.id,
        amount: paycheck.amount,
        kind: 'income',
        date: d,
        note: paycheck.name,
        incomeSplit: paycheck.splits.map((sp, i) => ({ accountId: sp.accountId, amount: parts[i] })),
      });
    }
  }

  // Tutoring income on the 3rd, if it has happened yet this month.
  const third = toISO(...ym(TODAY), 3);
  if (third <= TODAY) {
    txns.push({
      id: nextId('txn'),
      accountId: spending.id,
      categoryId: savingsCat.id,
      amount: tutoring.amount,
      kind: 'income',
      date: third,
      note: tutoring.name,
      incomeSplit: [{ accountId: spending.id, amount: tutoring.amount }],
    });
  }

  // Deterministic variable spending up to today.
  const variable = [food, gas, fun];
  for (const d of eachDay({ from: mr.from, to: TODAY })) {
    const count = Math.floor(rnd() * 3); // 0..2 per day
    for (let i = 0; i < count; i++) {
      const c = variable[Math.floor(rnd() * variable.length)];
      const base = c === fun ? 800 + Math.floor(rnd() * 4200) : 400 + Math.floor(rnd() * 2600);
      txns.push({
        id: nextId('txn'),
        accountId: spending.id,
        categoryId: c.id,
        amount: cents(base),
        kind: 'expense',
        date: d,
        note: null,
      });
    }
  }

  // Push Food over budget this week so overflow + borrow UI is exercised.
  txns.push({
    id: nextId('txn'),
    accountId: spending.id,
    categoryId: food.id,
    amount: cents(3450),
    kind: 'expense',
    date: THIS_WEEK <= TODAY ? TODAY : THIS_WEEK,
    note: 'Grocery restock',
  });

  // Carryover entries demonstrating meter states (conservation-legal pairs).
  const carryover: CarryoverEntry[] = [];
  const pair = (
    categoryId: string,
    kindA: CarryoverEntry['kind'],
    kindB: CarryoverEntry['kind'],
    weekA: WeekStart,
    weekB: WeekStart,
    amount: Cents,
  ) => {
    const pairId = nextId('pair');
    const now = new Date().toISOString();
    carryover.push(
      {
        id: nextId('co'), categoryId, weekStart: weekA, kind: kindA, amount,
        counterpartWeekStart: weekB, pairId, attributionMonth: monthKeyOf(weekA), createdAt: now,
      },
      {
        id: nextId('co'), categoryId, weekStart: weekB, kind: kindB, amount,
        counterpartWeekStart: weekA, pairId, attributionMonth: monthKeyOf(weekA), createdAt: now,
      },
    );
  };
  // Gas: $12.40 rolled in from last week (outlined bonus blocks).
  pair(gas.id, 'roll_out', 'roll_in', PREV_WEEK, THIS_WEEK, cents(1240));
  // Fun: borrowed $20 from next week (coral overflow now, hollow repayment next week).
  pair(fun.id, 'borrow_in', 'borrow_repay', THIS_WEEK, NEXT_WEEK, cents(2000));

  return {
    chapter: {
      id: nextId('ch'),
      name: 'First Chapter',
      startedAt: addDaysISO(TODAY, -90),
      archivedAt: null,
    },
    accounts: [spending, savings],
    incomeSources: [paycheck, tutoring],
    categories,
    fixedPlan,
    txns,
    carryover,
    trash: new Map(),
  };
}

// --- store -------------------------------------------------------------------
export function createFakeStore(): ReactiveStore {
  const s = seed();
  let version = 1;
  const listeners = new Set<() => void>();
  const bump = () => {
    version += 1;
    listeners.forEach((l) => l());
  };

  const catById = (id: string) => s.categories.find((c) => c.id === id);

  const expensesIn = (range: DateRange) =>
    s.txns.filter((t) => t.kind === 'expense' && t.date >= range.from && t.date <= range.to);

  const carryFor = (categoryId: string, week: WeekStart) =>
    s.carryover.filter((e) => e.categoryId === categoryId && e.weekStart === week);

  const sumKind = (entries: CarryoverEntry[], kind: CarryoverEntry['kind']): Cents =>
    sumCents(entries.filter((e) => e.kind === kind).map((e) => e.amount));

  const envelopeState = (categoryId: string, week: WeekStart): EnvelopeWeekState => {
    const cat = catById(categoryId);
    const configuredBudget = cat?.envelope?.budget ?? ZERO;
    const entries = carryFor(categoryId, week);
    const rolledIn = sumKind(entries, 'roll_in');
    const rolledOut = sumKind(entries, 'roll_out');
    const sweptOut = sumKind(entries, 'sweep_to_savings');
    const borrowedIn = sumKind(entries, 'borrow_in');
    const repaying = sumKind(entries, 'borrow_repay');
    const spent = sumCents(
      expensesIn(weekRange(week))
        .filter((t) => t.categoryId === categoryId)
        .map((t) => t.amount),
    );
    const remaining = subCents(
      addCents(addCents(configuredBudget, rolledIn), borrowedIn),
      addCents(addCents(addCents(rolledOut, sweptOut), repaying), spent),
    );
    return {
      categoryId,
      weekStart: week,
      configuredBudget,
      rolledIn,
      rolledOut,
      sweptOut,
      borrowedIn,
      repaying,
      spent,
      remaining,
    };
  };

  const enveloped = () => s.categories.filter((c) => c.envelope !== null);

  const monthCategorySpent = (categoryId: string, month: MonthKey): Cents => {
    // Duck guard: shift spend covered by cross-month borrows to attributionMonth.
    const base = sumCents(
      s.txns
        .filter(
          (t) => t.kind === 'expense' && t.categoryId === categoryId && monthKeyOf(t.date) === month,
        )
        .map((t) => t.amount),
    );
    let adjusted = base;
    for (const e of s.carryover) {
      if (e.categoryId !== categoryId || e.kind !== 'borrow_in') continue;
      const borrowMonth = monthKeyOf(e.weekStart);
      if (e.attributionMonth === borrowMonth) continue;
      if (borrowMonth === month) adjusted = subCents(adjusted, e.amount);
      if (e.attributionMonth === month) adjusted = addCents(adjusted, e.amount);
    }
    return maxCents(adjusted, ZERO);
  };

  const weeksInMonth = (month: MonthKey): number => {
    const mr = monthRange(`${month}-01`);
    return eachDay(mr).filter((d) => dayOfWeek(d) === 1).length;
  };

  const evaluation: EvaluationReadPort = {
    async getMonthCategoryTotals(month) {
      return s.categories.map((c) => ({
        categoryId: c.id,
        fixed: c.fixed,
        spent: monthCategorySpent(c.id, month),
        budget: c.envelope
          ? cents(c.envelope.budget * (c.envelope.period === 'weekly' ? weeksInMonth(month) : 1))
          : s.fixedPlan.get(c.id) ?? null,
      }));
    },
    async getMonthIncomeTotal(month) {
      return sumCents(
        s.txns
          .filter((t) => t.kind === 'income' && monthKeyOf(t.date) === month)
          .map((t) => t.amount),
      );
    },
    async getMonthSavingsTotal(month) {
      const savingsIds = new Set(s.accounts.filter((a) => a.kind === 'savings').map((a) => a.id));
      const transfers = sumCents(
        s.txns
          .filter(
            (t) =>
              t.kind === 'transfer_in' && savingsIds.has(t.accountId) && monthKeyOf(t.date) === month,
          )
          .map((t) => t.amount),
      );
      const splitsToSavings = sumCents(
        s.txns
          .filter((t) => t.kind === 'income' && monthKeyOf(t.date) === month)
          .flatMap((t) => t.incomeSplit ?? [])
          .filter((leg) => savingsIds.has(leg.accountId))
          .map((leg) => leg.amount),
      );
      return addCents(transfers, splitsToSavings);
    },
    async getMonthFixedBillStatus(month) {
      const fixedCats = s.categories.filter((c) => c.fixed && s.fixedPlan.has(c.id));
      const paid = fixedCats.filter((c) =>
        s.txns.some(
          (t) => t.kind === 'expense' && t.categoryId === c.id && monthKeyOf(t.date) === month,
        ),
      ).length;
      return { expected: fixedCats.length, paid };
    },
    async getCarryoverEntries(query) {
      return s.carryover.filter(
        (e) =>
          (query.month === undefined || monthKeyOf(e.weekStart) === query.month) &&
          (query.categoryId === undefined || e.categoryId === query.categoryId),
      );
    },
    async getActiveMonths() {
      const months = Array.from(new Set(s.txns.map((t) => monthKeyOf(t.date))));
      months.sort();
      return months;
    },
  };

  return {
    // --- reactivity (ReactiveStore wrapper, NOT part of StoreContract) ------
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion() {
      return version;
    },

    // --- mutations -----------------------------------------------------------
    async addExpense(input) {
      const id = nextId('txn');
      s.txns = [
        {
          id,
          accountId: input.accountId,
          categoryId: input.categoryId,
          amount: input.amount,
          kind: 'expense',
          date: input.date,
          note: input.note ?? null,
        },
        ...s.txns,
      ];
      bump();
      return id;
    },

    async addIncome(input) {
      const source = s.incomeSources.find((i) => i.id === input.sourceId);
      if (!source) throw new Error(`Unknown income source: ${input.sourceId}`);
      const amount = input.amount ?? source.amount;
      const parts = allocate(amount, source.splits.map((sp) => sp.ratio));
      const primaryAccount = source.splits[0]?.accountId ?? s.accounts[0].id;
      const incomeCat = s.categories[s.categories.length - 1];
      const id = nextId('txn');
      s.txns = [
        {
          id,
          accountId: primaryAccount,
          categoryId: incomeCat.id,
          amount,
          kind: 'income',
          date: input.date,
          note: source.name,
          incomeSplit: source.splits.map((sp, i) => ({ accountId: sp.accountId, amount: parts[i] })),
        },
        ...s.txns,
      ];
      bump();
      return id;
    },

    async editTransaction(id, patch) {
      s.txns = s.txns.map((t) =>
        t.id === id
          ? {
              ...t,
              amount: patch.amount ?? t.amount,
              categoryId: patch.categoryId ?? t.categoryId,
              note: patch.note !== undefined ? patch.note : t.note,
            }
          : t,
      );
      bump();
    },

    async deleteTransaction(id) {
      const target = s.txns.find((t) => t.id === id);
      const expiresAt = Date.now() + UNDO_WINDOW_MS;
      if (target) {
        s.trash.set(id, target);
        s.txns = s.txns.filter((t) => t.id !== id);
        bump();
        setTimeout(() => s.trash.delete(id), UNDO_WINDOW_MS);
      }
      return {
        expiresAt,
        undo: async () => {
          const trashed = s.trash.get(id);
          if (!trashed || Date.now() > expiresAt) return false;
          s.trash.delete(id);
          s.txns = [trashed, ...s.txns];
          bump();
          return true;
        },
      };
    },

    async transfer(input) {
      const outId = nextId('txn');
      const anyCat = s.categories[0];
      s.txns = [
        {
          id: outId, accountId: input.fromAccountId, categoryId: anyCat.id,
          amount: input.amount, kind: 'transfer_out', date: input.date, note: null,
        },
        {
          id: nextId('txn'), accountId: input.toAccountId, categoryId: anyCat.id,
          amount: input.amount, kind: 'transfer_in', date: input.date, note: null,
        },
        ...s.txns,
      ];
      bump();
      return outId;
    },

    // --- config mutations ----------------------------------------------------
    async createAccount(input) {
      const acct: AccountConfig = { id: nextId('acct'), ...input };
      s.accounts = [...s.accounts, acct];
      bump();
      return acct;
    },
    async renameAccount(accountId, name) {
      s.accounts = s.accounts.map((a) => (a.id === accountId ? { ...a, name } : a));
      bump();
    },
    async createIncomeSource(input) {
      const src: IncomeSourceConfig = { id: nextId('inc'), ...input };
      s.incomeSources = [...s.incomeSources, src];
      bump();
      return src;
    },
    async createCategory(input) {
      const cat: CategoryConfig = { id: nextId('cat'), ...input };
      s.categories = [...s.categories, cat];
      bump();
      return cat;
    },
    async updateEnvelope(categoryId, envelope) {
      s.categories = s.categories.map((c) => (c.id === categoryId ? { ...c, envelope } : c));
      bump();
    },
    async createChapter(input) {
      const ch: Chapter = {
        id: nextId('ch'), name: input.name, startedAt: input.startedAt, archivedAt: null,
      };
      s.chapter = ch;
      bump();
      return ch;
    },
    async archiveChapter(chapterId, archivedAt) {
      if (s.chapter.id === chapterId) s.chapter = { ...s.chapter, archivedAt };
      bump();
    },

    // --- carryover -------------------------------------------------------------
    async rollForward(categoryId, fromWeek) {
      const st = envelopeState(categoryId, fromWeek);
      const leftover = maxCents(st.remaining, ZERO);
      if (leftover === ZERO) return;
      const toWeek = addDaysISO(fromWeek, 7);
      const pairId = nextId('pair');
      const now = new Date().toISOString();
      s.carryover = [
        ...s.carryover,
        {
          id: nextId('co'), categoryId, weekStart: fromWeek, kind: 'roll_out',
          amount: leftover, counterpartWeekStart: toWeek, pairId,
          attributionMonth: monthKeyOf(fromWeek), createdAt: now,
        },
        {
          id: nextId('co'), categoryId, weekStart: toWeek, kind: 'roll_in',
          amount: leftover, counterpartWeekStart: fromWeek, pairId,
          attributionMonth: monthKeyOf(fromWeek), createdAt: now,
        },
      ];
      bump();
    },

    async sweepToSavings(categoryId, fromWeek, savingsAccountId) {
      const st = envelopeState(categoryId, fromWeek);
      const leftover = maxCents(st.remaining, ZERO);
      if (leftover === ZERO) return;
      const now = new Date().toISOString();
      s.carryover = [
        ...s.carryover,
        {
          id: nextId('co'), categoryId, weekStart: fromWeek, kind: 'sweep_to_savings',
          amount: leftover, counterpartWeekStart: null, pairId: null,
          attributionMonth: monthKeyOf(fromWeek), createdAt: now,
        },
      ];
      s.txns = [
        {
          id: nextId('txn'), accountId: savingsAccountId, categoryId,
          amount: leftover, kind: 'transfer_in', date: TODAY, note: 'Envelope sweep',
        },
        ...s.txns,
      ];
      bump();
    },

    async borrowFromNextWeek(categoryId, week, amount) {
      const cat = catById(categoryId);
      const nextBudget = cat?.envelope?.budget ?? ZERO;
      const alreadyBorrowed = sumKind(carryFor(categoryId, week), 'borrow_in');
      const cap = cents(Math.floor(nextBudget / 2));
      if (addCents(alreadyBorrowed, amount) > cap) {
        throw new Error('Borrow cap exceeded: at most 50% of next week’s budget.');
      }
      const toWeek = addDaysISO(week, 7);
      const pairId = nextId('pair');
      const now = new Date().toISOString();
      s.carryover = [
        ...s.carryover,
        {
          id: nextId('co'), categoryId, weekStart: week, kind: 'borrow_in',
          amount, counterpartWeekStart: toWeek, pairId,
          attributionMonth: monthKeyOf(week), createdAt: now,
        },
        {
          id: nextId('co'), categoryId, weekStart: toWeek, kind: 'borrow_repay',
          amount, counterpartWeekStart: week, pairId,
          attributionMonth: monthKeyOf(week), createdAt: now,
        },
      ];
      bump();
    },

    // --- read surface ----------------------------------------------------------
    listAccounts() {
      return s.accounts.map((a) => ({ ...a }));
    },
    listCategories() {
      return s.categories.map((c) => ({ ...c, envelope: c.envelope ? { ...c.envelope } : null }));
    },
    listIncomeSources() {
      return s.incomeSources.map((i) => ({ ...i, splits: i.splits.map((sp) => ({ ...sp })) }));
    },
    getActiveChapter() {
      return { ...s.chapter };
    },

    getTransactions(range) {
      return s.txns
        .filter((t) => t.date >= range.from && t.date <= range.to)
        .slice()
        .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
    },

    getDaySpendTotals(range) {
      const out = new Map<ISODate, Cents>();
      for (const d of eachDay(range)) out.set(d, ZERO);
      for (const t of expensesIn(range)) {
        out.set(t.date, addCents(out.get(t.date) ?? ZERO, t.amount));
      }
      return out;
    },

    getPaydays(range) {
      // Union over income sources. The real store delegates to Team 2's
      // PaydaysBetween; the fake projects weekly/monthly anchors directly.
      const out = new Set<ISODate>();
      for (const src of s.incomeSources) {
        const { kind, anchorDate, semimonthlyDays } = src.schedule;
        for (const d of eachDay(range)) {
          if (kind === 'weekly' && dayOfWeek(d) === dayOfWeek(anchorDate)) out.add(d);
          else if (kind === 'biweekly' && dayOfWeek(d) === dayOfWeek(anchorDate)) {
            const diff = Math.round(
              (Date.parse(d) - Date.parse(anchorDate)) / (7 * 24 * 3600 * 1000),
            );
            if (diff % 2 === 0) out.add(d);
          } else if (kind === 'monthly' && d.slice(8) === anchorDate.slice(8)) out.add(d);
          else if (kind === 'semimonthly' && semimonthlyDays) {
            const dom = parseInt(d.slice(8), 10);
            if (dom === semimonthlyDays[0] || dom === semimonthlyDays[1]) out.add(d);
          }
        }
      }
      return Array.from(out).sort();
    },

    getEnvelopeWeekState(categoryId, week) {
      return envelopeState(categoryId, week);
    },

    getSafeToSpend(week) {
      return sumCents(
        enveloped().map((c) => maxCents(envelopeState(c.id, week).remaining, ZERO)),
      );
    },

    getAccountBalance(accountId, asOf) {
      const acct = s.accounts.find((a) => a.id === accountId);
      if (!acct) return ZERO;
      let bal = acct.startingBalance;
      for (const t of s.txns) {
        if (t.date > asOf) continue;
        if (t.kind === 'income') {
          const leg = (t.incomeSplit ?? []).find((l) => l.accountId === accountId);
          if (leg) bal = addCents(bal, leg.amount);
          else if (t.accountId === accountId && !t.incomeSplit) bal = addCents(bal, t.amount);
        } else if (t.accountId !== accountId) {
          continue;
        } else if (t.kind === 'expense' || t.kind === 'transfer_out') {
          bal = subCents(bal, t.amount);
        } else if (t.kind === 'transfer_in') {
          bal = addCents(bal, t.amount);
        }
      }
      return bal;
    },

    getPlanVsActual(month) {
      return s.categories
        .filter((c) => c.envelope !== null || s.fixedPlan.has(c.id))
        .map((c) => {
          const planned = c.envelope
            ? cents(c.envelope.budget * (c.envelope.period === 'weekly' ? weeksInMonth(month) : 1))
            : s.fixedPlan.get(c.id) ?? ZERO;
          return { categoryId: c.id, planned, actual: monthCategorySpent(c.id, month) };
        });
    },

    evaluation,
  };
}

export const fakeStore: ReactiveStore = createFakeStore();
export default fakeStore;
