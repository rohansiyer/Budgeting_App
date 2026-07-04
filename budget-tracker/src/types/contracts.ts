/**
 * WAVE-0 CONTRACT — Shared domain types
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

// ---------------------------------------------------------------------------
// Setup / configurability (Team 2 owns implementations)
// ---------------------------------------------------------------------------

export type IncomeScheduleKind = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface IncomeSchedule {
  kind: IncomeScheduleKind;
  /** A known payday the schedule is anchored to (weekly/biweekly/monthly). */
  anchorDate: ISODate;
  /** Days of month for semimonthly (e.g. [1, 15]); clamped to month length. */
  semimonthlyDays?: [number, number];
}

export interface IncomeSplit {
  accountId: string;
  /** Non-negative weight; splits are applied via money.allocate (cent-conserving). */
  ratio: number;
}

export interface IncomeSourceConfig {
  id: string;
  name: string;
  amount: Cents;
  schedule: IncomeSchedule;
  splits: IncomeSplit[];
}

export interface EnvelopeConfig {
  /** categoryId of a variable-spend category */
  id: string;
  name: string;
  colorKey: CategoryColorKey;
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
  | 'roll_in' // + to this week, from last week's leftover
  | 'sweep_to_savings' // leftover leaves the envelope system to savings
  | 'borrow_in' // + to this week, taken from next week
  | 'borrow_repay'; // − from this week, repaying last week's borrow

export interface CarryoverEntry {
  id: string;
  envelopeId: string;
  /** Week whose budget this entry adjusts. */
  weekStart: WeekStart;
  kind: CarryoverKind;
  /** Always positive; sign is implied by kind (roll_in/borrow_in add, others subtract). */
  amount: Cents;
  /** Week the money came from / goes to (the other side of the transfer). */
  counterpartWeekStart: WeekStart;
  /** Month the SPEND is attributed to for duck evaluation (duck guard §5.4). */
  attributionMonth: MonthKey;
  createdAt: string;
}

/**
 * CONSERVATION LAW (adversary-tested): for any envelope and any pair of
 * linked entries, amounts match exactly; total budget across all weeks
 * equals configured budget × weeks ± sweeps. Borrow caps: counterpart is
 * always the immediately following week, and total borrow_in for a week
 * ≤ 50% of that following week's configured budget.
 */

export interface EnvelopeWeekState {
  envelopeId: string;
  weekStart: WeekStart;
  configuredBudget: Cents;
  rolledIn: Cents;
  borrowedIn: Cents;
  repaying: Cents;
  spent: Cents;
  /** configured + rolledIn + borrowedIn − repaying − spent */
  remaining: Cents;
}

// ---------------------------------------------------------------------------
// Duck System (Team 4 owns engine; Team 1 owns tables)
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

export interface DuckEngine {
  /**
   * Evaluate every unevaluated completed month IN ORDER for the active
   * chapter and persist results. Returns newly-issued evaluations
   * oldest-first (UI presents them stacked). Idempotent: months with an
   * existing evaluation are never re-evaluated.
   */
  evaluatePendingMonths(now: ISODate): Promise<DuckEvaluation[]>;
  getFlock(): Promise<{ ducks: Duck[]; accessoryTier: number }>;
}

// ---------------------------------------------------------------------------
// Store actions (Team 1 implements; all teams call)
// ---------------------------------------------------------------------------

export interface AtomicDb {
  /** Every multi-row mutation runs inside this. Rollback on throw. */
  withTransaction<T>(fn: () => T): T;
}

export interface StoreContract {
  // transactions
  addExpense(input: {
    accountId: string;
    envelopeId: string;
    amount: Cents;
    date: ISODate;
    note?: string;
  }): Promise<string>;
  addIncome(input: { sourceId: string; date: ISODate; amount?: Cents }): Promise<string>;
  editTransaction(id: string, patch: Partial<{ amount: Cents; envelopeId: string; note: string }>): Promise<void>;
  /** Soft-delete with undo window; permanent after commitUndoDeadline. */
  deleteTransaction(id: string): Promise<{ undo: () => Promise<void> }>;
  transfer(input: { fromAccountId: string; toAccountId: string; amount: Cents; date: ISODate }): Promise<string>;

  // carryover
  rollForward(envelopeId: string, fromWeek: WeekStart): Promise<void>;
  sweepToSavings(envelopeId: string, fromWeek: WeekStart, savingsAccountId: string): Promise<void>;
  /** Throws if cap exceeded (one week ahead, ≤50% of next week's budget). */
  borrowFromNextWeek(envelopeId: string, week: WeekStart, amount: Cents): Promise<void>;

  // selectors
  getEnvelopeWeekState(envelopeId: string, week: WeekStart): EnvelopeWeekState;
  getSafeToSpend(week: WeekStart): Cents;
  getAccountBalance(accountId: string, asOf: ISODate): Cents;
}

// ---------------------------------------------------------------------------
// Category identity colors (Team 3 owns rendering; validated CVD-safe)
// ---------------------------------------------------------------------------

export type CategoryColorKey = 'violet' | 'amber' | 'mint' | 'blue' | 'pink';
