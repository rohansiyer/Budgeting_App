import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { formatCents } from '../../lib/money';
import { buildSparkColumns } from './SparkBlocks.logic';
import type { SparkBlocksProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * Vertical BlockMeter-style columns for multi-month trends (§3.1). One block
 * = `blockValue`, capped by `maxBlocks`; reuses BlockMeter's cell visual
 * constants rotated to a vertical stack. Discrete blocks only, never a
 * smooth bar.
 */
export function SparkBlocks({ columns, blockValue, maxBlocks, accessibilityLabel }: SparkBlocksProps) {
  const built = buildSparkColumns(columns, blockValue, maxBlocks);

  return (
    <View style={styles.root} accessibilityLabel={accessibilityLabel}>
      {built.map((col, i) => (
        <View
          key={i}
          style={styles.column}
          accessible
          accessibilityLabel={`${col.label}: ${formatCents(col.value)}`}
        >
          <View style={styles.stack}>
            {Array.from({ length: col.blockCount }, (_, blockIndex) => (
              <View
                key={blockIndex}
                style={[styles.block, blockIndex > 0 && { marginBottom: pixel.blockGap }]}
              />
            ))}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {col.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  stack: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
    width: '100%',
  },
  block: {
    height: pixel.blockHeight,
    backgroundColor: color.accent,
  },
  label: {
    marginTop: space.xs,
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
  },
});

export default SparkBlocks;
