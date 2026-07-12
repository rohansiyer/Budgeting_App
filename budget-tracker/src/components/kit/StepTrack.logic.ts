/**
 * Pure block-fill math for StepTrack, split out of StepTrack.tsx so it can be
 * unit tested directly (this repo's Jest setup cannot transform JSX in .tsx
 * files, so any test importing a component module fails at parse time; see
 * kit/__tests__ for the rest of the story).
 */

/** Clamp `completed` into [0, total] and `total` down to a non-negative int. */
export function buildStepBlocks(total: number, completed: number): boolean[] {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const safeCompleted = Number.isFinite(completed)
    ? Math.min(safeTotal, Math.max(0, Math.floor(completed)))
    : 0;
  return Array.from({ length: safeTotal }, (_, i) => i < safeCompleted);
}
