/**
 * Pure validation helpers for the GoalsScreen create form (same no-React,
 * no-store style as goalCard.logic). The target cap mirrors the store-side
 * guard in addGoal/updateGoal (GOAL_TARGET_CAP_CENTS, F4-3): the client
 * validates first for friendly inline copy, and the store throw is only a
 * backstop — the raw store error text must never reach the UI.
 */
import type { Cents } from '../../lib/money';

/** Upper bound on a goal target: $1,000,000 in cents. Must match the
 * store-side GOAL_TARGET_CAP_CENTS in src/store/index.ts. */
export const GOAL_TARGET_MAX_CENTS = 100_000_000;

/** Friendly copy for both the inline validation and the catch backstop. */
export const GOAL_TARGET_MAX_MESSAGE = 'Goal targets max out at $1,000,000.';

/**
 * Inline error for the target-amount field, or null when the value is fine.
 * A null/unparsed amount is not an error here (the submit button is simply
 * disabled until the field parses) — only a parsed amount over the cap
 * produces a message.
 */
export function goalTargetError(parsed: Cents | null): string | null {
  if (parsed !== null && parsed > GOAL_TARGET_MAX_CENTS) {
    return GOAL_TARGET_MAX_MESSAGE;
  }
  return null;
}
