import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { cents, formatCents } from '../../lib/money';
import type { BlockMeterProps } from './types';

const { color, pixel } = tokens;

type CellKind =
  | 'empty' // unspent base budget
  | 'fill' // spent, fine (mint)
  | 'warn' // spent, ≥ warnAt of available (amber)
  | 'over' // filled danger block (overflow)
  | 'bonus-empty' // rolled-in bonus, unspent (outlined mint)
  | 'bonus-fill' // rolled-in bonus, consumed (filled, mint outline)
  | 'debt'; // hollowed danger block (repaying / borrowed against)

/**
 * Segmented envelope meter (§3): floor(budget/blockValue) base blocks,
 * outlined bonus blocks for rolled-in amounts, hollowed danger blocks for
 * borrow repayments, and a filled danger block on overflow. 3px segment gap.
 * Announces via accessibilityValue; host screens must also mirror the
 * color-only meaning in text.
 */
export function BlockMeter({
  budget,
  spent,
  blockValue,
  bonus,
  debt,
  warnAt = 0.9,
  accessibilityLabel,
}: BlockMeterProps) {
  const bv = Math.max(1, blockValue);
  const baseCount = Math.max(1, Math.floor(budget / bv));
  const bonusCount = bonus && bonus > 0 ? Math.max(1, Math.round(bonus / bv)) : 0;
  const debtCount = debt && debt > 0 ? Math.max(1, Math.round(debt / bv)) : 0;

  const available = cents(budget + (bonus ?? 0));
  const spendable = baseCount + bonusCount;
  // How many spendable blocks the spend consumes (integer count, not money).
  const spentBlocks =
    available > 0
      ? Math.min(spendable, Math.max(0, Math.round((spent / available) * spendable)))
      : spendable;
  const overflowed = spent > available;
  const warned = !overflowed && available > 0 && spent >= warnAt * available;

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

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: available,
        now: Math.min(spent, available),
        text: valueText,
      }}
    >
      {cells.map((kind, i) => (
        <View
          key={i}
          style={[
            styles.cell,
            cellStyle(kind),
            i < cells.length - 1 && { marginRight: pixel.blockGap },
          ]}
        />
      ))}
    </View>
  );
}

function cellStyle(kind: CellKind) {
  switch (kind) {
    case 'fill':
      return { backgroundColor: color.accent, borderColor: color.accent };
    case 'warn':
      return { backgroundColor: color.warn, borderColor: color.warn };
    case 'over':
      return { backgroundColor: color.danger, borderColor: color.danger };
    case 'bonus-empty':
      return { backgroundColor: color.surfaceDeep, borderColor: color.accent };
    case 'bonus-fill':
      return { backgroundColor: color.accent, borderColor: color.text };
    case 'debt':
      return { backgroundColor: color.surfaceDeep, borderColor: color.danger };
    case 'empty':
    default:
      return { backgroundColor: color.surfaceDeep, borderColor: color.border };
  }
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: pixel.blockHeight,
  },
  cell: {
    flex: 1,
    borderWidth: pixel.hairlineWidth,
  },
});

export default BlockMeter;
