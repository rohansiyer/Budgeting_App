/**
 * Team 4 (Pond) — scriptable in-memory fakes for engine tests.
 *
 * FakeReadPort implements EvaluationReadPort with per-month scriptable inputs
 * and models the cross-month-borrow duck guard: each unit of spend carries an
 * `attributionMonth`, and getMonthCategoryTotals buckets by attributionMonth
 * (never the calendar month of the txn). FakeDuckStore implements the engine's
 * DuckPersistencePort in memory.
 *
 * These are TEST doubles — they live in src/ducks so tests can import them, but
 * they are never shipped in the app.
 */

import { cents, ZERO, type Cents } from '../lib/money';
import type {
  CarryoverEntry,
  Duck,
  DuckEvaluation,
  EvaluationReadPort,
  MonthKey,
} from '../types/contracts';
import type { DuckPersistencePort } from './engine';

interface CatCfg {
  id: string;
  fixed: boolean;
  /** Monthly budget basis by month; used only for enveloped (non-fixed) cats. */
  budgetByMonth: Map<MonthKey, Cents>;
}

interface SpendUnit {
  categoryId: string;
  attributionMonth: MonthKey;
  amount: Cents;
}

export class FakeReadPort implements EvaluationReadPort {
  private cats = new Map<string, CatCfg>();
  private spends: SpendUnit[] = [];
  private income = new Map<MonthKey, Cents>();
  private savings = new Map<MonthKey, Cents>();
  private bills = new Map<MonthKey, { expected: number; paid: number }>();
  private carryover: CarryoverEntry[] = [];
  private active = new Set<MonthKey>();

  /**
   * Register a category. Enveloped categories are non-fixed with a budget.
   * Idempotent: re-registering an existing id preserves its budget map (only
   * updates the fixed flag), so calling it once per month is safe.
   */
  addCategory(id: string, opts: { fixed?: boolean } = {}): this {
    const existing = this.cats.get(id);
    if (existing) {
      existing.fixed = opts.fixed ?? existing.fixed;
    } else {
      this.cats.set(id, { id, fixed: opts.fixed ?? false, budgetByMonth: new Map() });
    }
    return this;
  }

  /** Set the month's budget basis for an enveloped category. */
  setBudget(categoryId: string, month: MonthKey, budget: Cents): this {
    const c = this.mustCat(categoryId);
    c.budgetByMonth.set(month, budget);
    this.active.add(month);
    return this;
  }

  /**
   * Add spend attributed to `attributionMonth`. For a plain in-month expense,
   * attributionMonth is the calendar month. For a cross-month borrow, pass the
   * month the overspend is attributed to (duck guard §5.4).
   */
  addSpend(categoryId: string, attributionMonth: MonthKey, amount: Cents): this {
    this.mustCat(categoryId);
    this.spends.push({ categoryId, attributionMonth, amount });
    this.active.add(attributionMonth);
    return this;
  }

  setIncome(month: MonthKey, amount: Cents): this {
    this.income.set(month, amount);
    this.active.add(month);
    return this;
  }
  setSavings(month: MonthKey, amount: Cents): this {
    this.savings.set(month, amount);
    this.active.add(month);
    return this;
  }
  setBills(month: MonthKey, expected: number, paid: number): this {
    this.bills.set(month, { expected, paid });
    this.active.add(month);
    return this;
  }
  addCarryover(entry: CarryoverEntry): this {
    this.carryover.push(entry);
    return this;
  }
  /** Force a month into the active list even with no other data. */
  markActive(month: MonthKey): this {
    this.active.add(month);
    return this;
  }

  private mustCat(id: string): CatCfg {
    const c = this.cats.get(id);
    if (!c) throw new Error(`FakeReadPort: unknown category "${id}" (addCategory first)`);
    return c;
  }

  // --- EvaluationReadPort ---------------------------------------------------

  async getMonthCategoryTotals(month: MonthKey) {
    return Array.from(this.cats.values()).map((c) => {
      const spent = this.spends
        .filter((s) => s.categoryId === c.id && s.attributionMonth === month)
        .reduce<Cents>((acc, s) => cents(acc + s.amount), ZERO);
      const budget = c.fixed ? null : c.budgetByMonth.get(month) ?? null;
      return { categoryId: c.id, fixed: c.fixed, spent, budget };
    });
  }

  async getMonthIncomeTotal(month: MonthKey): Promise<Cents> {
    return this.income.get(month) ?? ZERO;
  }
  async getMonthSavingsTotal(month: MonthKey): Promise<Cents> {
    return this.savings.get(month) ?? ZERO;
  }
  async getMonthFixedBillStatus(month: MonthKey) {
    return this.bills.get(month) ?? { expected: 0, paid: 0 };
  }
  async getCarryoverEntries(query: { month?: MonthKey; categoryId?: string }) {
    return this.carryover.filter(
      (e) =>
        (query.month === undefined || e.attributionMonth === query.month) &&
        (query.categoryId === undefined || e.categoryId === query.categoryId),
    );
  }
  async getActiveMonths(_chapterId: string): Promise<MonthKey[]> {
    return Array.from(this.active).sort();
  }
}

export class FakeDuckStore implements DuckPersistencePort {
  private evaluations: DuckEvaluation[] = [];
  private ducks: Duck[] = [];
  private accessoryTier = 0;
  commits = 0;

  constructor(seed?: { ducks?: Duck[]; accessoryTier?: number; evaluations?: DuckEvaluation[] }) {
    if (seed?.ducks) this.ducks = seed.ducks.map((d) => ({ ...d }));
    if (seed?.accessoryTier !== undefined) this.accessoryTier = seed.accessoryTier;
    if (seed?.evaluations) this.evaluations = seed.evaluations.map((e) => ({ ...e }));
  }

  async loadState(_chapterId: string) {
    return {
      evaluations: this.evaluations.map((e) => ({ ...e })),
      ducks: this.ducks.map((d) => ({ ...d })),
      accessoryTier: this.accessoryTier,
    };
  }

  async commit(
    _chapterId: string,
    batch: { newEvaluations: DuckEvaluation[]; ducks: Duck[]; accessoryTier: number },
  ) {
    this.commits += 1;
    this.evaluations.push(...batch.newEvaluations.map((e) => ({ ...e })));
    this.ducks = batch.ducks.map((d) => ({ ...d }));
    this.accessoryTier = batch.accessoryTier;
  }

  async renameDuck(duckId: string, name: string) {
    const d = this.ducks.find((x) => x.id === duckId);
    if (d) d.name = name;
  }

  // --- test inspection ------------------------------------------------------
  peekEvaluations(): DuckEvaluation[] {
    return this.evaluations.map((e) => ({ ...e }));
  }
  peekDucks(): Duck[] {
    return this.ducks.map((d) => ({ ...d }));
  }
  peekTier(): number {
    return this.accessoryTier;
  }
}

/** Deterministic id generator for tests: id-1, id-2, … */
export function makeIdGen(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
