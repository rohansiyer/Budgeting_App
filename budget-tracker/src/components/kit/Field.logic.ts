/**
 * Pure border-state resolution for Field, split out of Field.tsx so it can be
 * unit tested directly (see StepTrack.logic.ts for why).
 */

export type FieldBorderState = 'error' | 'focused' | 'default';

/** Error always wins (a focused, invalid field still reads as invalid). */
export function resolveFieldBorderState(focused: boolean, hasError: boolean): FieldBorderState {
  if (hasError) return 'error';
  if (focused) return 'focused';
  return 'default';
}
