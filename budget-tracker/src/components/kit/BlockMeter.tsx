import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { buildBlockMeter, type CellKind } from './BlockMeter.logic';
import type { BlockMeterProps } from './types';

const { color, pixel } = tokens;

/**
 * Segmented envelope/goal meter (§3): floor(budget/blockValue) base blocks
 * (scaled down for huge budgets so the cell count stays legible), outlined
 * bonus blocks for rolled-in amounts, hollowed danger blocks for borrow
 * repayments, and — envelope variant only — a filled danger block on
 * overflow. 3px segment gap. Announces via accessibilityValue; host screens
 * must also mirror the color-only meaning in text.
 *
 * `variant="goal"` (default `"envelope"`): meeting/exceeding the target
 * renders in the normal fill/accent color, never the danger/over color —
 * beating a savings goal is a good outcome, not an overspend.
 */
export function BlockMeter({
  budget,
  spent,
  blockValue,
  bonus,
  debt,
  warnAt = 0.9,
  variant = 'envelope',
  accessibilityLabel,
}: BlockMeterProps) {
  const { cells, available, valueText } = buildBlockMeter({
    budget,
    spent,
    blockValue,
    bonus,
    debt,
    warnAt,
    variant,
  });

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
