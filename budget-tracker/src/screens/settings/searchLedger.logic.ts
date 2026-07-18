/**
 * Pure filter/sort/aggregate for the Search ledger subscreen (handoff v3
 * §3.8 "Search/filter"). Decoupled from the store: callers resolve a
 * minimal `LedgerSearchRow` from `TransactionRecord` + category lookups
 * (see SearchLedgerScreen.tsx) so this file has no store/UI imports and can
 * be unit-tested against plain fixtures.
 */
import { addCents, subCents, ZERO, type Cents } from '../../lib/money';
import type { ISODate } from '../../types/contracts';

export interface LedgerSearchRow {
  id: string;
  /** '' for income/transfer rows (no category attached at the store layer). */
  categoryId: string;
  /** Resolved display title (category name, or note/'Income' for income — caller's choice). */
  title: string;
  note: string | null;
  date: ISODate;
  amount: Cents;
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in';
}

export interface LedgerFilterState {
  /** Free-text query; trimmed and lower-cased internally. Empty = no text filter. */
  query: string;
  /** Selected category ids. OR within this set; empty set = no category filter (ALL). */
  categoryIds: readonly string[];
}

export interface LedgerFooter {
  count: number;
  /**
   * Sign-aware net over the FULL matched set (F5-6): income/transfer_in are
   * positive, expense/transfer_out are negative — never a bare sum of
   * `TransactionRecord.amount` (which is always positive regardless of
   * direction), which silently added spend to income into one meaningless
   * total. Mirrors the isInflow convention SearchLedgerScreen already uses
   * for row coloring.
   */
  netCents: Cents;
}

export interface FilterLedgerResult<T extends LedgerSearchRow> {
  /** Date-descending, capped at MAX_RENDER_ROWS. */
  rows: T[];
  /** True when the full matched set is larger than MAX_RENDER_ROWS. */
  truncated: boolean;
  /** Aggregate over the FULL matched set (pre-truncation). */
  footer: LedgerFooter;
}

/** Render cap for the results list; the screen shows a "showing latest N" caption when truncated. */
export const MAX_RENDER_ROWS = 200;

/**
 * Filter semantics (§3.8):
 * - Text query: case-insensitive substring match against EITHER `title` OR
 *   `note`. A hit on either field counts. Empty/whitespace-only query
 *   matches every row (no text filter).
 * - Category filter: rows are OR'd within the selected category set (any
 *   selected category matches). An empty `categoryIds` means no filter —
 *   every category passes (this is the "ALL" chip state).
 * - The text query and the category filter combine with AND.
 * - Sort: date-descending (most recent first). Rows sharing a date keep
 *   their original relative order (stable sort).
 * - The footer aggregate reflects the FULL filtered set, not the rendered
 *   (possibly truncated) slice — "N transactions, $X total" always
 *   describes everything that matched.
 */
export function filterLedger<T extends LedgerSearchRow>(
  rows: readonly T[],
  filter: LedgerFilterState,
): FilterLedgerResult<T> {
  const query = filter.query.trim().toLowerCase();
  const categorySet = new Set(filter.categoryIds);

  const matched = rows.filter((r) => {
    if (categorySet.size > 0 && !categorySet.has(r.categoryId)) return false;
    if (query === '') return true;
    const titleHit = r.title.toLowerCase().includes(query);
    const noteHit = (r.note ?? '').toLowerCase().includes(query);
    return titleHit || noteHit;
  });

  const sorted = stableSortByDateDesc(matched);

  const netCents = sorted.reduce<Cents>((acc, r) => {
    const isInflow = r.kind === 'income' || r.kind === 'transfer_in';
    return isInflow ? addCents(acc, r.amount) : subCents(acc, r.amount);
  }, ZERO);

  const footer: LedgerFooter = {
    count: sorted.length,
    netCents,
  };

  const truncated = sorted.length > MAX_RENDER_ROWS;
  const rowsOut = truncated ? sorted.slice(0, MAX_RENDER_ROWS) : sorted;

  return { rows: rowsOut, truncated, footer };
}

/** Toggles `id` in/out of a selection array without mutating the input. */
export function toggleCategoryId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
}

function stableSortByDateDesc<T extends LedgerSearchRow>(rows: readonly T[]): T[] {
  // Tag with original index before sorting so relative order for equal
  // dates is preserved regardless of the host engine's sort stability.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.date !== b.row.date) return a.row.date < b.row.date ? 1 : -1;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
