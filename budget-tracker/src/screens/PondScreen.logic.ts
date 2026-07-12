/**
 * Pure day-one predicate for PondScreen (handoff v3 §3.3 "Day one"), split out
 * so it is unit testable without rendering the screen (this repo's Jest setup
 * cannot transform JSX in .tsx files).
 *
 * Day one is exactly the window the STARTER DUCK INVARIANT describes
 * (src/ducks/engine.ts): the flock holds only the starter duck AND no month
 * has ever been evaluated for the active chapter. A flock that dropped back
 * to 1 duck after a later 3/3-then-0/3 history is NOT day one, even though
 * the duck count matches, because evaluations exist.
 */

export function isDayOnePond(duckCount: number, evaluationsCount: number): boolean {
  return duckCount === 1 && evaluationsCount === 0;
}
