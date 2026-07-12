/**
 * Vault store — the atomic money engine (Team 1).
 *
 * Implements `StoreContract` from src/types/contracts.ts. Every multi-row
 * mutation runs inside `AtomicDb.withTransaction` (BEGIN/COMMIT/ROLLBACK on the
 * single expo-sqlite connection); Zustand state is refreshed ONLY after the
 * transaction commits. All money is integer `Cents` — arithmetic goes through
 * src/lib/money.ts, never raw float math.
 *
 * Carryover mutations enforce the conservation law (paired roll/borrow entries
 * share a pairId and equal amounts). Borrowing is cadence-aware and UNCAPPED
 * (v0.3): an envelope borrows from its own next cycle — weekly from next week,
 * monthly from next calendar month — with honest math (nextCycleStartState) as
 * the only guardrail. Money is never invented or lost; violations throw.
 *
 * A handful of DEPRECATED shim members (marked `TODO(team3)`) keep the legacy
 * screens compiling until Team 3 replaces them wholesale.
 */
import { create } from 'zustand';
import { and, eq } from 'drizzle-orm';
import { getDb, getRawDb } from '../db/client';
import * as schema from '../db/schema';
import { generateId } from '../lib/ids';
import {
  addCents,
  cents,
  subCents,
  sumCents,
  allocate,
  ZERO,
  type Cents,
} from '../lib/money';
import { paydaysBetween as schedulePaydaysBetween } from '../lib/schedule';
import type {
  AccountConfig,
  CadenceType,
  CarryoverEntry,
  CategoryColorKey,
  CategoryConfig,
  Chapter,
  DateRange,
  DuckEvaluation,
  Duck,
  DuckPersistencePort,
  EnvelopeConfig,
  EnvelopeWeekState,
  EvaluationReadPort,
  IncomeSchedule,
  IncomeSourceConfig,
  ISODate,
  MonthKey,
  NextCycleState,
  StoreContract,
  TransactionRecord,
  WeekStart,
} from '../types/contracts';
import { UNDO_WINDOW_MS } from '../types/contracts';
import type { Account, Category, Settings, Transaction } from '../types';

const C = (n: number): Cents => cents(n);

// ---------------------------------------------------------------------------
// Date / week helpers (local-time, 'YYYY-MM-DD'). A budget week runs Mon..Sun
// and BELONGS to the month of its Monday (the duck-guard attribution basis).
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
function addDays(iso: ISODate, n: number): ISODate {
  const dt = toDate(iso);
  dt.setDate(dt.getDate() + n);
  return fmt(dt);
}
/** Monday (weekStart) of the week containing `iso`. */
function mondayOf(iso: ISODate): WeekStart {
  const dt = toDate(iso);
  const offset = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - offset);
  return fmt(dt);
}
/** Month a week belongs to = month of its Monday. */
function monthOfWeek(week: WeekStart): MonthKey {
  return week.slice(0, 7);
}
/** 'YYYY-MM' of an ISODate (calendar month). */
function monthKeyOf(iso: ISODate): MonthKey {
  return iso.slice(0, 7);
}
/** First calendar day of a month key ('2026-03' -> '2026-03-01'). */
function firstOfMonth(month: MonthKey): ISODate {
  return `${month}-01`;
}
/** The month key one calendar month after `month`. Pure integer math (no Date). */
function nextMonthKey(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
/** All week-starts (Mondays) that belong to `month`, in order. */
function weeksInMonth(month: MonthKey): WeekStart[] {
  let wk = mondayOf(`${month}-01`);
  if (monthOfWeek(wk) !== month) wk = addDays(wk, 7);
  const out: WeekStart[] = [];
  while (monthOfWeek(wk) === month) {
    out.push(wk);
    wk = addDays(wk, 7);
  }
  return out;
}
function inRange(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

const CATEGORY_HEX: Record<CategoryColorKey, string> = {
  violet: '#9D6FE0',
  amber: '#BA8329',
  mint: '#2FA383',
  blue: '#5B82D9',
  pink: '#C75E86',
};

// ---------------------------------------------------------------------------
// Internal row shapes (drizzle select results, money as plain integers).
// ---------------------------------------------------------------------------
interface AccountRow {
  id: string;
  chapterId: string;
  name: string;
  institution: string | null;
  kind: string;
  startingBalance: number;
  openedOn: string;
  createdAt: string;
}
interface CategoryRow {
  id: string;
  chapterId: string;
  name: string;
  colorKey: string;
  fixed: boolean;
  cadence: string;
  envelopePeriod: string | null;
  envelopeBudget: number | null;
  envelopeCarryoverDefault: string | null;
  createdAt: string;
}
interface TxnRow {
  id: string;
  chapterId: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  kind: string;
  date: string;
  note: string | null;
  groupId: string | null;
  incomeSourceId: string | null;
  createdAt: string;
  deletedAt: string | null;
}
interface CarryoverRow {
  id: string;
  chapterId: string;
  categoryId: string;
  weekStart: string;
  kind: string;
  amount: number;
  counterpartWeekStart: string | null;
  pairId: string | null;
  attributionMonth: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// AtomicDb — BEGIN/COMMIT/ROLLBACK bracket on the single connection. Nested
// calls use savepoints. State is never mutated here (callers refresh on
// commit).
// ---------------------------------------------------------------------------
let txDepth = 0;
let savepointSeq = 0;

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const raw = getRawDb();
  const nested = txDepth > 0;
  const sp = nested ? `sp_${++savepointSeq}` : null;
  raw.execSync(nested ? `SAVEPOINT ${sp}` : 'BEGIN');
  txDepth++;
  try {
    const result = await fn();
    raw.execSync(nested ? `RELEASE ${sp}` : 'COMMIT');
    txDepth--;
    return result;
  } catch (err) {
    try {
      if (nested) {
        raw.execSync(`ROLLBACK TO ${sp}`);
        raw.execSync(`RELEASE ${sp}`);
      } else {
        raw.execSync('ROLLBACK');
      }
    } catch {
      // ignore rollback failures; surface the original error
    }
    txDepth--;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mappers: internal rows → contract configs and deprecated legacy view types.
// ---------------------------------------------------------------------------
function toEnvelope(row: CategoryRow): EnvelopeConfig | null {
  if (!row.envelopePeriod || row.envelopeBudget == null) return null;
  return {
    period: row.envelopePeriod as EnvelopeConfig['period'],
    budget: C(row.envelopeBudget),
    carryoverDefault: (row.envelopeCarryoverDefault ??
      'ask') as EnvelopeConfig['carryoverDefault'],
  };
}
function toCategoryConfig(row: CategoryRow): CategoryConfig {
  return {
    id: row.id,
    name: row.name,
    colorKey: row.colorKey as CategoryColorKey,
    fixed: row.fixed,
    cadence: (row.cadence as CadenceType) ?? 'weekly',
    envelope: toEnvelope(row),
  };
}

/** Validate a cadence at the mutation boundary; reject anything but the two
 * legal values so a bad write can never enter the store. */
function assertCadence(value: unknown): CadenceType {
  if (value !== 'weekly' && value !== 'monthly') {
    throw new Error(`Invalid cadence "${String(value)}" (expected 'weekly' | 'monthly')`);
  }
  return value;
}
function toAccountConfig(row: AccountRow): AccountConfig {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    kind: row.kind as AccountConfig['kind'],
    startingBalance: C(row.startingBalance),
    openedOn: row.openedOn,
  };
}

interface StoreState extends StoreContract {
  // Internal caches (money as Cents).
  _chapter: Chapter | null;
  _accountRows: AccountRow[];
  _categoryRows: CategoryRow[];
  _incomeSources: IncomeSourceConfig[];
  _txnRows: TxnRow[];
  _carryover: CarryoverRow[];
  _ducks: Duck[];
  _evaluations: DuckEvaluation[];
  _settingsRow: (Settings & { notificationsEnabled: boolean }) | null;

  // Lifecycle.
  init: () => Promise<void>;

  /** Duck tables persistence for Team 4's engine (contracts.ts DuckPersistencePort). */
  duckPersistence: DuckPersistencePort;

  // DEPRECATED legacy view (TODO(team3): screens read these; replace wholesale).
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  settings: Settings | null;
  isLoading: boolean;
  error: string | null;
  loadData: () => Promise<void>;
  clearError: () => void;
  getTotalBalance: (asOf?: ISODate) => Cents;
  // asOf optional here (legacy callers pass one arg); still assignable to the
  // StoreContract's required-arg signature.
  getAccountBalance: (accountId: string, asOf?: ISODate) => Cents;
  updateAccount: (
    id: string,
    patch: Partial<Pick<AccountConfig, 'name' | 'institution' | 'kind' | 'startingBalance'>>,
  ) => Promise<void>;
  updateCategory: (
    id: string,
    patch: Partial<Pick<CategoryConfig, 'name' | 'colorKey' | 'fixed' | 'cadence'>>,
  ) => Promise<void>;
  updateIncomeSource: (
    id: string,
    patch: Partial<Omit<IncomeSourceConfig, 'id'>>,
  ) => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  addTransaction: (input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

export const useBudgetStore = create<StoreState>((set, get) => {
  // -- private query helpers (read committed DB state) ----------------------
  const activeChapterId = (): string => {
    const ch = get()._chapter;
    if (!ch) throw new Error('No active chapter. Run the setup wizard first.');
    return ch.id;
  };

  const carryoverFor = (categoryId: string, week: WeekStart): CarryoverRow[] =>
    get()._carryover.filter((e) => e.categoryId === categoryId && e.weekStart === week);

  const sumKind = (rows: CarryoverRow[], kind: string): Cents =>
    sumCents(rows.filter((r) => r.kind === kind).map((r) => C(r.amount)));

  const liveTxns = (): TxnRow[] => get()._txnRows.filter((t) => t.deletedAt == null);

  const categoryRow = (categoryId: string): CategoryRow | undefined =>
    get()._categoryRows.find((c) => c.id === categoryId);

  // Referential integrity at the mutation boundary: a write naming an id
  // that doesn't exist must throw BEFORE any insert (adversary-proven:
  // a transfer_in credited to a phantom account silently destroys money).
  const assertAccountExists = (accountId: string, role: string): void => {
    if (!get()._accountRows.some((a) => a.id === accountId)) {
      throw new Error(`${role}: unknown account "${accountId}"`);
    }
  };
  const assertCategoryExists = (categoryId: string): void => {
    if (!categoryRow(categoryId)) {
      throw new Error(`Unknown category "${categoryId}"`);
    }
  };

  /** Configured envelope budget attributable to a single week (cent-conserving). */
  const configuredWeeklyBudget = (categoryId: string, week: WeekStart): Cents => {
    const row = categoryRow(categoryId);
    const env = row ? toEnvelope(row) : null;
    if (!env) return ZERO;
    if (env.period === 'weekly') return env.budget;
    // monthly: split the month's budget across its weeks, conserving cents.
    const weeks = weeksInMonth(monthOfWeek(week));
    const idx = weeks.indexOf(week);
    if (idx < 0) return ZERO;
    return allocate(env.budget, weeks.map(() => 1))[idx];
  };

  /** Configured envelope budget for a whole month (weekly => ×weeks; monthly => once). */
  const configuredMonthlyBudget = (categoryId: string, month: MonthKey): Cents | null => {
    const row = categoryRow(categoryId);
    const env = row ? toEnvelope(row) : null;
    if (!env) return null;
    if (env.period === 'monthly') return env.budget;
    return sumCents(weeksInMonth(month).map(() => env.budget));
  };

  const spentInRange = (categoryId: string, from: ISODate, to: ISODate): Cents =>
    sumCents(
      liveTxns()
        .filter(
          (t) =>
            t.kind === 'expense' &&
            t.categoryId === categoryId &&
            inRange(t.date, from, to),
        )
        .map((t) => C(t.amount)),
    );

  const envelopeWeekState = (categoryId: string, week: WeekStart): EnvelopeWeekState => {
    const entries = carryoverFor(categoryId, week);
    const configuredBudget = configuredWeeklyBudget(categoryId, week);
    const rolledIn = sumKind(entries, 'roll_in');
    const rolledOut = sumKind(entries, 'roll_out');
    const sweptOut = sumKind(entries, 'sweep_to_savings');
    const borrowedIn = sumKind(entries, 'borrow_in');
    const repaying = sumKind(entries, 'borrow_repay');
    const spent = spentInRange(categoryId, week, addDays(week, 6));
    const remaining = C(
      configuredBudget +
        rolledIn +
        borrowedIn -
        rolledOut -
        sweptOut -
        repaying -
        spent,
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

  /** Month spend for a category, attributed by WEEK-month (duck guard §5.4). */
  const monthCategorySpend = (categoryId: string, month: MonthKey): Cents =>
    sumCents(
      weeksInMonth(month).map((wk) =>
        spentInRange(categoryId, wk, addDays(wk, 6)),
      ),
    );

  /** Net roll adjustment (roll_in − roll_out) recorded in a month. */
  const netRollsForMonth = (categoryId: string, month: MonthKey): Cents => {
    const rows = get()._carryover.filter(
      (e) => e.categoryId === categoryId && monthOfWeek(e.weekStart) === month,
    );
    return C(sumKind(rows, 'roll_in') - sumKind(rows, 'roll_out'));
  };

  const accountBalance = (accountId: string, asOf: ISODate): Cents => {
    const row = get()._accountRows.find((a) => a.id === accountId);
    if (!row) return ZERO;
    let balance = C(row.startingBalance);
    for (const t of liveTxns()) {
      if (t.date > asOf) continue;
      if (t.accountId !== accountId) continue;
      if (t.kind === 'income' || t.kind === 'transfer_in') balance = addCents(balance, C(t.amount));
      else if (t.kind === 'expense' || t.kind === 'transfer_out') balance = subCents(balance, C(t.amount));
    }
    return balance;
  };

  // Payday projection delegates to Team 2's schedule engine (strict
  // calendar validation, DST-immune epoch-day arithmetic).
  const paydaysBetween = schedulePaydaysBetween;

  // -- refresh: reload every cache from committed DB, rebuild shim views ----
  const refresh = async (): Promise<void> => {
    const db = getDb();
    const chapters = db.select().from(schema.chapters).all() as Array<{
      id: string; name: string; startedAt: string; archivedAt: string | null;
    }>;
    const active =
      chapters.find((c) => c.archivedAt == null) ??
      chapters[chapters.length - 1] ??
      null;

    const chapter: Chapter | null = active
      ? { id: active.id, name: active.name, startedAt: active.startedAt, archivedAt: active.archivedAt }
      : null;
    const chId = chapter?.id;

    const accountRows = (db.select().from(schema.accounts).all() as AccountRow[]).filter(
      (a) => !chId || a.chapterId === chId,
    );
    const categoryRows = (db.select().from(schema.categories).all() as CategoryRow[]).filter(
      (c) => !chId || c.chapterId === chId,
    );
    const txnRows = (db.select().from(schema.transactions).all() as TxnRow[]).filter(
      (t) => !chId || t.chapterId === chId,
    );
    const carryover = (db.select().from(schema.carryoverEntries).all() as CarryoverRow[]).filter(
      (e) => !chId || e.chapterId === chId,
    );
    const sourceRows = (db.select().from(schema.incomeSources).all() as Array<{
      id: string; chapterId: string; name: string; amount: number;
      scheduleKind: string; scheduleAnchorDate: string;
      scheduleSemimonthlyDay1: number | null; scheduleSemimonthlyDay2: number | null;
    }>).filter((s) => !chId || s.chapterId === chId);
    const splitRows = db.select().from(schema.incomeSplits).all() as Array<{
      id: string; sourceId: string; accountId: string; ratio: number;
    }>;
    const duckRows = (db.select().from(schema.ducks).all() as Array<{
      id: string; chapterId: string; name: string | null; earnedMonth: string;
    }>).filter((d) => !chId || d.chapterId === chId);
    const evalRows = (db.select().from(schema.duckEvaluations).all() as Array<Record<string, unknown>>).filter(
      (e) => !chId || e.chapterId === chId,
    );
    const settingsRows = db.select().from(schema.settings).all() as Array<
      Settings & { notificationsEnabled: boolean }
    >;

    const incomeSources: IncomeSourceConfig[] = sourceRows.map((s) => ({
      id: s.id,
      name: s.name,
      amount: C(s.amount),
      schedule: {
        kind: s.scheduleKind as IncomeSchedule['kind'],
        anchorDate: s.scheduleAnchorDate,
        semimonthlyDays:
          s.scheduleSemimonthlyDay1 != null && s.scheduleSemimonthlyDay2 != null
            ? [s.scheduleSemimonthlyDay1, s.scheduleSemimonthlyDay2]
            : undefined,
      },
      splits: splitRows
        .filter((sp) => sp.sourceId === s.id)
        .map((sp) => ({ accountId: sp.accountId, ratio: sp.ratio })),
    }));

    const ducks: Duck[] = duckRows.map((d) => ({
      id: d.id,
      name: d.name,
      earnedMonth: d.earnedMonth,
    }));

    const evaluations: DuckEvaluation[] = evalRows.map((e) => ({
      id: e.id as string,
      chapterId: e.chapterId as string,
      month: e.month as string,
      evaluatedAt: e.evaluatedAt as string,
      goalFixedBills: {
        met: Boolean(e.goalFixedBillsMet),
        detail: e.goalFixedBillsDetail as string,
      },
      goalVariableBudgets: {
        met: Boolean(e.goalVariableBudgetsMet),
        detail: e.goalVariableBudgetsDetail as string,
      },
      goalSavingsRate: {
        met: Boolean(e.goalSavingsRateMet),
        detail: e.goalSavingsRateDetail as string,
      },
      outcome: e.outcome as DuckEvaluation['outcome'],
      duckCountAfter: e.duckCountAfter as number,
      accessoryTierAfter: e.accessoryTierAfter as number,
      final: true,
    }));

    // --- deprecated legacy view (TODO(team3)) ---
    const accountsLegacy: Account[] = accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.kind === 'savings' ? 'savings' : 'checking',
      startingBalance: a.startingBalance, // NOTE: cents; screens display verbatim until Team 3
      startingDate: a.openedOn,
      createdAt: a.createdAt,
      updatedAt: a.createdAt,
    }));
    const categoriesLegacy: Category[] = categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      color: CATEGORY_HEX[(c.colorKey as CategoryColorKey)] ?? '#7C8A84',
      plannedMonthly: c.envelopeBudget ?? 0,
      plannedWeekly: c.envelopePeriod === 'weekly' ? c.envelopeBudget ?? undefined : undefined,
      recurring: c.fixed,
      accountId: '',
      createdAt: c.createdAt,
      updatedAt: c.createdAt,
    }));
    const transactionsLegacy: Transaction[] = txnRows
      .filter((t) => t.deletedAt == null)
      .map((t) => ({
        id: t.id,
        amount: t.amount, // NOTE: cents; screens display verbatim until Team 3
        type:
          t.kind === 'income'
            ? 'income'
            : t.kind === 'transfer_in' || t.kind === 'transfer_out'
            ? 'transfer'
            : 'expense',
        categoryId: t.categoryId,
        accountId: t.accountId,
        date: t.date,
        timestamp: t.createdAt,
        note: t.note ?? undefined,
        toAccountId: undefined,
        createdAt: t.createdAt,
        updatedAt: t.createdAt,
      }));

    set({
      _chapter: chapter,
      _accountRows: accountRows,
      _categoryRows: categoryRows,
      _incomeSources: incomeSources,
      _txnRows: txnRows,
      _carryover: carryover,
      _ducks: ducks,
      _evaluations: evaluations,
      _settingsRow: settingsRows[0] ?? null,
      accounts: accountsLegacy,
      categories: categoriesLegacy,
      transactions: transactionsLegacy,
      settings: settingsRows[0] ?? null,
      error: null,
    });
  };

  // -- EvaluationReadPort ---------------------------------------------------
  const evaluation: EvaluationReadPort = {
    async getMonthCategoryTotals(month) {
      return get()._categoryRows.map((c) => ({
        categoryId: c.id,
        fixed: c.fixed,
        spent: monthCategorySpend(c.id, month),
        budget: c.fixed
          ? null
          : C(
              (configuredMonthlyBudget(c.id, month) ?? ZERO) +
                netRollsForMonth(c.id, month),
            ),
      }));
    },
    async getMonthIncomeTotal(month) {
      return sumCents(
        liveTxns()
          .filter((t) => t.kind === 'income' && t.date.slice(0, 7) === month)
          .map((t) => C(t.amount)),
      );
    },
    async getMonthSavingsTotal(month) {
      const savingsIds = new Set(
        get()._accountRows.filter((a) => a.kind === 'savings').map((a) => a.id),
      );
      const transfersIn = sumCents(
        liveTxns()
          .filter(
            (t) =>
              t.kind === 'transfer_in' &&
              savingsIds.has(t.accountId) &&
              t.date.slice(0, 7) === month,
          )
          .map((t) => C(t.amount)),
      );
      // Sweeps create real transfer_in rows (see sweepToSavings), so the
      // transfersIn term already includes them — no separate sweep term,
      // which would double-count (Goal 3 basis: calendar-month transfers
      // into savings-kind accounts).
      return C(transfersIn);
    },
    async getMonthFixedBillStatus(month) {
      const fixedCats = get()._categoryRows.filter((c) => c.fixed);
      const expected = fixedCats.length;
      const paid = fixedCats.filter(
        (c) => monthCategorySpend(c.id, month) > 0,
      ).length;
      return { expected, paid };
    },
    async getCarryoverEntries(query) {
      return get()
        ._carryover.filter(
          (e) =>
            (query.month == null || e.attributionMonth === query.month) &&
            (query.categoryId == null || e.categoryId === query.categoryId),
        )
        .map(toCarryoverEntry);
    },
    async getActiveMonths(chapterId) {
      const months = new Set<MonthKey>();
      for (const t of get()._txnRows.filter(
        (t) => t.deletedAt == null && t.chapterId === chapterId,
      )) {
        months.add(monthOfWeek(mondayOf(t.date)));
      }
      for (const e of get()._carryover.filter((e) => e.chapterId === chapterId)) {
        months.add(e.attributionMonth);
      }
      return [...months].sort();
    },
  };

  // -- DuckPersistencePort --------------------------------------------------
  // Team 1 owns the duck tables; Team 4's engine self-seeds the starter duck.
  // `commit` runs atomically and NEVER mutates/deletes an issued evaluation.
  const duckPersistence: DuckPersistencePort = {
    async loadState(chapterId) {
      const db = getDb();
      const evalRows = (db.select().from(schema.duckEvaluations).all() as Array<Record<string, unknown>>)
        .filter((e) => e.chapterId === chapterId);
      const duckRows = (db.select().from(schema.ducks).all() as Array<{
        id: string; chapterId: string; name: string | null; earnedMonth: string;
      }>).filter((d) => d.chapterId === chapterId);
      const evaluations: DuckEvaluation[] = evalRows.map((e) => ({
        id: e.id as string,
        chapterId: e.chapterId as string,
        month: e.month as string,
        evaluatedAt: e.evaluatedAt as string,
        goalFixedBills: { met: Boolean(e.goalFixedBillsMet), detail: e.goalFixedBillsDetail as string },
        goalVariableBudgets: { met: Boolean(e.goalVariableBudgetsMet), detail: e.goalVariableBudgetsDetail as string },
        goalSavingsRate: { met: Boolean(e.goalSavingsRateMet), detail: e.goalSavingsRateDetail as string },
        outcome: e.outcome as DuckEvaluation['outcome'],
        duckCountAfter: e.duckCountAfter as number,
        accessoryTierAfter: e.accessoryTierAfter as number,
        final: true,
      }));
      const ducks: Duck[] = duckRows.map((d) => ({ id: d.id, name: d.name, earnedMonth: d.earnedMonth }));
      // Accessory tier = the tier from the latest evaluation (0 if none yet).
      const latest = [...evaluations].sort((a, b) => (a.month < b.month ? 1 : -1))[0];
      return { evaluations, ducks, accessoryTier: latest?.accessoryTierAfter ?? 0 };
    },

    async commit(chapterId, batch) {
      const now = new Date().toISOString();
      await withTransaction(async () => {
        const db = getDb();
        // Verdict finality: only INSERT evaluations that don't already exist;
        // never UPDATE/DELETE an issued one.
        const existing = new Set(
          (db.select().from(schema.duckEvaluations).all() as Array<{ id: string; chapterId: string }>)
            .filter((e) => e.chapterId === chapterId)
            .map((e) => e.id),
        );
        for (const ev of batch.newEvaluations) {
          if (existing.has(ev.id)) {
            throw new Error(`DuckPersistence.commit: evaluation ${ev.id} already issued (verdicts are final)`);
          }
          db.insert(schema.duckEvaluations).values({
            id: ev.id,
            chapterId,
            month: ev.month,
            evaluatedAt: ev.evaluatedAt,
            goalFixedBillsMet: ev.goalFixedBills.met,
            goalFixedBillsDetail: ev.goalFixedBills.detail,
            goalVariableBudgetsMet: ev.goalVariableBudgets.met,
            goalVariableBudgetsDetail: ev.goalVariableBudgets.detail,
            goalSavingsRateMet: ev.goalSavingsRate.met,
            goalSavingsRateDetail: ev.goalSavingsRate.detail,
            outcome: ev.outcome,
            duckCountAfter: ev.duckCountAfter,
            accessoryTierAfter: ev.accessoryTierAfter,
            createdAt: now,
          }).run();
        }
        // Reconcile the flock to the engine-provided set (add/remove/rename ducks).
        const currentIds = new Set(
          (db.select().from(schema.ducks).all() as Array<{ id: string; chapterId: string }>)
            .filter((d) => d.chapterId === chapterId)
            .map((d) => d.id),
        );
        const targetIds = new Set(batch.ducks.map((d) => d.id));
        for (const id of currentIds) {
          if (!targetIds.has(id)) {
            db.delete(schema.ducks).where(eq(schema.ducks.id, id)).run();
          }
        }
        for (const d of batch.ducks) {
          if (currentIds.has(d.id)) {
            db.update(schema.ducks)
              .set({ name: d.name, earnedMonth: d.earnedMonth })
              .where(eq(schema.ducks.id, d.id))
              .run();
          } else {
            db.insert(schema.ducks).values({
              id: d.id,
              chapterId,
              name: d.name,
              earnedMonth: d.earnedMonth,
              createdAt: now,
            }).run();
          }
        }
      });
      await refresh();
    },

    async renameDuck(duckId, name) {
      await withTransaction(async () => {
        getDb().update(schema.ducks).set({ name }).where(eq(schema.ducks.id, duckId)).run();
      });
      await refresh();
    },
  };

  return {
    // caches
    _chapter: null,
    _accountRows: [],
    _categoryRows: [],
    _incomeSources: [],
    _txnRows: [],
    _carryover: [],
    _ducks: [],
    _evaluations: [],
    _settingsRow: null,

    // legacy view defaults
    accounts: [],
    categories: [],
    transactions: [],
    settings: null,
    isLoading: false,
    error: null,

    init: async () => {
      set({ isLoading: true });
      try {
        await refresh();
      } finally {
        set({ isLoading: false });
      }
    },
    loadData: async () => {
      set({ isLoading: true, error: null });
      try {
        await refresh();
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Failed to load data' });
        throw e;
      } finally {
        set({ isLoading: false });
      }
    },
    clearError: () => set({ error: null }),

    duckPersistence,

    // ----------------------------------------------------------- config mutations
    // Setup wizard / Settings write configuration through these (contracts rev 3).
    createChapter: async (input) => {
      const id = generateId();
      const now = new Date().toISOString();
      await withTransaction(async () => {
        getDb().insert(schema.chapters).values({
          id,
          name: input.name,
          startedAt: input.startedAt,
          archivedAt: null,
          createdAt: now,
        }).run();
      });
      await refresh();
      return { id, name: input.name, startedAt: input.startedAt, archivedAt: null };
    },

    archiveChapter: async (chapterId, archivedAt) => {
      await withTransaction(async () => {
        getDb()
          .update(schema.chapters)
          .set({ archivedAt })
          .where(eq(schema.chapters.id, chapterId))
          .run();
      });
      await refresh();
    },

    createAccount: async (input) => {
      const id = generateId();
      const chapterId = activeChapterId();
      const now = new Date().toISOString();
      await withTransaction(async () => {
        getDb().insert(schema.accounts).values({
          id,
          chapterId,
          name: input.name,
          institution: input.institution,
          kind: input.kind,
          startingBalance: input.startingBalance,
          openedOn: input.openedOn,
          createdAt: now,
        }).run();
      });
      await refresh();
      return {
        id,
        name: input.name,
        institution: input.institution,
        kind: input.kind,
        startingBalance: input.startingBalance,
        openedOn: input.openedOn,
      };
    },

    renameAccount: async (accountId, name) => {
      await withTransaction(async () => {
        getDb().update(schema.accounts).set({ name }).where(eq(schema.accounts.id, accountId)).run();
      });
      await refresh();
    },

    createIncomeSource: async (input) => {
      const id = generateId();
      const chapterId = activeChapterId();
      const now = new Date().toISOString();
      await withTransaction(async () => {
        const db = getDb();
        db.insert(schema.incomeSources).values({
          id,
          chapterId,
          name: input.name,
          amount: input.amount,
          scheduleKind: input.schedule.kind,
          scheduleAnchorDate: input.schedule.anchorDate,
          scheduleSemimonthlyDay1: input.schedule.semimonthlyDays?.[0] ?? null,
          scheduleSemimonthlyDay2: input.schedule.semimonthlyDays?.[1] ?? null,
          createdAt: now,
        }).run();
        for (const sp of input.splits) {
          db.insert(schema.incomeSplits).values({
            id: generateId(),
            sourceId: id,
            accountId: sp.accountId,
            ratio: sp.ratio,
            createdAt: now,
          }).run();
        }
      });
      await refresh();
      return { id, ...input };
    },

    createCategory: async (input) => {
      const id = generateId();
      const chapterId = activeChapterId();
      const now = new Date().toISOString();
      const cadence = input.cadence === undefined ? 'weekly' : assertCadence(input.cadence);
      await withTransaction(async () => {
        getDb().insert(schema.categories).values({
          id,
          chapterId,
          name: input.name,
          colorKey: input.colorKey,
          fixed: input.fixed,
          cadence,
          envelopePeriod: input.envelope?.period ?? null,
          envelopeBudget: input.envelope?.budget ?? null,
          envelopeCarryoverDefault: input.envelope?.carryoverDefault ?? null,
          createdAt: now,
        }).run();
      });
      await refresh();
      return { id, ...input, cadence };
    },

    updateEnvelope: async (categoryId, envelope) => {
      await withTransaction(async () => {
        getDb()
          .update(schema.categories)
          .set({
            envelopePeriod: envelope?.period ?? null,
            envelopeBudget: envelope?.budget ?? null,
            envelopeCarryoverDefault: envelope?.carryoverDefault ?? null,
          })
          .where(eq(schema.categories.id, categoryId))
          .run();
      });
      await refresh();
    },

    // ----------------------------------------------------------------- mutations
    addExpense: async (input) => {
      assertAccountExists(input.accountId, 'addExpense');
      assertCategoryExists(input.categoryId);
      const id = generateId();
      const chapterId = activeChapterId();
      await withTransaction(async () => {
        getDb().insert(schema.transactions).values({
          id,
          chapterId,
          accountId: input.accountId,
          categoryId: input.categoryId,
          amount: input.amount,
          kind: 'expense',
          date: input.date,
          note: input.note ?? null,
          groupId: null,
          incomeSourceId: null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
        }).run();
      });
      await refresh();
      return id;
    },

    addIncome: async (input) => {
      const chapterId = activeChapterId();
      const source = get()._incomeSources.find((s) => s.id === input.sourceId);
      if (!source) throw new Error(`Unknown income source: ${input.sourceId}`);
      const total = input.amount ?? source.amount;
      const groupId = generateId();
      const now = new Date().toISOString();

      const splits = source.splits.length > 0 ? source.splits : null;
      if (splits) {
        splits.forEach((sp) => assertAccountExists(sp.accountId, 'addIncome split'));
      } else {
        const fallback = get()._accountRows[0];
        if (!fallback) throw new Error('addIncome: no accounts exist to receive income');
      }
      await withTransaction(async () => {
        const db = getDb();
        if (splits) {
          // Cent-conserving allocation across accounts (never float division).
          const parts = allocate(total, splits.map((s) => s.ratio));
          splits.forEach((sp, i) => {
            db.insert(schema.transactions).values({
              id: generateId(),
              chapterId,
              accountId: sp.accountId,
              categoryId: null,
              amount: parts[i],
              kind: 'income',
              date: input.date,
              note: null,
              groupId,
              incomeSourceId: source.id,
              createdAt: now,
              deletedAt: null,
            }).run();
          });
        } else {
          db.insert(schema.transactions).values({
            id: generateId(),
            chapterId,
            accountId: get()._accountRows[0]?.id ?? '',
            categoryId: null,
            amount: total,
            kind: 'income',
            date: input.date,
            note: null,
            groupId,
            incomeSourceId: source.id,
            createdAt: now,
            deletedAt: null,
          }).run();
        }
      });
      await refresh();
      return groupId;
    },

    editTransaction: async (id, patch) => {
      if (patch.categoryId != null) assertCategoryExists(patch.categoryId);
      await withTransaction(async () => {
        const set_: Record<string, unknown> = {};
        if (patch.amount !== undefined) set_.amount = patch.amount;
        if (patch.categoryId !== undefined) set_.categoryId = patch.categoryId;
        if (patch.note !== undefined) set_.note = patch.note;
        if (Object.keys(set_).length === 0) return;
        getDb().update(schema.transactions).set(set_).where(eq(schema.transactions.id, id)).run();
      });
      await refresh();
    },

    deleteTransaction: async (id) => {
      const deletedAt = new Date().toISOString();
      await withTransaction(async () => {
        getDb()
          .update(schema.transactions)
          .set({ deletedAt })
          .where(eq(schema.transactions.id, id))
          .run();
      });
      await refresh();

      const expiresAt = Date.now() + UNDO_WINDOW_MS;
      const undo = async (): Promise<boolean> => {
        if (Date.now() > expiresAt) return false;
        // Restore only the row still carrying this exact tombstone.
        await withTransaction(async () => {
          getDb()
            .update(schema.transactions)
            .set({ deletedAt: null })
            .where(and(eq(schema.transactions.id, id), eq(schema.transactions.deletedAt, deletedAt)))
            .run();
        });
        await refresh();
        const row = get()._txnRows.find((t) => t.id === id);
        return Boolean(row && row.deletedAt == null);
      };
      return { undo, expiresAt };
    },

    transfer: async (input) => {
      if (input.fromAccountId === input.toAccountId) {
        throw new Error('transfer: source and destination accounts must differ');
      }
      assertAccountExists(input.fromAccountId, 'transfer (from)');
      assertAccountExists(input.toAccountId, 'transfer (to)');
      const chapterId = activeChapterId();
      const groupId = generateId();
      const now = new Date().toISOString();
      await withTransaction(async () => {
        const db = getDb();
        db.insert(schema.transactions).values({
          id: generateId(),
          chapterId,
          accountId: input.fromAccountId,
          categoryId: null,
          amount: input.amount,
          kind: 'transfer_out',
          date: input.date,
          note: null,
          groupId,
          incomeSourceId: null,
          createdAt: now,
          deletedAt: null,
        }).run();
        db.insert(schema.transactions).values({
          id: generateId(),
          chapterId,
          accountId: input.toAccountId,
          categoryId: null,
          amount: input.amount,
          kind: 'transfer_in',
          date: input.date,
          note: null,
          groupId,
          incomeSourceId: null,
          createdAt: now,
          deletedAt: null,
        }).run();
      });
      await refresh();
      return groupId;
    },

    // ----------------------------------------------------------------- carryover
    rollForward: async (categoryId, fromWeek) => {
      const leftover = envelopeWeekState(categoryId, fromWeek).remaining;
      if (leftover <= 0) return; // nothing to roll
      const toWeek = addDays(fromWeek, 7);
      const chapterId = activeChapterId();
      const pairId = generateId();
      const now = new Date().toISOString();
      const amount = leftover;
      await withTransaction(async () => {
        const db = getDb();
        // roll_out from source week (attributed to source week's month)
        db.insert(schema.carryoverEntries).values({
          id: generateId(),
          chapterId,
          categoryId,
          weekStart: fromWeek,
          kind: 'roll_out',
          amount,
          counterpartWeekStart: toWeek,
          pairId,
          attributionMonth: monthOfWeek(fromWeek),
          createdAt: now,
        }).run();
        // roll_in to destination week (EQUAL amount — conservation)
        db.insert(schema.carryoverEntries).values({
          id: generateId(),
          chapterId,
          categoryId,
          weekStart: toWeek,
          kind: 'roll_in',
          amount,
          counterpartWeekStart: fromWeek,
          pairId,
          attributionMonth: monthOfWeek(toWeek),
          createdAt: now,
        }).run();
      });
      await refresh();
    },

    sweepToSavings: async (categoryId, fromWeek, savingsAccountId) => {
      const leftover = envelopeWeekState(categoryId, fromWeek).remaining;
      if (leftover <= 0) return;
      assertAccountExists(savingsAccountId, 'sweepToSavings');
      const chapterId = activeChapterId();
      const now = new Date().toISOString();
      // §5.2: a sweep RECORDS A TRANSFER toward the savings account, not just
      // a budget-ledger entry (verifier finding #2). Source = first account
      // that isn't the sweep target (spending preferred); single-account
      // setups keep the budget entry only, since there's no cash to move.
      const source =
        get()._accountRows.find((a) => a.kind === 'spending' && a.id !== savingsAccountId) ??
        get()._accountRows.find((a) => a.id !== savingsAccountId);
      await withTransaction(async () => {
        const db = getDb();
        db.insert(schema.carryoverEntries).values({
          id: generateId(),
          chapterId,
          categoryId,
          weekStart: fromWeek,
          kind: 'sweep_to_savings',
          amount: leftover,
          counterpartWeekStart: null,
          pairId: null,
          attributionMonth: monthOfWeek(fromWeek),
          createdAt: now,
        }).run();
        if (source) {
          const groupId = generateId();
          const legs = [
            { accountId: source.id, kind: 'transfer_out' as const },
            { accountId: savingsAccountId, kind: 'transfer_in' as const },
          ];
          for (const leg of legs) {
            db.insert(schema.transactions).values({
              id: generateId(),
              chapterId,
              accountId: leg.accountId,
              categoryId: null,
              amount: leftover,
              kind: leg.kind,
              date: fromWeek,
              note: 'Envelope sweep',
              groupId,
              incomeSourceId: null,
              createdAt: now,
              deletedAt: null,
            }).run();
          }
        }
      });
      await refresh();
    },

    // Borrow from an envelope's OWN next cycle (v0.3: cadence-aware, uncapped).
    // Weekly-cadence envelopes borrow from next week; monthly-cadence envelopes
    // from next calendar month. The only guardrails are honest math and the
    // conservation law: the two legs share a pairId, carry EQUAL amounts, both
    // attribute to the ORIGIN period's month (so a cross-period borrow can never
    // dodge that month's duck verdict), and land in ONE transaction. A phantom
    // category id throws BEFORE any write.
    borrowFromNextCycle: async (categoryId, currentPeriodStart, amount) => {
      // Positive whole cents only — no cap. (cents() already brands integers;
      // this re-check keeps the guarantee at the mutation boundary.)
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('borrow: amount must be a positive whole number of cents');
      }
      assertCategoryExists(categoryId);
      const row = categoryRow(categoryId)!;
      if (!toEnvelope(row)) {
        throw new Error(`borrow: category "${categoryId}" has no configured envelope budget`);
      }
      const cadence = (row.cadence as CadenceType) ?? 'weekly';

      // Resolve origin + next-cycle period starts and the (shared) attribution
      // month. NOTE (cadence change after debt exists): entries already written
      // keep their own period math; this call reads the CURRENT cadence to place
      // new legs. A monthly borrow's repay leg sits at next month's first day but
      // is attributed to the origin month, exactly as the weekly repay leg sits
      // at next week but attributes to the origin week's month.
      let originStart: WeekStart;
      let nextStart: WeekStart;
      let attributionMonth: MonthKey;
      if (cadence === 'monthly') {
        const month = monthKeyOf(currentPeriodStart);
        originStart = firstOfMonth(month);
        nextStart = firstOfMonth(nextMonthKey(month));
        attributionMonth = month; // origin (current) month owns the spend
      } else {
        originStart = mondayOf(currentPeriodStart);
        nextStart = addDays(originStart, 7);
        attributionMonth = monthOfWeek(originStart);
      }

      const chapterId = activeChapterId();
      const pairId = generateId();
      const now = new Date().toISOString();
      await withTransaction(async () => {
        const db = getDb();
        db.insert(schema.carryoverEntries).values({
          id: generateId(),
          chapterId,
          categoryId,
          weekStart: originStart,
          kind: 'borrow_in',
          amount,
          counterpartWeekStart: nextStart,
          pairId,
          attributionMonth,
          createdAt: now,
        }).run();
        db.insert(schema.carryoverEntries).values({
          id: generateId(),
          chapterId,
          categoryId,
          weekStart: nextStart,
          kind: 'borrow_repay',
          amount, // EQUAL amount — conservation
          counterpartWeekStart: originStart,
          pairId,
          attributionMonth,
          createdAt: now,
        }).run();
      });
      await refresh();
    },

    // @deprecated Delegate for existing weekly-envelope UI. Rejects a
    // monthly-cadence category (which must use borrowFromNextCycle) with a
    // clear error rather than silently borrowing from "next week".
    borrowFromNextWeek: async (categoryId, week, amount) => {
      assertCategoryExists(categoryId);
      const cadence = (categoryRow(categoryId)!.cadence as CadenceType) ?? 'weekly';
      if (cadence !== 'weekly') {
        throw new Error(
          `borrowFromNextWeek: "${categoryId}" is a monthly-cadence envelope; use borrowFromNextCycle`,
        );
      }
      await get().borrowFromNextCycle(categoryId, week, amount);
    },

    // ----------------------------------------------------------------- reads
    listAccounts: () => get()._accountRows.map(toAccountConfig),
    listCategories: () => get()._categoryRows.map(toCategoryConfig),
    listIncomeSources: () => get()._incomeSources,
    getActiveChapter: () => {
      const ch = get()._chapter;
      if (!ch) throw new Error('No active chapter. Run the setup wizard first.');
      return ch;
    },

    getTransactions: (range) =>
      liveTxns()
        .filter((t) => inRange(t.date, range.from, range.to))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .map(toTransactionRecord),

    getDaySpendTotals: (range) => {
      const map = new Map<ISODate, Cents>();
      for (const t of liveTxns()) {
        if (t.kind !== 'expense') continue;
        if (!inRange(t.date, range.from, range.to)) continue;
        map.set(t.date, addCents(map.get(t.date) ?? ZERO, C(t.amount)));
      }
      return map;
    },

    getPaydays: (range) => {
      const set_ = new Set<ISODate>();
      for (const src of get()._incomeSources) {
        for (const d of paydaysBetween(src.schedule, range)) set_.add(d);
      }
      return [...set_].sort();
    },

    getEnvelopeWeekState: (categoryId, week) => envelopeWeekState(categoryId, week),

    // What the envelope's next cycle will start with (borrow prompt, F3).
    // Sync composition over committed caches; dispatches on the category's
    // cadence. `alreadyOwed` = borrow repayments already charged to that next
    // cycle by prior borrows (stacked borrows accumulate here); startsWith =
    // budget − alreadyOwed (the plan money the next cycle currently begins
    // with, before the contemplated borrow).
    nextCycleStartState: (categoryId, currentPeriodStart): NextCycleState => {
      const row = categoryRow(categoryId);
      if (!row) throw new Error(`nextCycleStartState: unknown category "${categoryId}"`);
      const cadence = (row.cadence as CadenceType) ?? 'weekly';
      let cycleStart: WeekStart;
      let budget: Cents;
      if (cadence === 'monthly') {
        const nextMonth = nextMonthKey(monthKeyOf(currentPeriodStart));
        cycleStart = firstOfMonth(nextMonth);
        budget = configuredMonthlyBudget(categoryId, nextMonth) ?? ZERO;
      } else {
        cycleStart = addDays(mondayOf(currentPeriodStart), 7);
        budget = configuredWeeklyBudget(categoryId, cycleStart);
      }
      const alreadyOwed = sumKind(carryoverFor(categoryId, cycleStart), 'borrow_repay');
      const startsWith = C(budget - alreadyOwed);
      return { cycleStart, budget, alreadyOwed, startsWith };
    },

    getSafeToSpend: (week) =>
      sumCents(
        get()
          ._categoryRows.filter((c) => toEnvelope(c) != null)
          .map((c) => envelopeWeekState(c.id, week).remaining),
      ),

    getAccountBalance: (accountId: string, asOf?: ISODate) =>
      accountBalance(accountId, asOf ?? fmt(new Date())),

    getPlanVsActual: (month) =>
      get()._categoryRows.map((c) => ({
        categoryId: c.id,
        planned: configuredMonthlyBudget(c.id, month) ?? ZERO,
        actual: monthCategorySpend(c.id, month),
      })),

    evaluation,

    // --------------------------------------------------- DEPRECATED shims (team3)
    getTotalBalance: (asOf) => {
      const at = asOf ?? fmt(new Date());
      return sumCents(get()._accountRows.map((a) => accountBalance(a.id, at)));
    },
    // Config edits (v0.2 edit-setup flow). Update in place — never insert.
    updateAccount: async (id, patch) => {
      if (!get()._accountRows.some((a) => a.id === id)) {
        throw new Error(`updateAccount: unknown account "${id}"`);
      }
      await withTransaction(async () => {
        const set_: Record<string, unknown> = {};
        if (patch.name !== undefined) set_.name = patch.name;
        if (patch.institution !== undefined) set_.institution = patch.institution;
        if (patch.kind !== undefined) set_.kind = patch.kind;
        if (patch.startingBalance !== undefined) set_.startingBalance = patch.startingBalance;
        if (Object.keys(set_).length === 0) return;
        getDb().update(schema.accounts).set(set_).where(eq(schema.accounts.id, id)).run();
      });
      await refresh();
    },
    updateCategory: async (id, patch) => {
      if (!get()._categoryRows.some((c) => c.id === id)) {
        throw new Error(`updateCategory: unknown category "${id}"`);
      }
      await withTransaction(async () => {
        const set_: Record<string, unknown> = {};
        if (patch.name !== undefined) set_.name = patch.name;
        if (patch.colorKey !== undefined) set_.colorKey = patch.colorKey;
        if (patch.fixed !== undefined) set_.fixed = patch.fixed ? 1 : 0;
        // Undefined cadence preserves the stored value (edit-reconcile).
        if (patch.cadence !== undefined) set_.cadence = assertCadence(patch.cadence);
        if (Object.keys(set_).length === 0) return;
        getDb().update(schema.categories).set(set_).where(eq(schema.categories.id, id)).run();
      });
      await refresh();
    },
    updateIncomeSource: async (id, patch) => {
      const existing = get()._incomeSources.find((s) => s.id === id);
      if (!existing) throw new Error(`updateIncomeSource: unknown income source "${id}"`);
      if (patch.splits) {
        patch.splits.forEach((sp) => assertAccountExists(sp.accountId, 'updateIncomeSource split'));
      }
      await withTransaction(async () => {
        const db = getDb();
        const set_: Record<string, unknown> = {};
        if (patch.name !== undefined) set_.name = patch.name;
        if (patch.amount !== undefined) set_.amount = patch.amount;
        if (patch.schedule !== undefined) {
          set_.scheduleKind = patch.schedule.kind;
          set_.scheduleAnchorDate = patch.schedule.anchorDate;
          set_.scheduleSemimonthlyDay1 = patch.schedule.semimonthlyDays?.[0] ?? null;
          set_.scheduleSemimonthlyDay2 = patch.schedule.semimonthlyDays?.[1] ?? null;
        }
        if (Object.keys(set_).length > 0) {
          db.update(schema.incomeSources).set(set_).where(eq(schema.incomeSources.id, id)).run();
        }
        if (patch.splits) {
          db.delete(schema.incomeSplits).where(eq(schema.incomeSplits.sourceId, id)).run();
          const now = new Date().toISOString();
          patch.splits.forEach((sp) => {
            db.insert(schema.incomeSplits)
              .values({
                id: generateId(),
                sourceId: id,
                accountId: sp.accountId,
                ratio: sp.ratio,
                createdAt: now,
              })
              .run();
          });
        }
      });
      await refresh();
    },
    updateSettings: async (updates) => {
      const current = get()._settingsRow;
      if (!current) throw new Error('Settings not initialized');
      await withTransaction(async () => {
        getDb()
          .update(schema.settings)
          .set({ ...updates, updatedAt: new Date().toISOString() })
          .where(eq(schema.settings.id, current.id))
          .run();
      });
      await refresh();
    },
    addTransaction: async (input) => {
      // TODO(team3): legacy add path. Amount is treated as already-cents.
      if (input.type === 'income') return;
      await get().addExpense({
        accountId: input.accountId,
        categoryId: input.categoryId ?? '',
        amount: C(input.amount),
        date: input.date,
        note: input.note,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Row → contract record mappers (module scope; no store access).
// ---------------------------------------------------------------------------
function toCarryoverEntry(e: CarryoverRow): CarryoverEntry {
  return {
    id: e.id,
    categoryId: e.categoryId,
    weekStart: e.weekStart,
    kind: e.kind as CarryoverEntry['kind'],
    amount: C(e.amount),
    counterpartWeekStart: e.counterpartWeekStart,
    pairId: e.pairId,
    attributionMonth: e.attributionMonth,
    createdAt: e.createdAt,
  };
}

function toTransactionRecord(t: TxnRow): TransactionRecord {
  return {
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId ?? '',
    amount: C(t.amount),
    kind: t.kind as TransactionRecord['kind'],
    date: t.date,
    note: t.note,
  };
}
