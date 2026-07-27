/**
 * Pure column-to-block math for SparkBlocks, split out of SparkBlocks.tsx so
 * it can be unit tested directly (see StepTrack.logic.ts for why this repo
 * splits testable logic out of .tsx files).
 */
import type { Cents } from '../../lib/money';
import type { SparkColumn } from './types';

export interface SparkColumnBlocks {
  label: string;
  value: Cents;
  /** Number of filled blocks to render, already clamped to [0, maxBlocks]. */
  blockCount: number;
}

/**
 * One block = `blockValue`. Negative values (rare, e.g. a refund month)
 * floor to zero blocks rather than rendering a negative-height column.
 * `maxBlocks` caps a single outlier so the rest of the trend stays legible.
 */
export function buildSparkColumns(
  columns: readonly SparkColumn[],
  blockValue: Cents,
  maxBlocks?: number,
): SparkColumnBlocks[] {
  const bv = Math.max(1, blockValue);
  return columns.map(({ label, value }) => {
    const raw = value > 0 ? Math.round(value / bv) : 0;
    const blockCount = maxBlocks !== undefined ? Math.min(raw, Math.max(0, maxBlocks)) : raw;
    return { label, value, blockCount };
  });
}
