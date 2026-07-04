/**
 * Ducks in a Row — shared contracts (v2 rebuild).
 *
 * CONTRACT FILE. Team 3 (Midnight / interface) authored the initial version because
 * the read/mutation surface the screens require was not yet materialised in the
 * worktree. Team 1 (store) implements `StoreContract` for real; Team 3 ships a dev
 * fake (src/dev/fakeStore.ts) so every screen boots in Expo Go today.
 *
 * Treat this as the negotiated interface between Team 1 and Team 3. Any change here
 * is a cross-team contract change — see the "contract-change proposals" section of
 * the Team 3 report.
 */

/** ISO calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

/** Stable palette keys. The concrete hex lives only in src/theme/tokens.ts. */
export type ColorKey =
  | 'rent'
  | 'food'
  | 'gas'
  | 'fun'
  | 'utilities'
  | 'car'
  | 'insurance'
  | 'other';

export type TxnKind = 'income' | 'expense';

export interface Txn {
  id: string;
  date: ISODate;
  kind: TxnKind;
  /** Positive dollar amount. Sign is carried by `kind`, never by the number. */
  amount: number;
  categoryId: string | null;
  categoryName: string;
  colorKey: ColorKey;
  accountId: string;
  note?: string;
  /** Groups the legs of a split income deposit (same parent id). */
  splitParentId?: string | null;
  /** Fixed / recurring line (rent, car payment…) — drives the calendar "coral spike". */
  isFixed?: boolean;
}

/**
 * Carryover-aware envelope state for one week.
 *  - normal   : on track, spent within plan
 *  - bonus    : carried a positive balance forward (under budget last week)
 *  - debt     : carried a negative balance forward (over budget last week)
 *  - overflow : spent past plan this week
 *  - borrowed : pulled money forward from next week
 *  - rolled   : leftover was rolled into this week by the Monday reset
 */
export type EnvelopeState =
  | 'normal'
  | 'bonus'
  | 'debt'
  | 'overflow'
  | 'borrowed'
  | 'rolled';

export interface EnvelopeWeekState {
  categoryId: string;
  name: string;
  colorKey: ColorKey;
  /** Plan for the week (already includes any rolled-in carryover). */
  planned: number;
  spent: number;
  /** planned - spent; may be negative when overflowed. */
  remaining: number;
  /** Signed carryover from the prior week (+bonus / -debt). */
  carryover: number;
  /** Amount pulled forward from next week's plan. */
  borrowedFromNext: number;
  state: EnvelopeState;
  /** Suggested number of BlockMeter segments for this envelope. */
  blocks: number;
}

export interface DaySpend {
  date: ISODate;
  spent: number;
  income: number;
  isPayday: boolean;
  hasFixedSpike: boolean;
  /** 0..1 heatmap intensity relative to the visible range. */
  intensity: number;
}

export interface SafeToSpend {
  amount: number;
  /** e.g. "left to spend this week". */
  periodLabel: string;
  perDay: number;
  daysLeft: number;
}

export interface DayKpi {
  label: string;
  value: number;
  kind: 'income' | 'spend' | 'net';
}

export interface DayDetail {
  date: ISODate;
  kpis: DayKpi[];
  transactions: Txn[];
}

export interface PlanVsActualSlice {
  categoryId: string;
  name: string;
  colorKey: ColorKey;
  planned: number;
  actual: number;
}

export interface GoalTracker {
  id: string;
  name: string;
  target: number;
  saved: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  colorKey: ColorKey;
  planned: number;
}

export interface AddExpenseInput {
  date: ISODate;
  amount: number;
  categoryId: string;
  note?: string;
  accountId?: string;
}

export interface IncomeSplitInput {
  accountId: string;
  amount: number;
}

export interface AddIncomeInput {
  date: ISODate;
  amount: number;
  note?: string;
  splits?: IncomeSplitInput[];
  accountId?: string;
}

export interface EditTxnPatch {
  amount?: number;
  note?: string;
  categoryId?: string | null;
  date?: ISODate;
}

/**
 * The read + mutation surface every screen is built against.
 * Reactivity is external-store style: call `subscribe` and re-read on change.
 */
export interface StoreContract {
  // --- reactivity ---------------------------------------------------------
  subscribe(listener: () => void): () => void;
  /** Monotonic snapshot version; changes on every mutation. */
  getVersion(): number;

  // --- meta ---------------------------------------------------------------
  getToday(): ISODate;
  getGreetingName(): string;
  getCategories(): CategoryRef[];

  // --- Home ---------------------------------------------------------------
  getSafeToSpend(anchor?: ISODate): SafeToSpend;
  getDaySpendTotals(startDate: ISODate, days: number): DaySpend[];
  getPaydays(monthAnchor: ISODate): ISODate[];
  getEnvelopeWeekState(weekAnchor?: ISODate): EnvelopeWeekState[];
  /** True on/after a Monday when the previous week has not been reset yet. */
  needsWeeklyReset(anchor?: ISODate): boolean;

  // --- Calendar -----------------------------------------------------------
  getMonthHeatmap(monthAnchor: ISODate): DaySpend[];

  // --- Daily detail -------------------------------------------------------
  getDayDetail(date: ISODate): DayDetail;

  // --- Pond ---------------------------------------------------------------
  getPlanVsActual(monthAnchor?: ISODate): PlanVsActualSlice[];
  getGoal(): GoalTracker | null;

  // --- mutations ----------------------------------------------------------
  addExpense(input: AddExpenseInput): void;
  addIncome(input: AddIncomeInput): void;
  editTransaction(id: string, patch: EditTxnPatch): void;
  /** Returns the removed transaction so the UI can offer an undo. */
  deleteTransaction(id: string): Txn | null;
  restoreTransaction(txn: Txn): void;
  rollForward(weekAnchor?: ISODate): void;
  sweepToSavings(weekAnchor?: ISODate): void;
  borrowFromNextWeek(categoryId: string, amount: number): void;

  // --- pure helpers -------------------------------------------------------
  /** Parse user-typed money. Returns null for anything not a valid amount. */
  parseDecimal(text: string): number | null;
  formatMoney(amount: number): string;
}

/**
 * Duck sprite contract — OWNED BY TEAM 4. Declared here only so Team 3's slot
 * placeholders (DuckChipSlot, PondCenterSlot) can type the children they accept.
 * Team 4 replaces the placeholder renderers at merge; this prop shape is the seam.
 */
export type DuckMood = 'idle' | 'happy' | 'worried' | 'celebrate' | 'sleep';

export interface DuckSpriteProps {
  mood?: DuckMood;
  size?: number;
  reducedMotion?: boolean;
}
