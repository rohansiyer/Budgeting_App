/**
 * Ledger selector — the full drill-down behind one envelope (v0.3 handoff §3.7:
 * "Tap an envelope -> full transaction ledger, carryover history, borrow
 * record"). READ-ONLY composition over the store.
 *
 * A running balance starts at the envelope's configured budget for the period
 * and, after applying every carryover, borrow, repay and spend row in date
 * order, lands EXACTLY on the remaining figure the envelope card shows. That
 * exactness is the invariant the tests assert.
 *
 * The period window follows the category's own cadence (v0.3 §1.3):
 *
 *   - WEEKLY cadence: the Mon..Sun budget week containing periodStartISO.
 *     Start and end come straight from the store's `getEnvelopeWeekState`
 *     (the same call the weekly envelope card renders), so the ledger
 *     reconciles against exactly what the card shows.
 *
 *   - MONTHLY cadence: the budget month (weeks whose Monday falls in the
 *     calendar month, matching the store's own month attribution). The store
 *     exposes no monthly envelope-state reader, and the reworked borrow API
 *     writes monthly borrow legs at the month's first day (a non-Monday anchor
 *     that per-week reads cannot see), so the monthly remaining is derived here
 *     from primitives the store DOES expose: `getPlanVsActual(month)` supplies
 *     the configured monthly budget (planned) and the month's spend (actual),
 *     and the carryover cache supplies the month's roll/borrow/repay net. See
 *     the concerns note about the missing sync monthly-state read.
 *
 * CARRYOVER DATA ACCESS: per-entry carryover rows with their weekStart are not
 * on the store's *sync* read surface (`evaluation.getCarryoverEntries` is
 * async; `getEnvelopeWeekState` exposes only per-week aggregates). These
 * selectors must be pure and synchronous, so we read the store's committed
 * carryover cache (`getState()._carryover`) directly as read-only carryover
 * DATA — deliberately independent of the borrow *API* reworked this wave.
 */
import { useBudgetStore } from '../store';
import { addCents, cents, ZERO, type Cents } from '../lib/money';
import { weekStartOf, addDaysISO, monthKeyOf } from '../format/dates';
import type {
  CadenceType,
  CarryoverKind,
  ISODate,
  MonthKey,
  WeekStart,
} from '../types/contracts';

export type EnvelopeLedgerRowKind = 'transaction' | 'carryover' | 'borrow' | 'repay';

export interface EnvelopeLedgerRow {
  kind: EnvelopeLedgerRowKind;
  dateISO: ISODate;
  label: string;
  /** SIGNED cents: positive is money into the envelope, negative is out. */
  amountCents: Cents;
  /** Balance after this row is applied. The last row equals `endingBalanceCents`. */
  runningBalanceCents: Cents;
}

export interface EnvelopeLedger {
  categoryId: string;
  /** Period start after normalization (week Monday, or the month's first budget week). */
  periodStartISO: ISODate;
  cadence: CadenceType;
  /** Configured budget the running balance starts from. */
  startingBalanceCents: Cents;
  rows: EnvelopeLedgerRow[];
  /** Provably === the envelope card's remaining for this period. */
  endingBalanceCents: Cents;
}

/** Minimal read shape of a committed carryover cache row. */
interface CarryoverCacheRow {
  categoryId: string;
  weekStart: WeekStart;
  kind: string;
  amount: number;
  createdAt: string;
}

/**
 * Budget weeks belonging to `month` — a week belongs to the month of its
 * Monday. Mirrors the store's `weeksInMonth` so budget and spend share one
 * attribution basis.
 */
function weeksInMonth(month: MonthKey): WeekStart[] {
  let wk = weekStartOf(`${month}-01`);
  if (monthKeyOf(wk) !== month) wk = addDaysISO(wk, 7);
  const out: WeekStart[] = [];
  while (monthKeyOf(wk) === month) {
    out.push(wk);
    wk = addDaysISO(wk, 7);
  }
  return out;
}

const CARRYOVER_META: Record<
  CarryoverKind,
  { kind: EnvelopeLedgerRowKind; sign: 1 | -1; label: string }
> = {
  roll_in: { kind: 'carryover', sign: 1, label: 'Rolled in from last week' },
  roll_out: { kind: 'carryover', sign: -1, label: 'Rolled forward to next week' },
  sweep_to_savings: { kind: 'carryover', sign: -1, label: 'Swept to savings' },
  borrow_in: { kind: 'borrow', sign: 1, label: 'Borrowed from next cycle' },
  borrow_repay: { kind: 'repay', sign: -1, label: "Repaying last cycle's borrow" },
};

interface RawRow {
  kind: EnvelopeLedgerRowKind;
  dateISO: ISODate;
  label: string;
  amount: Cents; // signed
  order: string; // stable tiebreak within a date
}

/** carryover cache rows for this category whose weekStart passes `inWindow`. */
function carryoverRawRows(
  carryover: CarryoverCacheRow[],
  categoryId: string,
  inWindow: (weekStart: WeekStart) => boolean,
): RawRow[] {
  const out: RawRow[] = [];
  for (const e of carryover) {
    if (e.categoryId !== categoryId) continue;
    if (!inWindow(e.weekStart)) continue;
    const meta = CARRYOVER_META[e.kind as CarryoverKind];
    if (!meta) continue; // ignore any unknown/future kind
    out.push({
      kind: meta.kind,
      dateISO: e.weekStart,
      label: meta.label,
      amount: cents(meta.sign * e.amount),
      order: e.createdAt,
    });
  }
  return out;
}

/** expense rows for this category dated within [from, to]. */
function expenseRawRows(
  categoryId: string,
  from: ISODate,
  to: ISODate,
): RawRow[] {
  const store = useBudgetStore.getState();
  const out: RawRow[] = [];
  for (const t of store.getTransactions({ from, to })) {
    if (t.kind !== 'expense' || t.categoryId !== categoryId) continue;
    out.push({
      kind: 'transaction',
      dateISO: t.date,
      label: t.note && t.note.length > 0 ? t.note : 'Expense',
      amount: cents(-t.amount), // spend is an outflow
      order: t.id, // TransactionRecord has no createdAt; id is a stable tiebreak
    });
  }
  return out;
}

const KIND_RANK: Record<EnvelopeLedgerRowKind, number> = {
  // Budget adjustments read before spends so the balance narrates "funded, then spent".
  carryover: 0,
  borrow: 0,
  repay: 0,
  transaction: 1,
};

function orderRows(raws: RawRow[]): RawRow[] {
  return raws.slice().sort(
    (a, b) =>
      (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0) ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      (a.order < b.order ? -1 : a.order > b.order ? 1 : 0),
  );
}

/**
 * Ordered ledger for one envelope over its current period, with a running
 * balance that starts at the configured budget and ends on the card's remaining.
 */
export function envelopeLedger(
  categoryId: string,
  periodStartISO: ISODate,
): EnvelopeLedger {
  const store = useBudgetStore.getState();
  // includeArchived: a ledger is a by-id history read and must resolve an
  // archived category's cadence (else it falls back to 'weekly' and mis-spans).
  const cat = store.listCategories({ includeArchived: true }).find((c) => c.id === categoryId);
  const cadence: CadenceType = cat?.cadence ?? 'weekly';
  const carryover = (store as unknown as { _carryover: CarryoverCacheRow[] })._carryover;

  let normalizedStart: ISODate;
  let startingBalanceCents: Cents;
  let endingBalanceCents: Cents;
  let raws: RawRow[];

  if (cadence === 'monthly') {
    const month = monthKeyOf(periodStartISO);
    const weeks = weeksInMonth(month);
    normalizedStart = weeks[0] ?? weekStartOf(periodStartISO);

    // Configured monthly budget (planned) and the month's spend (actual) come
    // from the store's own month math, so `actual` equals the sum of the
    // in-span expenses exactly (both are weeksInMonth-attributed).
    const pva = store.getPlanVsActual(month).find((p) => p.categoryId === categoryId);
    startingBalanceCents = pva?.planned ?? ZERO;
    const monthSpend = pva?.actual ?? ZERO;

    const carryRows = carryoverRawRows(carryover, categoryId, (ws) => monthKeyOf(ws) === month);
    const spanFrom = weeks[0] ?? normalizedStart;
    const spanTo = addDaysISO(weeks[weeks.length - 1] ?? normalizedStart, 6);
    const spendRows = expenseRawRows(categoryId, spanFrom, spanTo);

    const carryNet = carryRows.reduce<Cents>((acc, r) => addCents(acc, r.amount), ZERO);
    endingBalanceCents = cents(startingBalanceCents + carryNet - monthSpend);
    raws = orderRows([...carryRows, ...spendRows]);
  } else {
    const week = weekStartOf(periodStartISO);
    normalizedStart = week;

    // Weekly card reads getEnvelopeWeekState directly — reconcile against it.
    const st = store.getEnvelopeWeekState(categoryId, week);
    startingBalanceCents = st.configuredBudget;
    endingBalanceCents = st.remaining;

    const carryRows = carryoverRawRows(carryover, categoryId, (ws) => ws === week);
    const spendRows = expenseRawRows(categoryId, week, addDaysISO(week, 6));
    raws = orderRows([...carryRows, ...spendRows]);
  }

  let running: Cents = startingBalanceCents;
  const rows: EnvelopeLedgerRow[] = raws.map((r) => {
    running = addCents(running, r.amount);
    return {
      kind: r.kind,
      dateISO: r.dateISO,
      label: r.label,
      amountCents: r.amount,
      runningBalanceCents: running,
    };
  });

  return {
    categoryId,
    periodStartISO: normalizedStart,
    cadence,
    startingBalanceCents,
    rows,
    endingBalanceCents,
  };
}
