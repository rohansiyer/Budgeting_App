/**
 * Pure cell-computation math for BlockMeter, extracted so it is unit-testable
 * without React (same pattern as SparkBlocks.logic.ts). No React, no store
 * reads — a deterministic function of already-read values.
 */
import { cents, formatCents, type Cents } from '../../lib/money';

export type CellKind =
  | 'empty' // unspent base budget
  | 'fill' // spent, fine (mint) — also: goal variant met/exceeded
  | 'warn' // spent, ≥ warnAt of available (amber)
  | 'over' // filled danger block (overflow) — envelope variant only
  | 'bonus-empty' // rolled-in bonus, unspent (outlined mint)
  | 'bonus-fill' // rolled-in bonus, consumed (filled, mint outline)
  | 'debt'; // hollowed danger block (repaying / borrowed against)

/** Rendered cells are capped near this count; huge budgets scale the
 * effective per-cell value instead of rendering thousands of slivers. */
export const MAX_CELLS = 40;

export interface BuildBlockMeterInput {
  budget: Cents;
  spent: Cents;
  blockValue: Cents;
  bonus?: Cents;
  debt?: Cents;
  warnAt?: number;
  variant?: 'envelope' | 'goal';
}

export interface BuildBlockMeterResult {
  cells: CellKind[];
  available: Cents;
  /** Exact (unclamped) remaining/over amount, min/now for accessibilityValue. */
  remaining: Cents;
  valueText: string;
}

/**
 * Segmented envelope/goal meter math (§3): floor(budget/effectiveBlockValue)
 * base blocks, outlined bonus blocks for rolled-in amounts, hollowed danger
 * blocks for borrow repayments, and (envelope variant only) a filled danger
 * block on overflow. The effective block value scales up once the raw block
 * count would exceed MAX_CELLS, so huge budgets never render thousands of
 * cells — purely visual; the accessibility value text stays exact-to-the-cent
 * regardless of the cell scale.
 */
export function buildBlockMeter({
  budget,
  spent,
  blockValue,
  bonus,
  debt,
  warnAt = 0.9,
  variant = 'envelope',
}: BuildBlockMeterInput): BuildBlockMeterResult {
  const bv = Math.max(1, blockValue);
  const rawBaseCount = Math.max(1, Math.floor(budget / bv));
  const scale = rawBaseCount > MAX_CELLS ? Math.ceil(rawBaseCount / MAX_CELLS) : 1;
  const effectiveBv = bv * scale;

  const baseCount = Math.max(1, Math.floor(budget / effectiveBv));
  const bonusCount = bonus && bonus > 0 ? Math.max(1, Math.round(bonus / effectiveBv)) : 0;
  const debtCount = debt && debt > 0 ? Math.max(1, Math.round(debt / effectiveBv)) : 0;

  const available = cents(budget + (bonus ?? 0));
  const spendable = baseCount + bonusCount;
  const spentBlocks =
    available > 0
      ? Math.min(spendable, Math.max(0, Math.round((spent / available) * spendable)))
      : spendable;

  const isGoal = variant === 'goal';
  const metOrExceeded = isGoal && available > 0 && spent >= available;
  const overflowed = !isGoal && spent > available;
  const warned = !overflowed && !metOrExceeded && available > 0 && spent >= warnAt * available;

  const cells: CellKind[] = [];
  for (let i = 0; i < baseCount; i++) {
    if (i < spentBlocks) cells.push(overflowed ? 'over' : warned ? 'warn' : 'fill');
    else cells.push('empty');
  }
  for (let i = 0; i < bonusCount; i++) {
    const idx = baseCount + i;
    cells.push(idx < spentBlocks ? 'bonus-fill' : 'bonus-empty');
  }
  if (overflowed) cells.push('over');
  for (let i = 0; i < debtCount; i++) cells.push('debt');

  const remaining = cents(available - spent);
  const valueText =
    remaining >= 0
      ? `${formatCents(remaining)} left of ${formatCents(available)}`
      : `${formatCents(cents(-remaining))} over ${formatCents(available)}`;

  return { cells, available, remaining, valueText };
}
