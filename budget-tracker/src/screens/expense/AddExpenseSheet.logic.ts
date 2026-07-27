/**
 * Pure logic behind the amount-first add-expense flow (v0.3 handoff §3.4,
 * mockups "Add expense · amount-first" and "Borrow prompt"). Split out of
 * AddExpenseSheet.tsx so it is unit-testable without rendering JSX (this
 * repo's Jest setup cannot transform .tsx — see CLAUDE.md).
 *
 * Money never touches parseFloat here: the keypad accumulates a raw digit
 * string and converts it to Cents via parseInt only (money.ts contract).
 */
import { addDaysISO } from '../../format/dates';
import { cents, formatCents, negCents, subCents, ZERO, type Cents } from '../../lib/money';
import type { CadenceType, CategoryConfig, DateRange, ISODate } from '../../types/contracts';

// --- keypad: integer-cents digit accumulation -------------------------------

/** Caps the raw digit string at $9,999,999.99 so amounts stay sane. */
export const MAX_AMOUNT_DIGITS = 9;

/**
 * Append typed digits (a single key, or the "00" key) to the raw accumulator.
 * Combined length beyond MAX_AMOUNT_DIGITS is truncated, i.e. once at the cap
 * further keystrokes are no-ops (never wraps or throws).
 */
export function appendDigits(raw: string, input: string, maxDigits: number = MAX_AMOUNT_DIGITS): string {
  const combined = raw + input;
  return combined.length > maxDigits ? combined.slice(0, maxDigits) : combined;
}

/** Backspace: drop the last typed digit. Backspacing an empty string is a no-op. */
export function backspaceDigits(raw: string): string {
  return raw.slice(0, -1);
}

/** Raw digit string -> Cents. Empty string is $0.00. Never parseFloat. */
export function digitsToCents(raw: string): Cents {
  if (raw === '') return ZERO;
  return cents(parseInt(raw, 10));
}

// --- live feedback -----------------------------------------------------------

export interface LiveFeedback {
  /** e.g. "Food: $26.60 left after this" or "Food: $13.60 over after this". */
  text: string;
  /** True when the draft would take the envelope negative — render in `danger`. */
  danger: boolean;
  /** remainingCents − draftCents; may be negative. */
  remainingAfter: Cents;
}

/** The live envelope-math line shown beneath the amount display, per keystroke. */
export function liveFeedback(categoryName: string, remainingCents: Cents, draftCents: Cents): LiveFeedback {
  const remainingAfter = subCents(remainingCents, draftCents);
  const danger = remainingAfter < 0;
  const text = danger
    ? `${categoryName}: ${formatCents(negCents(remainingAfter))} over after this`
    : `${categoryName}: ${formatCents(remainingAfter)} left after this`;
  return { text, danger, remainingAfter };
}

// --- borrow prompt ------------------------------------------------------------

/** Whether the draft amount would overspend the envelope's current remaining. */
export function shouldPromptBorrow(remainingCents: Cents, draftCents: Cents): boolean {
  return draftCents > remainingCents;
}

/** The positive amount that would need to be borrowed; ZERO when not overspending. */
export function overspendAmount(remainingCents: Cents, draftCents: Cents): Cents {
  const over = draftCents - remainingCents;
  return over > 0 ? cents(over) : ZERO;
}

/** 'weekly' cadence borrows from next week, 'monthly' from next month. */
export function cadenceCycleNoun(cadence: CadenceType): 'week' | 'month' {
  return cadence === 'monthly' ? 'month' : 'week';
}

export interface BorrowPromptCopy {
  /** "Fun is $13.60 over this week" */
  headline: string;
  /** "Pull budget forward from Fun's next cycle? ..." */
  body: string;
  /** "Borrow $13.60 from next week" */
  primaryLabel: string;
  /** "Not now" — always the same, no em dash, second person not needed (a button). */
  ghostLabel: string;
}

/**
 * The shared "honest math" consequence line for BOTH borrow entry points
 * (Home's manual BorrowSheet and this auto-triggered overspend prompt) — the
 * uncapped borrow's one guardrail is that the next cycle's reduced start is
 * always on screen before the user commits (handoff v3 §1.2). Kept as one
 * function so the wording can never drift between the two screens.
 */
export function nextCycleConsequenceLine(
  cadence: CadenceType,
  amount: Cents,
  nextCycleStartsWith: Cents,
): string {
  const noun = cadenceCycleNoun(cadence);
  const afterBorrow = subCents(nextCycleStartsWith, amount);
  return `Next ${noun} would start with ${formatCents(afterBorrow)} instead of ${formatCents(nextCycleStartsWith)}.`;
}

/**
 * Copy for the inline borrow-prompt PixelBox. `nextCycleStartsWith` is the
 * next cycle's plan money BEFORE the contemplated borrow (StoreContract's
 * `nextCycleStartState(...).startsWith`); the body previews what it would
 * start with AFTER subtracting the overspend, so the honest math is always
 * on screen (handoff v3 §1.2, "the guardrail is honest math").
 */
export function borrowPromptCopy(input: {
  categoryName: string;
  cadence: CadenceType;
  overspend: Cents;
  nextCycleStartsWith: Cents;
}): BorrowPromptCopy {
  const { categoryName, cadence, overspend, nextCycleStartsWith } = input;
  const noun = cadenceCycleNoun(cadence);
  return {
    headline: `${categoryName} is ${formatCents(overspend)} over this ${noun}`,
    body:
      `Pull budget forward from ${categoryName}'s next cycle? ${categoryName} runs ${cadence} for you. ` +
      nextCycleConsequenceLine(cadence, overspend, nextCycleStartsWith),
    primaryLabel: `Borrow ${formatCents(overspend)} from next ${noun}`,
    ghostLabel: 'Not now',
  };
}

// --- confirm + validity --------------------------------------------------------

/** "Add $12.40 to Food" — the primary button always names the action (§3.4). */
export function confirmLabel(categoryName: string, draftCents: Cents): string {
  return `Add ${formatCents(draftCents)} to ${categoryName}`;
}

/** Confirm is disabled until an amount is entered and a category is chosen. */
export function isValidDraft(draftCents: Cents, categoryId: string): boolean {
  return draftCents > 0 && categoryId !== '';
}

// --- recent categories ---------------------------------------------------------

/** [asOfDate − (windowDays − 1), asOfDate] inclusive — a 14-day trailing window. */
export function recentWindowRange(asOfDate: ISODate, windowDays = 14): DateRange {
  return { from: addDaysISO(asOfDate, -(windowDays - 1)), to: asOfDate };
}

/**
 * The 4 recent-category one-tap squares: most-used category (by expense
 * count) in the trailing window first, ties broken by first-seen order.
 * Categories with no recent activity fill remaining slots from the
 * enveloped list (in store order) so the picker never shows fewer than
 * `limit` when enough spendable categories exist. Falls back entirely to
 * the first `limit` enveloped categories when nothing recent fired.
 */
export function recentCategories(
  categories: readonly CategoryConfig[],
  recentExpenseCategoryIds: readonly string[],
  limit = 4,
): CategoryConfig[] {
  const counts = new Map<string, number>();
  const firstSeenOrder: string[] = [];
  for (const id of recentExpenseCategoryIds) {
    if (!counts.has(id)) firstSeenOrder.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const byId = new Map(categories.map((c) => [c.id, c] as const));
  const ranked = firstSeenOrder
    .filter((id) => byId.has(id))
    .sort((a, b) => {
      const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      return diff !== 0 ? diff : firstSeenOrder.indexOf(a) - firstSeenOrder.indexOf(b);
    });

  const result: CategoryConfig[] = [];
  for (const id of ranked) {
    if (result.length >= limit) break;
    const cat = byId.get(id);
    if (cat) result.push(cat);
  }

  if (result.length < limit) {
    for (const c of categories) {
      if (result.length >= limit) break;
      if (c.envelope === null) continue;
      if (result.some((r) => r.id === c.id)) continue;
      result.push(c);
    }
  }

  return result;
}

// --- post-commit snackbar --------------------------------------------------------

/**
 * Snackbar message after committing. When a borrow happened in the same
 * confirm, undo can only remove the expense (there is no store API to
 * reverse a borrow's carryover pair), so the message says so up front
 * rather than overpromising (§4 copy rules: never invent capability).
 */
export function commitSnackbarMessage(categoryName: string, amount: Cents, borrowed: boolean): string {
  const base = `Added ${formatCents(amount)} to ${categoryName}.`;
  return borrowed ? `${base} Undo removes the expense but keeps the borrow.` : base;
}
