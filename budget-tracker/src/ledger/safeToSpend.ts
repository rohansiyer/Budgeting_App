/**
 * Ledger selector — the math behind safe-to-spend (v0.3 handoff §3.7, mockup
 * "Tap-down · the math behind safe-to-spend").
 *
 * READ-ONLY composition over the store, assembled the way src/ducks/appEngine.ts
 * reads it (`useBudgetStore.getState()`). Nothing here mutates; every number is
 * a decomposition of a figure the store already computes.
 *
 * PROVABLE RECONCILIATION (the load-bearing invariant, asserted in the tests):
 *
 *   sum over lines of (in − out) === store.getSafeToSpend(weekStart)
 *
 * The store's `getSafeToSpend(week)` is exactly the sum, over enveloped
 * categories, of each envelope's weekly `remaining`, and the store defines
 *
 *   remaining = configuredBudget + rolledIn + borrowedIn
 *             − rolledOut − sweptOut − repaying − spent
 *
 * (src/store/index.ts `envelopeWeekState`). This selector aggregates each of
 * those seven terms across every enveloped category and emits one line per
 * non-zero term. The lines are therefore the algebraic expansion of the store's
 * own formula, so they sum to the displayed figure by construction, not by
 * coincidence.
 *
 * BILLS RESERVATION (handoff §3.8): the store's getSafeToSpend now holds out
 * active recurring bills that fall due before the next payday. This selector
 * surfaces that as one "Reserved for upcoming bills" outflow line. It is derived
 * as the RESIDUAL — the envelope subtotal minus the store's getSafeToSpend —
 * rather than recomputing the forecast here, so the line equals exactly what the
 * store reserved and reconciliation holds by construction (no drift between two
 * copies of the bills math). Zero active bills => zero residual => no line.
 *
 * NOTE ON THE MOCKUP: the "Tap-down" mockup frames the total as
 * paycheck − bills − envelopes − savings + carryover. The paycheck-first framing
 * is still aspirational (today's shipped safe-to-spend folds in no paycheck or
 * savings term), but the reserved-bills line is now real. Rendering a +$640
 * paycheck line that the total does not actually contain would break
 * reconciliation and invent money, so this selector mirrors the real math. See
 * the concerns note for what the fuller mockup model would require.
 */
import { useBudgetStore } from '../store';
import { addCents, subCents, ZERO, type Cents } from '../lib/money';
import type { WeekStart } from '../types/contracts';

export type LedgerDirection = 'in' | 'out';

export interface SafeToSpendLine {
  /** Human label for the row (sentence case, exact amounts live in amountCents). */
  label: string;
  /** Positive magnitude; sign is carried by `direction`. */
  amountCents: Cents;
  /** 'in' adds to safe-to-spend, 'out' subtracts from it. */
  direction: LedgerDirection;
}

export interface SafeToSpendBreakdown {
  /** Non-zero lines only, ordered inflows-then-outflows. Empty when nothing funded. */
  lines: SafeToSpendLine[];
  /** Provably === store.getSafeToSpend(weekStart). */
  totalCents: Cents;
}

/** One accumulator per term of the store's `remaining` formula. */
interface Terms {
  fundedEnvelopes: Cents; // Σ configuredBudget
  rolledIn: Cents; //         Σ rolledIn
  borrowedIn: Cents; //       Σ borrowedIn
  spent: Cents; //            Σ spent
  rolledOut: Cents; //        Σ rolledOut
  sweptOut: Cents; //         Σ sweptOut
  repaying: Cents; //         Σ repaying
}

/**
 * Decompose the Home hero safe-to-spend figure for `weekStartISO` into line
 * items that provably sum to it. `weekStartISO` is passed through to the store
 * unchanged (mirroring `getSafeToSpend`, which does not normalize), so the sum
 * reconciles against `getSafeToSpend(weekStartISO)` for the exact same argument.
 */
export function safeToSpendBreakdown(weekStartISO: WeekStart): SafeToSpendBreakdown {
  const store = useBudgetStore.getState();
  const enveloped = store.listCategories().filter((c) => c.envelope !== null);

  const t: Terms = {
    fundedEnvelopes: ZERO,
    rolledIn: ZERO,
    borrowedIn: ZERO,
    spent: ZERO,
    rolledOut: ZERO,
    sweptOut: ZERO,
    repaying: ZERO,
  };

  for (const cat of enveloped) {
    const st = store.getEnvelopeWeekState(cat.id, weekStartISO);
    t.fundedEnvelopes = addCents(t.fundedEnvelopes, st.configuredBudget);
    t.rolledIn = addCents(t.rolledIn, st.rolledIn);
    t.borrowedIn = addCents(t.borrowedIn, st.borrowedIn);
    t.spent = addCents(t.spent, st.spent);
    t.rolledOut = addCents(t.rolledOut, st.rolledOut);
    t.sweptOut = addCents(t.sweptOut, st.sweptOut);
    t.repaying = addCents(t.repaying, st.repaying);
  }

  // Emit inflows first, then outflows — the order the ledger reads top to bottom.
  const candidates: SafeToSpendLine[] = [
    { label: 'Envelopes funded', amountCents: t.fundedEnvelopes, direction: 'in' },
    { label: 'Rolled in from last week', amountCents: t.rolledIn, direction: 'in' },
    { label: 'Borrowed from next week', amountCents: t.borrowedIn, direction: 'in' },
    { label: 'Spent so far this week', amountCents: t.spent, direction: 'out' },
    { label: 'Rolled forward to next week', amountCents: t.rolledOut, direction: 'out' },
    { label: 'Swept to savings', amountCents: t.sweptOut, direction: 'out' },
    { label: "Repaying last week's borrow", amountCents: t.repaying, direction: 'out' },
  ];

  const lines = candidates.filter((l) => l.amountCents !== 0);

  // Envelope subtotal = the algebraic sum of the seven envelope terms above.
  let envelopeSubtotal: Cents = ZERO;
  for (const l of lines) {
    envelopeSubtotal =
      l.direction === 'in'
        ? addCents(envelopeSubtotal, l.amountCents)
        : subCents(envelopeSubtotal, l.amountCents);
  }

  // Bills reservation is whatever the store held out of getSafeToSpend beyond
  // the envelope remaining (handoff §3.8). Deriving it as the residual keeps a
  // single source of truth for the forecast and guarantees reconciliation.
  const storeTotal = store.getSafeToSpend(weekStartISO);
  const reserved = subCents(envelopeSubtotal, storeTotal);
  if (reserved > 0) {
    lines.push({
      label: 'Reserved for upcoming bills',
      amountCents: reserved,
      direction: 'out',
    });
  }

  // Sum the final line set — including the reserved-bills line — so the emitted
  // totalCents is the honest sum of what is shown, and equals store.getSafeToSpend.
  let totalCents: Cents = ZERO;
  for (const l of lines) {
    totalCents =
      l.direction === 'in'
        ? addCents(totalCents, l.amountCents)
        : subCents(totalCents, l.amountCents);
  }

  return { lines, totalCents };
}
