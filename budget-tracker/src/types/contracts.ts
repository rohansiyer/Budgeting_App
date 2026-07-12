/**
 * WAVE-0 CONTRACT — Shared domain types (rev 2, post-review)
 *
 * Teams build against these signatures. Changing a contract requires an
 * orchestrator-approved commit touching this file; drift found at a merge
 * gate is a blocking finding.
 *
 * References: DucksInARow_DesignDoc_v2.md §4–§6.
 */

import type { Cents } from '../lib/money';

/** 'YYYY-MM-DD' (local, no time component) */
export type ISODate = string;
/** 'YYYY-MM' */
export type MonthKey = string;
/** ISODate of the Monday starting a budget week */
export type WeekStart = ISODate;
export interface DateRange {
  from: ISODate;
  to: ISODate; // inclusive
}

// ---------------------------------------------------------------------------
// Setup / configurability (Team 2 owns implementations)
// ---------------------------------------------------------------------------

export type IncomeScheduleKind = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface IncomeSchedule {
  kind: IncomeScheduleKind;
  /** A known payday the schedule is anchored to. IGNORED for semimonthly (which uses only semimonthlyDays). */
  anchorDate: ISODate;
  /** Days of month for semimonthly (e.g. [1, 15]); clamped per month to month length. */
  semimonthlyDays?: [number, number];
}

/**
 * Payday projection — Team 2 implements in src/lib/schedule.ts; Team 3
 * renders the results (Home payday bar, Calendar mint rings).
 */
export type PaydaysBetween = (schedule: IncomeSchedule, range: DateRange) => ISODate[];

/** NOTE: legacy `IncomeSplit`/`IncomeConfig` in src/types/index.ts are
 * deprecated and deleted by Team 1's retrofit. Import ONLY these. */
export interface IncomeSplitConfig {
  accountId: string;
  /** Non-negative weight; splits are applied via money.allocate (cent-conserving). */
  ratio: number;
}

export interface IncomeSourceConfig {
  id: string;
  name: string;
  amount: Cents;
  schedule: IncomeSchedule;
  splits: IncomeSplitConfig[];
}

export interface AccountConfig {
  id: string;
  name: string;
  institution: string | null;
  kind: 'spending' | 'savings';
  /** Opening balance at openedOn; the basis for getAccountBalance. */
  startingBalance: Cents;
  openedOn: ISODate;
}

/** Budget cadence: the whole envelope UI (meters, borrow prompts, warnings)
 * respects an envelope's own cadence. Defaults to 'weekly'. */
export type CadenceType = 'weekly' | 'monthly';

/**
 * Categories cover ALL spend. Variable-spend categories additionally have
 * an envelope (budget + carryover). Fixed categories (rent, utilities…)
 * have `envelope: null` and are evaluated by Duck Goal 1, not meters.
 */
export interface CategoryConfig {
  id: string;
  name: string;
  colorKey: CategoryColorKey;
  fixed: boolean;
  /** 'weekly' | 'monthly'. Always present on reads (stored notNull, default 'weekly'). */
  cadence: CadenceType;
  envelope: EnvelopeConfig | null;
}

export interface EnvelopeConfig {
  period: 'weekly' | 'monthly';
  budget: Cents;
  /** Monday-prompt default for leftovers. */
  carryoverDefault: 'ask' | 'roll' | 'sweep' | 'reset';
}

/** A "chapter" = one life-configuration era. New job/city → new chapter. */
export interface Chapter {
  id: string;
  name: string;
  startedAt: ISODate;
  archivedAt: ISODate | null;
}

// ---------------------------------------------------------------------------
// Carryover (Team 1 owns storage + conservation; Team 3 owns UI)
// ---------------------------------------------------------------------------

export type CarryoverKind =
  | 'roll_out' // − from source week (leftover leaves)
  | 'roll_in' // + to destination week (paired 1:1 with a roll_out)
  | 'sweep_to_savings' // − leftover leaves the envelope system to savings
  | 'borrow_in' // + to this week, taken from next week
  | 'borrow_repay'; // − from next week (paired 1:1 with a borrow_in)

export interface CarryoverEntry {
  id: string;
  categoryId: string;
  /** Week whose budget this entry adjusts. */
  weekStart: WeekStart;
  kind: CarryoverKind;
  /** Always positive; sign is implied by kind ('_in' adds, others subtract). */
  amount: Cents;
  /** The other side of the transfer (paired entry's weekStart); null for sweeps. */
  counterpartWeekStart: WeekStart | null;
  /** Links the two entries of a roll/borrow pair. Null for sweeps. */
  pairId: string | null;
  /** Month the SPEND is attributed to for duck evaluation (duck guard §5.4). */
  attributionMonth: MonthKey;
  createdAt: string;
}

/**
 * CONSERVATION LAW (adversary-tested): paired entries (roll_out/roll_in,
 * borrow_in/borrow_repay) share a pairId and have EQUAL amounts, so summed
 * budget across all weeks equals configured budget × weeks − sweeps.
 *
 * BORROWING (v0.3, cadence-aware & uncapped): every envelope can borrow from
 * ITS OWN next cycle — a weekly-cadence envelope from next week, a
 * monthly-cadence envelope from next calendar month. There is NO cap; the
 * only limits are that the amount is a positive whole number of cents and the
 * category exists with a configured budget. The honest math is the guardrail
 * (see `nextCycleStartState` — the UI shows exactly what the next cycle starts
 * with). For a MONTHLY borrow the two legs live at the first-of-month
 * (`YYYY-MM-01`) of the current and next month; for a WEEKLY borrow they live
 * at the current and next Monday (as before). Both legs of any borrow attribute
 * to the ORIGIN period's month (the month the spend belongs to) so a
 * cross-period borrow can never dodge that month's duck verdict (duck guard
 * §5.4).
 */

export interface EnvelopeWeekState {
  categoryId: string;
  weekStart: WeekStart;
  configuredBudget: Cents;
  rolledIn: Cents;
  rolledOut: Cents;
  sweptOut: Cents;
  borrowedIn: Cents;
  repaying: Cents;
  spent: Cents;
  /** configured + rolledIn + borrowedIn − rolledOut − sweptOut − repaying − spent */
  remaining: Cents;
}

/**
 * What an envelope's NEXT cycle will start with, for the borrow prompt (F3).
 * Composed from committed caches (sync). `budget` is the next cycle's
 * configured budget; `alreadyOwed` is the sum of borrow repayments already
 * charged to that next cycle by prior borrows; `startsWith = budget −
 * alreadyOwed` — the plan money the next cycle currently begins with, before
 * the contemplated borrow. The prompt shows `startsWith`, then subtracts the
 * amount the user is about to borrow to preview the result.
 */
export interface NextCycleState {
  /** ISODate the next cycle begins: next Monday (weekly) or first-of-next-month (monthly). */
  cycleStart: ISODate;
  budget: Cents;
  alreadyOwed: Cents;
  startsWith: Cents;
}

// ---------------------------------------------------------------------------
// Import data layer (Team 1 owns tables + store; src/import owns the engine)
// ---------------------------------------------------------------------------

/**
 * A learned merchant → category mapping. `normalizedMerchant` is the output of
 * `matching.normalizeMerchant` (uppercased, store-number/punctuation stripped),
 * UNIQUE per chapter. Assigning a merchant once makes every future import of
 * that merchant land in the same category ("Food forever").
 */
export interface MerchantCorrection {
  id: string;
  normalizedMerchant: string;
  categoryId: string;
  createdAt: string;
}

/**
 * An explicit recurring bill the forecast and "Mark as bill" write to.
 * `dueDay` is 1..31 with CLAMP-TO-MONTH-END semantics: a bill due on 31 falls on
 * the last day of a shorter month (resolve per month via min(dueDay, daysInMonth)).
 * `active:false` is the non-destructive remove (row retained, excluded from the
 * forecast).
 */
export interface RecurringBill {
  id: string;
  name: string;
  categoryId: string;
  amountCents: Cents;
  dueDay: number;
  active: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Duck System (Team 4 owns engine; Team 1 owns tables + read port)
// ---------------------------------------------------------------------------

export interface GoalResult {
  met: boolean;
  /** Human-readable, e.g. "Gas $38 under · Food $12 under" */
  detail: string;
}

export interface DuckEvaluation {
  id: string;
  chapterId: string;
  month: MonthKey;
  evaluatedAt: string;
  goalFixedBills: GoalResult;
  goalVariableBudgets: GoalResult;
  goalSavingsRate: GoalResult;
  outcome: 'gain' | 'hold' | 'lose' | 'fancy_upgrade';
  duckCountAfter: number; // 0..12
  accessoryTierAfter: number; // 0 = none, 1 = bowtie, 2 = monocle, 3 = top hat
  /** Verdicts are FINAL. No API exists to mutate an issued evaluation. */
  readonly final: true;
}

export interface Duck {
  id: string;
  /** Optional user-given name ("Gerald"). */
  name: string | null;
  earnedMonth: MonthKey;
}

/**
 * Month-granular read port the DuckEngine evaluates against. Team 1
 * implements it on the store; Team 4 consumes it. All totals apply the
 * duck guard: spend covered by a cross-month borrow counts toward the
 * CarryoverEntry.attributionMonth, not the calendar month of the txn.
 */
export interface EvaluationReadPort {
  /** Per-category spend for the month (attribution-adjusted) + that month's budget basis (configured × weeks in month + net rolls). */
  getMonthCategoryTotals(month: MonthKey): Promise<
    Array<{ categoryId: string; fixed: boolean; spent: Cents; budget: Cents | null }>
  >;
  getMonthIncomeTotal(month: MonthKey): Promise<Cents>;
  /** Transfers into savings-kind accounts + sweeps, for the savings-rate goal. */
  getMonthSavingsTotal(month: MonthKey): Promise<Cents>;
  /** Recurring fixed bills expected vs confirmed-paid for the month. */
  getMonthFixedBillStatus(month: MonthKey): Promise<{ expected: number; paid: number }>;
  getCarryoverEntries(query: { month?: MonthKey; categoryId?: string }): Promise<CarryoverEntry[]>;
  /** Months with any activity, oldest first — the evaluation backlog basis. */
  getActiveMonths(chapterId: string): Promise<MonthKey[]>;
}

/**
 * Persistence surface for issued evaluations + the flock. Team 1 implements
 * on the store (duck tables); Team 4's engine consumes it. `commit` runs
 * inside AtomicDb.withTransaction and NEVER mutates or deletes an issued
 * evaluation (verdict finality). Starter duck: the ENGINE self-seeds the
 * single starting duck (iff no evaluations and empty flock) — Team 1 does
 * NOT seed ducks at chapter creation.
 */
export interface DuckPersistencePort {
  loadState(chapterId: string): Promise<{
    evaluations: DuckEvaluation[];
    /** The live flock. Its length IS the current duck count. */
    ducks: Duck[];
    accessoryTier: number;
  }>;
  commit(
    chapterId: string,
    batch: { newEvaluations: DuckEvaluation[]; ducks: Duck[]; accessoryTier: number },
  ): Promise<void>;
  renameDuck(duckId: string, name: string): Promise<void>;
}

export interface DuckEngine {
  /**
   * Evaluate every unevaluated completed month IN ORDER for the active
   * chapter and persist results. Returns newly-issued evaluations
   * oldest-first (UI presents them stacked). Idempotent: months with an
   * existing evaluation are never re-evaluated.
   */
  evaluatePendingMonths(now: ISODate): Promise<DuckEvaluation[]>;
  /**
   * Same, plus the non-persisted big-win flag (≥20% under budget in ALL
   * envelopes) — the official happy-dance signal. Celebration only, never
   * a mechanical effect.
   */
  evaluatePendingMonthsDetailed(
    now: ISODate,
  ): Promise<Array<{ evaluation: DuckEvaluation; bigWin: boolean }>>;
  getFlock(): Promise<{ ducks: Duck[]; accessoryTier: number }>;
}

// ---------------------------------------------------------------------------
// Store actions + read surface (Team 1 implements; all teams call)
// ---------------------------------------------------------------------------

export interface AtomicDb {
  /** Every multi-row mutation runs inside this (async drizzle transaction). Rollback on throw. */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** Undo window for destructive actions. undo() after expiry resolves false. */
export const UNDO_WINDOW_MS = 6000;

export interface TransactionRecord {
  id: string;
  accountId: string;
  categoryId: string;
  amount: Cents; // positive = outflow for expenses; income rows are positive inflows with kind
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in';
  date: ISODate;
  note: string | null;
  /** For income: the source + per-account split amounts (display inline). */
  incomeSplit?: Array<{ accountId: string; amount: Cents }>;
}

export interface StoreContract {
  // --- mutations -----------------------------------------------------------
  addExpense(input: {
    accountId: string;
    categoryId: string; // any category, fixed or enveloped
    amount: Cents;
    date: ISODate;
    note?: string;
  }): Promise<string>;
  addIncome(input: { sourceId: string; date: ISODate; amount?: Cents }): Promise<string>;
  editTransaction(
    id: string,
    patch: Partial<{ amount: Cents; categoryId: string; note: string }>,
  ): Promise<void>;
  /** Soft-delete; permanent after UNDO_WINDOW_MS. */
  deleteTransaction(id: string): Promise<{ undo: () => Promise<boolean>; expiresAt: number }>;
  transfer(input: {
    fromAccountId: string;
    toAccountId: string;
    amount: Cents;
    date: ISODate;
  }): Promise<string>;

  // --- config mutations (Setup wizard / Settings write through these) -------
  createAccount(input: {
    name: string;
    institution: string | null;
    kind: 'spending' | 'savings';
    startingBalance: Cents;
    openedOn: ISODate;
  }): Promise<AccountConfig>;
  renameAccount(accountId: string, name: string): Promise<void>;
  createIncomeSource(input: Omit<IncomeSourceConfig, 'id'>): Promise<IncomeSourceConfig>;
  /** `cadence` is optional at the write boundary; omitted defaults to 'weekly'. */
  createCategory(
    input: Omit<CategoryConfig, 'id' | 'cadence'> & { cadence?: CadenceType },
  ): Promise<CategoryConfig>;
  updateEnvelope(categoryId: string, envelope: EnvelopeConfig | null): Promise<void>;
  createChapter(input: { name: string; startedAt: ISODate }): Promise<Chapter>;
  archiveChapter(chapterId: string, archivedAt: ISODate): Promise<void>;
  /** v0.2 edit-setup flow: update in place, never insert (prevents duplicate configs). */
  updateAccount(
    accountId: string,
    patch: Partial<Pick<AccountConfig, 'name' | 'institution' | 'kind' | 'startingBalance'>>,
  ): Promise<void>;
  updateCategory(
    categoryId: string,
    patch: Partial<Pick<CategoryConfig, 'name' | 'colorKey' | 'fixed' | 'cadence'>>,
  ): Promise<void>;
  updateIncomeSource(sourceId: string, patch: Partial<Omit<IncomeSourceConfig, 'id'>>): Promise<void>;

  // --- import data layer ---------------------------------------------------
  /**
   * Learn (or re-point) a merchant → category mapping. Keyed by
   * `normalizedMerchant` within the active chapter: an existing mapping for the
   * same normalized merchant is UPDATED in place (never duplicated). Validates
   * the category exists before writing.
   */
  upsertMerchantCorrection(input: {
    normalizedMerchant: string;
    categoryId: string;
  }): Promise<MerchantCorrection>;
  /** Add a recurring bill (active). Validates category, a 1..31 dueDay, and a positive integer amount. */
  addRecurringBill(input: {
    name: string;
    categoryId: string;
    amountCents: Cents;
    dueDay: number;
  }): Promise<RecurringBill>;
  /** Patch a recurring bill in place. `active:false` is the non-destructive remove. */
  updateRecurringBill(
    id: string,
    patch: Partial<Pick<RecurringBill, 'name' | 'categoryId' | 'amountCents' | 'dueDay' | 'active'>>,
  ): Promise<void>;

  // --- carryover -----------------------------------------------------------
  rollForward(categoryId: string, fromWeek: WeekStart): Promise<void>;
  sweepToSavings(categoryId: string, fromWeek: WeekStart, savingsAccountId: string): Promise<void>;
  /**
   * Borrow from an envelope's OWN next cycle, dispatching on the category's
   * cadence: a weekly-cadence envelope borrows from next week, a
   * monthly-cadence envelope from next calendar month. Uncapped — throws only
   * if the amount is not a positive whole number of cents, the category does
   * not exist, or it has no configured envelope budget. `currentPeriodStart`
   * is any date inside the current cycle (normalized internally: to the
   * Monday for weekly, to the month for monthly).
   */
  borrowFromNextCycle(categoryId: string, currentPeriodStart: ISODate, amount: Cents): Promise<void>;
  /**
   * @deprecated Use `borrowFromNextCycle`. Thin delegate kept for existing
   * weekly-envelope callers; throws if invoked on a monthly-cadence category.
   */
  borrowFromNextWeek(categoryId: string, week: WeekStart, amount: Cents): Promise<void>;
  /**
   * What the envelope's next cycle will start with (for the borrow prompt).
   * Sync read over committed caches. Throws on an unknown category id.
   */
  nextCycleStartState(categoryId: string, currentPeriodStart: ISODate): NextCycleState;

  // --- read surface (screens + engine) --------------------------------------
  listAccounts(): AccountConfig[];
  listCategories(): CategoryConfig[];
  listIncomeSources(): IncomeSourceConfig[];
  getActiveChapter(): Chapter;

  /** Learned merchant → category corrections for the active chapter. */
  getMerchantCorrections(): MerchantCorrection[];
  /** Recurring bills for the active chapter (active AND inactive; consumers filter on `active`). */
  getRecurringBills(): RecurringBill[];

  getTransactions(range: DateRange): TransactionRecord[];
  /** date → net outflow, for week bars + calendar heatmap (income excluded). */
  getDaySpendTotals(range: DateRange): Map<ISODate, Cents>;
  getPaydays(range: DateRange): ISODate[]; // union over income sources, via Team 2's PaydaysBetween

  getEnvelopeWeekState(categoryId: string, week: WeekStart): EnvelopeWeekState;
  /** Sum of enveloped remaining for the week — the Home hero number. */
  getSafeToSpend(week: WeekStart): Cents;
  getAccountBalance(accountId: string, asOf: ISODate): Cents;
  /** Pond dual-donut: per-category plan vs month-to-date actual. */
  getPlanVsActual(month: MonthKey): Array<{
    categoryId: string;
    planned: Cents;
    actual: Cents;
  }>;

  /** Month-granular read port for the DuckEngine (see EvaluationReadPort). */
  evaluation: EvaluationReadPort;
}

// ---------------------------------------------------------------------------
// Category identity colors (Team 3 owns rendering; validated CVD-safe)
// ---------------------------------------------------------------------------

export type CategoryColorKey = 'violet' | 'amber' | 'mint' | 'blue' | 'pink';
