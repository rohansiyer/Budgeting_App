/**
 * Team 4 (Pond) — Duck System evaluation engine.
 *
 * Implements the DuckEngine contract (src/types/contracts.ts) against the
 * month-granular EvaluationReadPort (Team 1) plus a DuckPersistencePort that
 * this module DEFINES (the wave-0 contract does not yet expose a persistence
 * surface for issued evaluations / the flock — see report + contract proposal).
 *
 * Correctness rules are the whole game; see the block comments on each rule.
 * No floats touch money paths — every money comparison is integer-cents math.
 */

import type { Cents } from '../lib/money';
import { formatCents } from '../lib/money';
import type {
  Chapter,
  Duck,
  DuckEngine,
  DuckEvaluation,
  EvaluationReadPort,
  GoalResult,
  ISODate,
  MonthKey,
} from '../types/contracts';

// ---------------------------------------------------------------------------
// Persistence port (Team-4-defined; proposed for promotion to the contract)
// ---------------------------------------------------------------------------

/**
 * The engine reads its own prior output (issued evaluations) for idempotence
 * and chains the flock forward. Team 1 implements this on the store, backed by
 * the duck tables, and wraps `commit` in AtomicDb.withTransaction. `loadState`
 * is the single source of truth for the live flock (count === ducks.length).
 */
export interface DuckPersistencePort {
  loadState(chapterId: string): Promise<{
    /** All previously issued evaluations for the chapter (any order). */
    evaluations: DuckEvaluation[];
    /** The live flock. Its length IS the current duck count. */
    ducks: Duck[];
    /** Current flock-wide accessory tier (0..3). */
    accessoryTier: number;
  }>;
  /**
   * Atomically append the newly issued evaluations and replace the flock +
   * tier. Must run inside AtomicDb.withTransaction. Never mutates or deletes
   * an already-issued evaluation (verdict finality).
   */
  commit(
    chapterId: string,
    batch: {
      newEvaluations: DuckEvaluation[];
      ducks: Duck[];
      accessoryTier: number;
    },
  ): Promise<void>;
  /** Persist a user-given duck name. Team 1 wires storage; Results screen calls it. */
  renameDuck(duckId: string, name: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DuckEngineConfig {
  /** Savings-rate goal target as an integer percent of income. Default 30. */
  savingsTargetPercent: number;
  /** Flock cap; the fancy ladder begins here. Default 12. */
  duckCap: number;
  /** Highest accessory tier (0 none, 1 bowtie, 2 monocle, 3 top hat). Default 3. */
  maxAccessoryTier: number;
  /** "Big win" = under budget by at least this integer percent in ALL envelopes. Default 20. */
  bigWinThresholdPercent: number;
}

export const DEFAULT_DUCK_CONFIG: DuckEngineConfig = {
  savingsTargetPercent: 30,
  duckCap: 12,
  maxAccessoryTier: 3,
  bigWinThresholdPercent: 20,
};

/**
 * Persisted duck state failed an integrity check on load: the flock diverged
 * from the last issued verdict's duckCountAfter, or count/tier is outside the
 * contract range (0..12 / 0..3). RECOVERABLE by design (orchestrator ruling):
 * the engine refuses to evaluate or report on corrupt state rather than
 * silently compounding it. Recovery path: restore from backup or repair the
 * duck tables; issued evaluations are never touched.
 */
export class DuckStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuckStateError';
  }
}

export interface DuckEngineDeps {
  read: EvaluationReadPort;
  store: DuckPersistencePort;
  /** The chapter currently being lived in (StoreContract.getActiveChapter). */
  getActiveChapter: () => Chapter;
  /** Collision-safe id generator (Team 1's src/lib/ids.generateId in the app). */
  generateId: () => string;
  /** Optional human names for detail strings; defaults to the raw category id. */
  categoryName?: (categoryId: string) => string;
  config?: Partial<DuckEngineConfig>;
}

// ---------------------------------------------------------------------------
// Month helpers ('YYYY-MM' / 'YYYY-MM-DD' string math — no Date, no locale)
// ---------------------------------------------------------------------------

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}
function dayOf(date: ISODate): string {
  return date.slice(8, 10);
}

// ---------------------------------------------------------------------------
// Pure goal evaluation
// ---------------------------------------------------------------------------

export interface GoalBundle {
  goalFixedBills: GoalResult;
  goalVariableBudgets: GoalResult;
  goalSavingsRate: GoalResult;
  metCount: 0 | 1 | 2 | 3;
  /** ≥ threshold% under budget in ALL enveloped categories (≥1 required). */
  bigWin: boolean;
  /**
   * ORCHESTRATOR RULING (red-team E6 "empty-month duck farm"): a month with
   * zero transactions (no spend, no income, no savings) AND zero expected
   * fixed bills is dormant — it is SKIPPED entirely: no evaluation issued, no
   * gain/hold/lose. Vacuous 3/3 months can no longer mint ducks.
   */
  empty: boolean;
}

export class DuckEngineImpl implements DuckEngine {
  private readonly read: EvaluationReadPort;
  private readonly store: DuckPersistencePort;
  private readonly getActiveChapter: () => Chapter;
  private readonly generateId: () => string;
  private readonly nameFor: (id: string) => string;
  readonly config: DuckEngineConfig;

  constructor(deps: DuckEngineDeps) {
    this.read = deps.read;
    this.store = deps.store;
    this.getActiveChapter = deps.getActiveChapter;
    this.generateId = deps.generateId;
    this.nameFor = deps.categoryName ?? ((id) => id);
    this.config = { ...DEFAULT_DUCK_CONFIG, ...(deps.config ?? {}) };
  }

  // --- Goals ---------------------------------------------------------------

  /**
   * GOAL 1 — Fixed bills: every recurring fixed bill expected this month is
   * confirmed paid. Met iff paid === expected. expected === 0 (no fixed bills
   * configured) is vacuously met (nothing owed, nothing unpaid).
   */
  private goalFixedBills(status: { expected: number; paid: number }): GoalResult {
    const met = status.paid >= status.expected; // paid can't exceed expected; >= is defensive
    const detail =
      status.expected === 0
        ? 'No fixed bills due'
        : met
          ? `All ${status.expected} bills paid`
          : `${status.paid} of ${status.expected} bills paid`;
    return { met, detail };
  }

  /**
   * GOAL 2 — Variable budgets: every enveloped category's attribution-adjusted
   * spend is at most its monthly budget basis. The read port already applies
   * the cross-month borrow duck guard (spend attributed to the overspend's
   * attributionMonth), so the engine only compares spent ≤ budget. No enveloped
   * categories → vacuously met.
   *
   * ORCHESTRATOR RULING (basis definition, red-team E1): the monthly budget
   * basis INCLUDES rolls but EXCLUDES cross-month borrow_in and sweeps.
   * Implementing that basis is Team 1's EvaluationReadPort responsibility —
   * the contract's "configured × weeks in month + net rolls" is pinned to that
   * reading. In particular a cross-month borrow must NOT inflate the
   * attribution month's basis (that would re-enable duck laundering), and the
   * engine deliberately trusts the port's numbers rather than re-deriving them.
   */
  private goalVariableBudgets(
    cats: ReadonlyArray<{ categoryId: string; fixed: boolean; spent: Cents; budget: Cents | null }>,
  ): GoalResult {
    const enveloped = cats.filter((c) => !c.fixed && c.budget !== null);
    if (enveloped.length === 0) return { met: true, detail: 'No envelopes to check' };
    const overspent = enveloped.filter((c) => c.spent > (c.budget as Cents));
    const met = overspent.length === 0;
    if (met) {
      const parts = enveloped.map((c) => {
        const under = ((c.budget as number) - (c.spent as number)) as Cents;
        return `${this.nameFor(c.categoryId)} ${formatCents(under)} under`;
      });
      return { met, detail: parts.join(' · ') };
    }
    const parts = overspent.map((c) => {
      const over = ((c.spent as number) - (c.budget as number)) as Cents;
      return `${this.nameFor(c.categoryId)} ${formatCents(over)} over`;
    });
    return { met, detail: parts.join(' · ') };
  }

  /**
   * GOAL 3 — Savings rate: savings / income ≥ target (default 30%). Compared as
   * integer cents: savings*100 ≥ income*targetPercent (no float division).
   *
   * INCOME-ZERO RULE (documented decision): a savings *rate* is undefined with
   * no income denominator. We do NOT award the goal off a division by zero.
   *   • income 0 and savings 0  → MET  (nothing to save a fraction of; a
   *     genuinely income-less month is neutral, not a failure to punish).
   *   • income 0 and savings > 0 → NOT MET  (a rate can't be established with
   *     no income; also closes the "shuffle existing funds into savings during
   *     a no-income month to farm a duck" exploit — with income > 0 the goal
   *     forces savings to scale with income, so it can't be farmed cheaply).
   *
   * ORCHESTRATOR RULING (de minimis, red-team E7): tiny-income months use the
   * spec math unchanged — there is NO de-minimis income floor. A 1¢-income,
   * 1¢-savings month meets the goal (100% ≥ 30%, integer-exact) by design.
   */
  private goalSavingsRate(income: Cents, savings: Cents): GoalResult {
    const target = this.config.savingsTargetPercent;
    let met: boolean;
    let detail: string;
    if (income === 0) {
      met = savings === 0;
      detail = met
        ? 'No income this month'
        : `Saved ${formatCents(savings)} on no income (rate goal needs income)`;
    } else {
      met = (savings as number) * 100 >= (income as number) * target;
      // pct = floor(savings*100/income) purely for the human string (display edge).
      const pct = Math.floor(((savings as number) * 100) / (income as number));
      detail = `Saved ${pct}% of income (target ${target}%)`;
    }
    return { met, detail };
  }

  /**
   * BIG WIN — under budget by ≥ threshold% in EVERY enveloped category, with at
   * least one envelope in play. Celebration only (happy dance); no mechanical
   * effect on the flock. Integer form: spent*100 ≤ budget*(100 − threshold).
   */
  private detectBigWin(
    cats: ReadonlyArray<{ fixed: boolean; spent: Cents; budget: Cents | null }>,
  ): boolean {
    const enveloped = cats.filter((c) => !c.fixed && c.budget !== null);
    if (enveloped.length === 0) return false;
    const keep = 100 - this.config.bigWinThresholdPercent;
    return enveloped.every((c) => (c.spent as number) * 100 <= (c.budget as number) * keep);
  }

  private async evaluateGoals(month: MonthKey): Promise<GoalBundle> {
    const [cats, income, savings, bills] = await Promise.all([
      this.read.getMonthCategoryTotals(month),
      this.read.getMonthIncomeTotal(month),
      this.read.getMonthSavingsTotal(month),
      this.read.getMonthFixedBillStatus(month),
    ]);
    const goalFixedBills = this.goalFixedBills(bills);
    const goalVariableBudgets = this.goalVariableBudgets(cats);
    const goalSavingsRate = this.goalSavingsRate(income, savings);
    const metCount = (Number(goalFixedBills.met) +
      Number(goalVariableBudgets.met) +
      Number(goalSavingsRate.met)) as 0 | 1 | 2 | 3;
    // Dormancy per the empty-month ruling: no transactions of any kind (spend,
    // income, savings) and no fixed bills expected. Configured-but-untouched
    // envelopes do not count as activity.
    const empty =
      income === 0 &&
      savings === 0 &&
      bills.expected === 0 &&
      cats.every((c) => c.spent === 0);
    return {
      goalFixedBills,
      goalVariableBudgets,
      goalSavingsRate,
      metCount,
      bigWin: this.detectBigWin(cats),
      empty,
    };
  }

  // --- Lifecycle -----------------------------------------------------------

  /**
   * 3/3 → gain a duck (cap 12); AT the cap a perfect month is a fancy_upgrade
   * (+1 accessory tier, max 3) instead. 1–2/3 → hold. 0/3 → lose a duck
   * (floor 0). Accessory tier never decreases (a lost duck keeps the flock's
   * finery). At cap 12 with tier already maxed, a perfect month still reads as
   * fancy_upgrade (celebratory), tier unchanged.
   */
  private applyLifecycle(
    metCount: number,
    count: number,
    tier: number,
  ): { outcome: DuckEvaluation['outcome']; count: number; tier: number } {
    const { duckCap, maxAccessoryTier } = this.config;
    if (metCount === 3) {
      if (count < duckCap) return { outcome: 'gain', count: count + 1, tier };
      return { outcome: 'fancy_upgrade', count: duckCap, tier: Math.min(maxAccessoryTier, tier + 1) };
    }
    if (metCount === 0) return { outcome: 'lose', count: Math.max(0, count - 1), tier };
    return { outcome: 'hold', count, tier };
  }

  // --- Backlog selection ---------------------------------------------------

  /**
   * A month is evaluable iff it is a completed calendar month (strictly before
   * `now`'s month), it is not BEFORE the chapter existed, and it is not the
   * chapter's PARTIAL first month. The chapter start month is skipped unless
   * the chapter began on the 1st (then it is a full month). "First month
   * starts at 1 duck, no evaluation until the first FULL month completes."
   *
   * The pre-chapter guard (month < startMonth) closes two red-team exploits in
   * one check: (a) pre-chapter months leaking into getActiveMonths (data
   * migration / chapter re-key) minting ducks before any legitimate month, and
   * (b) a chapter with startedAt in the FUTURE of `now` evaluating months that
   * predate the chapter's existence entirely.
   */
  private isEvaluableMonth(chapter: Chapter, month: MonthKey, currentMonth: MonthKey): boolean {
    if (month >= currentMonth) return false; // not yet completed
    const startMonth = monthOf(chapter.startedAt);
    if (month < startMonth) return false; // pre-chapter / future-dated chapter (red team E5)
    const startedOnFirst = dayOf(chapter.startedAt) === '01';
    if (month === startMonth && !startedOnFirst) return false; // partial start month
    return true;
  }

  /**
   * Validate persisted duck state on load (orchestrator ruling, red-team E2/E4).
   * Throws DuckStateError — descriptive and recoverable — instead of silently
   * evaluating on corrupt state:
   *   • duck count must be within 0..duckCap and tier within 0..maxAccessoryTier
   *     (contract: duckCountAfter 0..12, accessoryTierAfter 0..3);
   *   • when evaluations exist, the live flock size must equal the latest
   *     evaluation's duckCountAfter (a mismatch means a non-atomic commit or
   *     external tampering desynced the flock from the final ledger).
   */
  private validateLoadedState(
    chapterId: string,
    state: { evaluations: DuckEvaluation[]; ducks: Duck[]; accessoryTier: number },
  ): void {
    const { duckCap, maxAccessoryTier } = this.config;
    if (state.ducks.length > duckCap) {
      throw new DuckStateError(
        `Duck state for chapter ${chapterId} is corrupt: flock has ${state.ducks.length} ducks, ` +
          `contract maximum is ${duckCap}. Refusing to evaluate; restore from backup or repair the duck tables.`,
      );
    }
    if (
      !Number.isInteger(state.accessoryTier) ||
      state.accessoryTier < 0 ||
      state.accessoryTier > maxAccessoryTier
    ) {
      throw new DuckStateError(
        `Duck state for chapter ${chapterId} is corrupt: accessory tier ${state.accessoryTier} ` +
          `is outside 0..${maxAccessoryTier}. Refusing to evaluate; restore from backup or repair the duck tables.`,
      );
    }
    if (state.evaluations.length > 0) {
      const latest = state.evaluations.reduce((a, b) => (a.month >= b.month ? a : b));
      if (latest.duckCountAfter !== state.ducks.length) {
        throw new DuckStateError(
          `Duck state for chapter ${chapterId} is corrupt: latest evaluation (${latest.month}) ` +
            `recorded duckCountAfter=${latest.duckCountAfter} but the live flock has ` +
            `${state.ducks.length} ducks. Issued verdicts are final and will not be altered; ` +
            `restore from backup or repair the duck tables to reconcile the flock.`,
        );
      }
    }
  }

  // --- Public API ----------------------------------------------------------

  async evaluatePendingMonths(now: ISODate): Promise<DuckEvaluation[]> {
    const detailed = await this.evaluatePendingMonthsDetailed(now);
    return detailed.map((d) => d.evaluation);
  }

  /**
   * Same as evaluatePendingMonths but also surfaces the big-win flag per issued
   * evaluation, so the Results screen can trigger the happy dance (the contract
   * DuckEvaluation has no big-win field — this is the additive channel).
   */
  async evaluatePendingMonthsDetailed(
    now: ISODate,
  ): Promise<Array<{ evaluation: DuckEvaluation; bigWin: boolean }>> {
    const chapter = this.getActiveChapter();
    const currentMonth = monthOf(now);

    const [activeMonths, state] = await Promise.all([
      this.read.getActiveMonths(chapter.id),
      this.store.loadState(chapter.id),
    ]);
    this.validateLoadedState(chapter.id, state);

    const alreadyIssued = new Set(state.evaluations.map((e) => e.month));

    // Oldest-first, deduped, completed, non-partial, not-yet-evaluated.
    const candidates = Array.from(new Set(activeMonths))
      .filter((m) => !alreadyIssued.has(m))
      .filter((m) => this.isEvaluableMonth(chapter, m, currentMonth))
      .sort(); // 'YYYY-MM' sorts chronologically

    const ducks: Duck[] = state.ducks.map((d) => ({ ...d }));
    let tier = state.accessoryTier;
    let dirty = false;

    // Enforce "chapter starts at 1 duck" if the flock was never seeded. Runs
    // at most once (guarded by both no prior evals AND an empty flock).
    if (state.evaluations.length === 0 && ducks.length === 0) {
      ducks.push({ id: this.generateId(), name: null, earnedMonth: monthOf(chapter.startedAt) });
      dirty = true;
    }

    const issued: Array<{ evaluation: DuckEvaluation; bigWin: boolean }> = [];

    for (const month of candidates) {
      const goals = await this.evaluateGoals(month);

      // RULING (empty-month farm): dormant months are skipped, not evaluated —
      // no verdict, no gain/hold/lose. The month stays unevaluated; if activity
      // is later backdated into it, a future run evaluates it then (its verdict
      // chains from the flock as of that run — issued verdicts stay final).
      if (goals.empty) continue;

      const before = ducks.length;
      const res = this.applyLifecycle(goals.metCount, before, tier);

      if (res.outcome === 'gain') {
        ducks.push({ id: this.generateId(), name: null, earnedMonth: month });
      } else if (res.outcome === 'lose' && ducks.length > 0) {
        // RULING: LIFO loss is the official rule — the NEWEST duck leaves the
        // pond. Earliest-earned ducks (the ones users have had longest and
        // typically named) survive longest; a regained duck is always brand
        // new, never a resurrection.
        ducks.pop();
      }
      tier = res.tier;

      const evaluation: DuckEvaluation = {
        id: this.generateId(),
        chapterId: chapter.id,
        month,
        evaluatedAt: now,
        goalFixedBills: goals.goalFixedBills,
        goalVariableBudgets: goals.goalVariableBudgets,
        goalSavingsRate: goals.goalSavingsRate,
        outcome: res.outcome,
        duckCountAfter: ducks.length,
        accessoryTierAfter: tier,
        final: true,
      };
      issued.push({ evaluation, bigWin: goals.bigWin });
      dirty = true;
    }

    if (dirty) {
      await this.store.commit(chapter.id, {
        newEvaluations: issued.map((i) => i.evaluation),
        ducks,
        accessoryTier: tier,
      });
    }

    return issued;
  }

  async getFlock(): Promise<{ ducks: Duck[]; accessoryTier: number }> {
    const chapter = this.getActiveChapter();
    const state = await this.store.loadState(chapter.id);
    this.validateLoadedState(chapter.id, state);
    return { ducks: state.ducks.map((d) => ({ ...d })), accessoryTier: state.accessoryTier };
  }
}

export function createDuckEngine(deps: DuckEngineDeps): DuckEngineImpl {
  return new DuckEngineImpl(deps);
}
